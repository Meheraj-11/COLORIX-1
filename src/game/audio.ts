import { COLOR_MAP, type ActiveColor } from './colors';
import type { GameSettings } from './types';

const RESOLVED_BASE_URL =
  typeof import.meta !== 'undefined' &&
  typeof (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL === 'string'
    ? (import.meta as { env: { BASE_URL: string } }).env.BASE_URL
    : '/';

export const BGM_TRACK_URL = `${
  RESOLVED_BASE_URL.endsWith('/') ? RESOLVED_BASE_URL : `${RESOLVED_BASE_URL}/`
}assets/audio/colorix-theme.mp3`;

export interface MusicStatusSnapshot {
  src: string;
  instanceCount: number;
  initialized: boolean;
  playing: boolean;
  paused: boolean;
  loop: boolean;
  muted: boolean;
  volume: number;
  currentTime: number;
  readyState: number;
  hasError: boolean;
  errorMessage: string | null;
  musicEnabled: boolean;
  awaitingInteraction: boolean;
}

export interface MusicLoadResult {
  ok: boolean;
  error?: string;
}

export function describeMediaError(audio: HTMLAudioElement): string {
  const err = audio.error;
  if (!err) {
    return 'Background music could not be loaded right now.';
  }
  switch (err.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Background music loading was interrupted. Tap Retry Audio to try again.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Network error while streaming the background music track. Check your connection and retry.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'The browser could not decode the background music stream. Tap Retry Audio to try again.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Background music stream was unavailable or unsupported by this browser. Tap Retry Audio to try again.';
    default:
      return 'Background music failed to stream. Tap Retry Audio to try again.';
  }
}

export function isValidMp3Bytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // ID3v2 tag header ("ID3")
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  // Raw MPEG frame sync (11 set bits: 0xFF followed by 0xE0..0xFF, excluding invalid 0xFF 0xFF)
  for (let i = 0; i < Math.min(bytes.length - 1, 64); i++) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0 && bytes[i + 1] !== 0xff) {
      return true;
    }
  }
  return false;
}

export function diagnoseInvalidAudioPayload(bytes: Uint8Array): string {
  const sample = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 128)).trimStart();
  if (/^<!doctype|^<html/i.test(sample)) {
    return 'The audio URL returned an HTML page instead of the MP3 file. Verify public/assets/audio/colorix-theme.mp3 is deployed.';
  }
  if (sample.startsWith('version https://git-lfs.github.com')) {
    return 'The deployed MP3 file is a Git LFS pointer instead of audio data. Commit the raw MP3 file directly to GitHub.';
  }
  return 'The deployed MP3 file could not be decoded (file data appears corrupted during upload/sync). Re-commit public/assets/audio/colorix-theme.mp3 in binary mode.';
}

export function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function computeEffectiveMusicVolume(
  settings: Pick<GameSettings, 'masterVolume' | 'musicVolume' | 'musicEnabled' | 'muted'>,
): number {
  if (settings.muted || !settings.musicEnabled) return 0;
  const master = Number.isFinite(settings.masterVolume) ? Math.max(0, Math.min(1, settings.masterVolume)) : 0.8;
  const music = Number.isFinite(settings.musicVolume) ? Math.max(0, Math.min(1, settings.musicVolume)) : 0.55;
  return Math.max(0, Math.min(1, master * music));
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Strict singleton background music player using the exact uploaded MP3 track
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmBlobUrl: string | null = null;
  private bgmInstanceCount = 0;
  private bgmInitialized = false;
  private bgmError: string | null = null;
  private bgmPreloadPromise: Promise<MusicLoadResult> | null = null;
  private awaitingInteraction = false;
  private interactionListenersBound = false;
  private unloadListenersBound = false;
  private hasUserInteracted = false;

  private settings: GameSettings = {
    masterVolume: 0.8,
    musicVolume: 0.55,
    musicEnabled: true,
    sfxVolume: 0.85,
    muted: false,
    graphicsQuality: 'high',
    controlScheme: 'wasd',
    touchMode: 'auto',
    language: 'en',
    fullscreen: false,
  };
  private unlocked = false;

  private readonly handleFirstInteraction = (): void => {
    this.hasUserInteracted = true;
    this.unlockSfxContext();
    if (this.settings.musicEnabled && !this.bgmError) {
      this.tryPlayBgm();
    }
  };

  private readonly handleSessionExit = (): void => {
    if (this.bgmAudio && !this.bgmAudio.paused) {
      this.bgmAudio.pause();
    }
    this.revokeBlobUrl();
  };

  private revokeBlobUrl(): void {
    if (this.bgmBlobUrl) {
      try {
        URL.revokeObjectURL(this.bgmBlobUrl);
      } catch {
        // Ignore revoke errors
      }
      this.bgmBlobUrl = null;
    }
  }

  private readonly handleBgmEndedFallback = (): void => {
    // Safety fallback for mobile browsers where native loop can occasionally pause at EOF
    if (!this.bgmAudio || !this.settings.musicEnabled || this.bgmError) return;
    this.bgmAudio.currentTime = 0;
    this.tryPlayBgm();
  };

  /**
   * Lazily creates the strict singleton HTMLAudioElement once without forcing premature play()
   * or aborting in-flight preload fetches.
   */
  private ensureBgmElement(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

    if (!this.bgmAudio) {
      const audio = new Audio();
      audio.loop = true;
      audio.preload = 'metadata';
      audio.setAttribute('playsinline', '');
      audio.setAttribute('webkit-playsinline', '');
      audio.addEventListener('ended', this.handleBgmEndedFallback);
      audio.addEventListener('playing', () => {
        this.bgmError = null;
        this.awaitingInteraction = false;
        this.unbindInteractionListeners();
      });
      audio.addEventListener('canplay', () => {
        if (!audio.error) {
          this.bgmError = null;
        }
      });

      this.bgmAudio = audio;
      this.bgmInstanceCount = 1;
      this.bgmInitialized = true;
      this.applyBgmVolumeOnly();

      if (!this.unloadListenersBound) {
        window.addEventListener('beforeunload', this.handleSessionExit);
        window.addEventListener('pagehide', this.handleSessionExit);
        this.unloadListenersBound = true;
      }

      // Expose read-only diagnostic accessor for automated browser verification (never rendered in UI)
      (window as unknown as { __COLORIX_AUDIO__?: { getMusicStatus: () => MusicStatusSnapshot } }).__COLORIX_AUDIO__ = {
        getMusicStatus: () => this.getMusicStatus(),
      };
    }

    return this.bgmAudio;
  }

  public initBackgroundMusic(): void {
    const audio = this.ensureBgmElement();
    if (!audio) return;

    if (!audio.getAttribute('src')) {
      audio.src = BGM_TRACK_URL;
    }

    this.applyBgmSettings();

    if (this.settings.musicEnabled && !this.bgmError && audio.paused) {
      this.tryPlayBgm();
    }
  }

  /**
   * Verifies and prepares the optional background music track using the strict singleton
   * HTMLAudioElement. Deduplicates concurrent calls (e.g. React StrictMode) and never throws
   * unhandled errors so the game can always enter the Main Menu cleanly even if audio fails.
   */
  public preloadAndVerifyBackgroundMusic(timeoutMs = 8000, forceReload = false): Promise<MusicLoadResult> {
    if (typeof window === 'undefined') {
      return Promise.resolve({ ok: true });
    }
    if (!forceReload && this.bgmPreloadPromise) {
      return this.bgmPreloadPromise;
    }

    const run = async (): Promise<MusicLoadResult> => {
      // Arm early gesture listeners immediately so even a click during initial load unlocks music
      if (this.settings.musicEnabled && !this.hasUserInteracted) {
        this.bindInteractionListeners();
      }

      const audio = this.ensureBgmElement();
      if (!audio) {
        const msg = 'Browser audio playback is unavailable in this environment.';
        this.bgmError = msg;
        return { ok: false, error: msg };
      }

      this.applyBgmVolumeOnly();

      // Already loaded cleanly and not forcing a retry reload
      if (!forceReload && audio.readyState >= HTMLMediaElement.HAVE_METADATA && !audio.error) {
        this.bgmError = null;
        if (this.settings.musicEnabled && audio.paused) {
          this.tryPlayBgm();
        }
        return { ok: true };
      }

      // Helper: load any URL (direct or blob:) into the strict singleton HTMLAudioElement
      const loadSourceIntoSingleton = (
        targetSrc: string,
        waitMs: number,
        forceAssign: boolean,
      ): Promise<MusicLoadResult> =>
        new Promise<MusicLoadResult>((resolve) => {
          let settled = false;
          const cleanup = () => {
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('loadeddata', onReady);
            audio.removeEventListener('canplay', onReady);
            audio.removeEventListener('error', onError);
            window.clearTimeout(timerId);
          };

          const onReady = () => {
            if (settled) return;
            settled = true;
            cleanup();
            this.bgmError = null;
            resolve({ ok: true });
          };

          const onError = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve({ ok: false, error: describeMediaError(audio) });
          };

          const timerId = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve({
              ok: false,
              error: 'Background music took too long to buffer. You can play now or retry audio anytime.',
            });
          }, waitMs);

          audio.addEventListener('loadedmetadata', onReady, { once: true });
          audio.addEventListener('loadeddata', onReady, { once: true });
          audio.addEventListener('canplay', onReady, { once: true });
          audio.addEventListener('error', onError, { once: true });

          const currentAttr = audio.getAttribute('src');
          if (forceAssign || currentAttr !== targetSrc || audio.error) {
            audio.src = targetSrc;
            if (currentAttr === targetSrc) {
              audio.load();
            }
          } else if (audio.readyState >= HTMLMediaElement.HAVE_METADATA && !audio.error) {
            onReady();
          } else if (audio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
            audio.load();
          }
        });

      // 1. Fast reachability probe on the deployed static MP3 URL
      let staticAssetReachable = false;
      let lastError = `Could not reach the background music file (${BGM_TRACK_URL}).`;
      try {
        let probeResponse = await fetch(BGM_TRACK_URL, { method: 'HEAD', cache: 'no-store' });
        if (probeResponse.status === 405) {
          probeResponse = await fetch(BGM_TRACK_URL, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
            cache: 'no-store',
          });
        }
        const contentType = (probeResponse.headers.get('content-type') || '').toLowerCase();
        if (probeResponse.ok && !contentType.includes('text/html')) {
          staticAssetReachable = true;
        } else if (!probeResponse.ok) {
          lastError = `Background music file returned HTTP ${probeResponse.status}.`;
        } else {
          lastError = `Background music URL (${BGM_TRACK_URL}) returned HTML instead of MP3 audio.`;
        }
      } catch {
        lastError = `Could not reach the background music file (${BGM_TRACK_URL}).`;
      }

      let loadOutcome: MusicLoadResult = { ok: false, error: lastError };

      // Tier 1: Direct streaming via standard HTMLAudioElement URL (zero extra bundle download)
      if (staticAssetReachable) {
        loadOutcome = await loadSourceIntoSingleton(
          BGM_TRACK_URL,
          Math.min(timeoutMs, 5000),
          forceReload || !audio.getAttribute('src'),
        );
      }

      // Tier 2: Automatic fetch() -> validated Blob URL fallback when iframe/proxy/Range quirks block direct <audio>
      if (!loadOutcome.ok && staticAssetReachable) {
        try {
          const resp = await fetch(BGM_TRACK_URL, {
            credentials: 'same-origin',
            cache: 'force-cache',
          });
          if (resp.ok) {
            const buffer = await resp.arrayBuffer();
            const headBytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 256));
            if (isValidMp3Bytes(headBytes)) {
              this.revokeBlobUrl();
              const blob = new Blob([buffer], { type: 'audio/mpeg' });
              const blobUrl = URL.createObjectURL(blob);
              this.bgmBlobUrl = blobUrl;
              loadOutcome = await loadSourceIntoSingleton(blobUrl, Math.min(timeoutMs, 5000), true);
            } else {
              loadOutcome = { ok: false, error: diagnoseInvalidAudioPayload(headBytes) };
            }
          } else {
            loadOutcome = { ok: false, error: `Background music file returned HTTP ${resp.status}.` };
          }
        } catch {
          // Proceed cleanly to Tier 3 bundled fallback
        }
      }

      // Tier 3: Lazy-loaded bundled copy of the exact uploaded MP3 (immune to GitHub/Vercel binary omission or 404s)
      if (!loadOutcome.ok) {
        try {
          const { COLORIX_THEME_MP3_BASE64 } = await import('./colorixThemeData');
          const bytes = decodeBase64ToUint8Array(COLORIX_THEME_MP3_BASE64);
          if (isValidMp3Bytes(bytes)) {
            this.revokeBlobUrl();
            const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/mpeg' });
            const blobUrl = URL.createObjectURL(blob);
            this.bgmBlobUrl = blobUrl;
            loadOutcome = await loadSourceIntoSingleton(blobUrl, Math.min(timeoutMs, 6000), true);
          }
        } catch {
          // Keep last diagnostic error if bundled fallback also cannot load
        }
      }

      if (!loadOutcome.ok) {
        this.bgmError = loadOutcome.error || lastError;
        return { ok: false, error: this.bgmError };
      }

      this.bgmError = null;
      if (this.settings.musicEnabled && audio.paused) {
        this.tryPlayBgm();
      }
      return { ok: true };
    };

    const promise = run().finally(() => {
      if (this.bgmPreloadPromise === promise) {
        this.bgmPreloadPromise = null;
      }
    });
    this.bgmPreloadPromise = promise;
    return promise;
  }

  /**
   * Explicitly retries loading and starting the singleton background music track
   * (triggered from a user click on "Retry Audio", so autoplay permission is active).
   */
  public async retryBackgroundMusic(timeoutMs = 8000): Promise<MusicLoadResult> {
    this.hasUserInteracted = true;
    this.unlockSfxContext();
    this.bgmError = null;
    this.bgmPreloadPromise = null;

    const result = await this.preloadAndVerifyBackgroundMusic(timeoutMs, true);
    if (result.ok && this.settings.musicEnabled) {
      this.tryPlayBgm();
    }
    return result;
  }

  private bindInteractionListeners(): void {
    if (this.interactionListenersBound || typeof window === 'undefined') return;
    this.interactionListenersBound = true;
    window.addEventListener('pointerdown', this.handleFirstInteraction, { passive: true });
    window.addEventListener('touchstart', this.handleFirstInteraction, { passive: true });
    window.addEventListener('click', this.handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', this.handleFirstInteraction, { passive: true });
  }

  private unbindInteractionListeners(): void {
    if (!this.interactionListenersBound || typeof window === 'undefined') return;
    this.interactionListenersBound = false;
    window.removeEventListener('pointerdown', this.handleFirstInteraction);
    window.removeEventListener('touchstart', this.handleFirstInteraction);
    window.removeEventListener('click', this.handleFirstInteraction);
    window.removeEventListener('keydown', this.handleFirstInteraction);
  }

  private tryPlayBgm(): void {
    if (!this.bgmAudio || !this.settings.musicEnabled || this.bgmError) return;
    // Never restart or seek if already playing continuously
    if (!this.bgmAudio.paused) {
      this.awaitingInteraction = false;
      this.unbindInteractionListeners();
      return;
    }

    this.applyBgmVolumeOnly();

    try {
      const playPromise = this.bgmAudio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            this.awaitingInteraction = false;
            this.unbindInteractionListeners();
          })
          .catch(() => {
            // Browser blocked autoplay before user interaction — start on very first valid gesture
            this.awaitingInteraction = true;
            this.bindInteractionListeners();
          });
      }
    } catch {
      this.awaitingInteraction = true;
      this.bindInteractionListeners();
    }
  }

  private applyBgmVolumeOnly(): void {
    if (!this.bgmAudio) return;
    const effectiveVolume = computeEffectiveMusicVolume(this.settings);
    this.bgmAudio.volume = effectiveVolume;
    this.bgmAudio.muted = this.settings.muted || !this.settings.musicEnabled;
  }

  private applyBgmSettings(): void {
    if (!this.bgmAudio) return;
    this.applyBgmVolumeOnly();

    if (!this.settings.musicEnabled) {
      // Pause without resetting currentTime so re-enabling resumes smoothly
      if (!this.bgmAudio.paused) {
        this.bgmAudio.pause();
      }
      this.awaitingInteraction = false;
      return;
    }

    // Music is enabled: if loaded and paused, resume cleanly from current position (never reset to 0)
    if (
      !this.bgmError &&
      this.bgmAudio.readyState >= HTMLMediaElement.HAVE_METADATA &&
      this.bgmAudio.paused &&
      (this.hasUserInteracted || this.bgmInitialized)
    ) {
      this.tryPlayBgm();
    }
  }

  public getMusicStatus(): MusicStatusSnapshot {
    const audio = this.bgmAudio;
    return {
      src: audio ? audio.src : '',
      instanceCount: this.bgmInstanceCount,
      initialized: this.bgmInitialized,
      playing: Boolean(audio && !audio.paused && !audio.ended),
      paused: audio ? audio.paused : true,
      loop: audio ? audio.loop : false,
      muted: audio ? audio.muted : true,
      volume: audio ? audio.volume : 0,
      currentTime: audio ? audio.currentTime : 0,
      readyState: audio ? audio.readyState : 0,
      hasError: Boolean((audio && audio.error) || this.bgmError),
      errorMessage: this.bgmError,
      musicEnabled: this.settings.musicEnabled,
      awaitingInteraction: this.awaitingInteraction,
    };
  }

  public applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.updateSfxGains();
    this.applyBgmSettings();
  }

  private unlockSfxContext(): void {
    if (this.unlocked && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.unlocked = true;
      this.updateSfxGains();
    } catch {
      // Web Audio SFX remains gracefully disabled if unavailable
    }
  }

  public unlock(): void {
    this.hasUserInteracted = true;
    this.unlockSfxContext();
    this.initBackgroundMusic();
    if (this.settings.musicEnabled && this.bgmAudio && this.bgmAudio.paused) {
      this.tryPlayBgm();
    }
  }

  private updateSfxGains(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const m = this.settings.muted ? 0 : this.settings.masterVolume;
    this.masterGain.gain.setTargetAtTime(m, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume * 0.55, now, 0.03);
  }

  /**
   * Kept for screen/level transition compatibility.
   * Background music intentionally continues uninterrupted across menus, levels, and pause states.
   */
  public setAmbientMode(_mode: 'menu' | 'world' | 'paused', _worldId = 1): void {
    // Do not pause, stop, duck, or restart background music during screen or level transitions.
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    if (this.settings.muted || this.settings.sfxVolume <= 0.01) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
    }

    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(volume, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(env);
    env.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  public playJump(isDouble = false): void {
    const jitter = 0.94 + Math.random() * 0.12;
    if (isDouble) {
      this.playTone(420 * jitter, 740 * jitter, 0.14, 'triangle', 0.22);
      this.playTone(620 * jitter, 980 * jitter, 0.12, 'sine', 0.15, 0.03);
    } else {
      this.playTone(230 * jitter, 460 * jitter, 0.13, 'triangle', 0.24);
    }
  }

  public playLand(impactStrength = 0.5): void {
    const vol = Math.min(0.28, 0.09 + impactStrength * 0.16);
    this.playTone(135, 62, 0.08, 'sine', vol);
  }

  public playColorSwitch(color: ActiveColor): void {
    const base = color === 'void' ? 210 : COLOR_MAP[color].pitchHz;
    this.playTone(base * 0.95, base * 1.02, 0.14, 'sine', 0.2);
    this.playTone(base * 1.5, base * 1.52, 0.16, 'triangle', 0.11, 0.02);
  }

  public playCrystal(): void {
    this.playTone(587.33, 587.33, 0.12, 'sine', 0.22, 0);
    this.playTone(880, 880, 0.14, 'triangle', 0.2, 0.055);
    this.playTone(1174.66, 1318.5, 0.22, 'sine', 0.22, 0.11);
  }

  public playLockStep(step: number): void {
    const freq = 330 * Math.pow(1.18, step);
    this.playTone(freq, freq * 1.04, 0.16, 'triangle', 0.24);
  }

  public playGateUnlock(): void {
    this.playTone(329.63, 329.63, 0.18, 'triangle', 0.2, 0);
    this.playTone(440, 440, 0.2, 'triangle', 0.2, 0.06);
    this.playTone(659.25, 659.25, 0.34, 'sine', 0.24, 0.12);
  }

  public playCheckpoint(): void {
    this.playTone(392, 523.25, 0.18, 'sine', 0.2, 0);
    this.playTone(523.25, 783.99, 0.26, 'triangle', 0.18, 0.07);
  }

  public playDeath(): void {
    this.playTone(280, 95, 0.24, 'sawtooth', 0.16, 0);
    this.playTone(190, 68, 0.28, 'triangle', 0.18, 0.05);
  }

  public playLevelComplete(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.01, 0.3, idx % 2 === 0 ? 'triangle' : 'sine', 0.22, idx * 0.085);
    });
  }

  public playColorBlast(color: ActiveColor): void {
    const base = color === 'void' ? 320 : COLOR_MAP[color].pitchHz;
    this.playTone(base * 1.4, base * 0.62, 0.16, 'triangle', 0.24, 0);
    this.playTone(base * 2.1, base * 1.1, 0.12, 'sine', 0.16, 0.02);
  }

  public playMonsterDefeat(viaStomp: boolean): void {
    if (viaStomp) {
      this.playTone(190, 90, 0.09, 'square', 0.16, 0);
      this.playTone(340, 680, 0.16, 'triangle', 0.22, 0.04);
      this.playTone(540, 880, 0.14, 'sine', 0.18, 0.08);
    } else {
      this.playTone(460, 220, 0.12, 'sawtooth', 0.14, 0);
      this.playTone(587.33, 987.77, 0.2, 'triangle', 0.22, 0.04);
      this.playTone(880, 1318.5, 0.18, 'sine', 0.16, 0.09);
    }
  }

  public playBlastDeflect(): void {
    this.playTone(720, 510, 0.09, 'triangle', 0.16, 0);
    this.playTone(960, 640, 0.07, 'sine', 0.12, 0.025);
  }

  public playUiClick(): void {
    this.playTone(520, 640, 0.06, 'sine', 0.14);
  }
}

export const audioManager = new AudioManager();
