# WaitingFor.AI 🌴🔔

The chillest place to wait for your coding agents — catch a vibe while your code cooks.

An infinite, procedurally generated beach world in the browser, built with Three.js and WebGL. You're a little glowing wisp gliding along an endless Wind Waker–style coastline: ski down hills, launch off crests, barrel roll, ride cyclone updrafts, and build up flow while seagulls wheel overhead, rain squalls roll through, and campfires flicker at dusk. Procedural audio (no samples — all raw Web Audio) keeps everything in a mellow A-pentatonic soundscape.

Live at [waitingfor.ai](https://waitingfor.ai/).

![WaitingFor.AI — a wisp on an endless beach under a rainbow](public/social/share-1200x630.png?raw=true "WaitingFor.AI")

## Features

- Infinite procedural terrain with beaches, hills, and biomes
- Momentum-based movement: crest launches, downhill skiing, dashes, barrel rolls, dive bombs, and a flow meter
- Fully procedural music and sound effects via the Web Audio API
- Toon / Wind Waker aesthetic: flat-shaded water, ink outlines, stepped foam and clouds
- Dynamic weather — rain, thunder, squalls, and rainbows
- Ambient life: seagulls, fish, crabs, fireflies, sparkles, and campfires
- Multiplayer ghost presence near spawn, with emoji reactions
- Touch controls for mobile

## Running locally

```
npm install
npm run dev
```

## GitHub Pages

This project must be deployed from the Vite build output, not the repository root.
The GitHub Actions workflow builds `dist/` and publishes that folder to Pages.

In the repository settings, set Pages to use **GitHub Actions** as the source.
