# COLORIX – A World Beyond Colors

A cinematic 2D color-switching puzzle-platformer built with **Phaser 3**, **React**, **TypeScript**, and procedural **Web Audio API** synthesis.

## Features

- **16-Color Switching System**: Switch seamlessly between 16 distinct pigments (Crimson through Magenta) using number keys `1–8`, `Q`/`E`, or the interactive **16-Color Radial Wheel** (`Tab`/`C` or click/tap).
- **Real Visibility & Collision Physics**: Matching objects blend into the sky and lose collision; **Color Bridges** work in reverse and materialize when matched; safe re-materialize nudging and phased grace prevent unfair deaths or getting stuck inside solid geometry.
- **8 Original Atmospheric Worlds & 104 Playable Levels**:
  1. *The Forgotten Beginning* — Color Switching & Prism Gates
  2. *Crystal Caverns* — Color Bridges & Checkpoints
  3. *The Silent Forest* — Moving Platforms & Hidden Paths
  4. *Neon Ruins* — Color Locks & Double Jump
  5. *The Frozen Dimension* — Magnetic Color Objects
  6. *The Ancient Machine* — Light Beams & Mirrors
  7. *The Lost Spectrum* — Multi-Mechanic Synthesis
  8. *The Final Prism* — Full 16-Color Mastery
- **Desktop & Mobile Ready**: Responsive scaling, full keyboard + mouse support, and adaptive virtual touch controls.
- **Persistent Progression**: Automatic `localStorage` saving for unlocked levels, crystals, best times, and audio/visual/language settings.

## Controls

- **Move**: `A` / `D` or `←` / `→`
- **Jump / Variable Jump / Double Jump**: `Space` / `W` / `↑` (collect 5 Crystals to unlock Double Jump)
- **Quick Color Select**: `1`–`8` or `Q` / `E` (`0` resets to Twilight)
- **16-Color Radial Wheel**: `Tab` or `C` (or click/tap the wheel button)
- **Restart Level**: `R`
- **Mute Audio**: `M`
- **Pause**: `Esc` or `P`

## Running Locally

```bash
npm install
npm run dev
```

Run unit & level validation tests:

```bash
npx --yes tsx --test src/game/core.test.ts src/game/levels.test.ts
```
