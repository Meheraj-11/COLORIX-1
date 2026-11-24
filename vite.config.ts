import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

const ROOT_DIR = import.meta.dirname;
const AUDIO_RANGE_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB per 206 chunk (contiguous for 5.8 MB track, safely below 32 MiB proxy caps)

function resolveAudioAssetPath(reqUrl: string): string | null {
  const pathname = reqUrl.split('?')[0];
  if (!pathname.startsWith('/assets/audio/') || !pathname.endsWith('.mp3')) {
    return null;
  }
  const relName = pathname.slice('/assets/audio/'.length);
  if (!relName || relName.includes('..') || relName.includes('\\') || relName.includes('/')) {
    return null;
  }
  const candidates = [
    path.resolve(ROOT_DIR, 'public/assets/audio', relName),
    path.resolve(ROOT_DIR, 'assets/audio', relName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function handleChunkedAudioRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const method = req.method?.toUpperCase();
  if ((method !== 'GET' && method !== 'HEAD') || !req.url) {
    next();
    return;
  }

  const filePath = resolveAudioAssetPath(req.url);
  if (!filePath) {
    next();
    return;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    next();
    return;
  }

  const fileSize = stat.size;
  const baseHeaders: Record<string, string | number> = {
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600',
    'Last-Modified': stat.mtime.toUTCString(),
  };

  if (method === 'HEAD') {
    res.writeHead(200, {
      ...baseHeaders,
      'Content-Length': fileSize,
    });
    res.end();
    return;
  }

  const rangeHeader = req.headers.range;
  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const firstRange = rangeHeader.slice('bytes='.length).split(',')[0].trim();
    const [rawStart, rawEnd] = firstRange.split('-');
    let start: number;
    let requestedEnd: number;

    if (rawStart === '' && rawEnd) {
      const suffixLength = Number.parseInt(rawEnd, 10);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }
      start = Math.max(0, fileSize - suffixLength);
      requestedEnd = fileSize - 1;
    } else {
      start = Number.parseInt(rawStart, 10);
      requestedEnd = rawEnd ? Number.parseInt(rawEnd, 10) : fileSize - 1;
    }

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(requestedEnd) ||
      start < 0 ||
      start >= fileSize ||
      requestedEnd < start
    ) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return;
    }

    // Cap every single 206 Partial Content chunk to 2 MiB so proxies with a 32 MiB limit never truncate streams
    const end = Math.min(requestedEnd, start + AUDIO_RANGE_CHUNK_BYTES - 1, fileSize - 1);
    const chunkLength = end - start + 1;

    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunkLength,
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    res.on('close', () => {
      stream.destroy();
    });
    stream.pipe(res);
    return;
  }

  // Fallback for non-Range GET requests
  res.writeHead(200, {
    ...baseHeaders,
    'Content-Length': fileSize,
  });
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.writableEnded) res.end();
  });
  res.on('close', () => {
    stream.destroy();
  });
  stream.pipe(res);
}

function serveChunkedAudioPlugin(): Plugin {
  return {
    name: 'serve-chunked-audio',
    configureServer(server) {
      server.middlewares.use(handleChunkedAudioRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleChunkedAudioRequest);
    },
  };
}

function resolveAllowedHosts(): string[] {
  const hosts = new Set<string>(['.run.app']);
  const ngAllowed = process.env.NG_ALLOWED_HOSTS;
  if (ngAllowed) {
    for (const host of ngAllowed.split(',')) {
      const trimmed = host.trim();
      if (trimmed) hosts.add(trimmed);
    }
  }
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      if (parsed.hostname) hosts.add(parsed.hostname);
    } catch {
      // Ignore malformed APP_URL values
    }
  }
  return Array.from(hosts);
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      serveChunkedAudioPlugin(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(ROOT_DIR, 'dist');
          const srcAssets = path.resolve(ROOT_DIR, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }

          // Ensure canonical background music file is present in dist/assets/audio/colorix-theme.mp3
          const distAudioFile = path.resolve(distDir, 'assets/audio/colorix-theme.mp3');
          if (fs.existsSync(distDir) && !fs.existsSync(distAudioFile)) {
            const fallbackAudio = resolveAudioAssetPath('/assets/audio/colorix-theme.mp3');
            if (fallbackAudio) {
              fs.mkdirSync(path.dirname(distAudioFile), {recursive: true});
              fs.copyFileSync(fallbackAudio, distAudioFile);
            }
          }

          // Never ship unused upload staging directories in dist/
          const strayUploadDir = path.resolve(distDir, 'assets/aistudio');
          if (fs.existsSync(strayUploadDir)) {
            fs.rmSync(strayUploadDir, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(ROOT_DIR, '.'),
      },
    },
    server: {
      allowedHosts: resolveAllowedHosts(),
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
