# NEON DRIFT — Rooftop Runner

An original 3D endless runner built with Three.js. Inspired by the *mechanics*
of lane-based endless runners, but every character, the city, the music and
all sound effects are generated for this project — nothing is copied from
any existing game.

## Run it

Browsers block ES-module imports over the `file://` protocol, so you need a
tiny local server (double-clicking `index.html` will not work).

```bash
cd neon-drift-game
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

Any static server works (`npx serve`, VS Code "Live Server", etc). It also
needs internet access on first load, since Three.js and the two Google Fonts
are pulled from a CDN.

## Controls

**Desktop:** A/D or ←/→ = change lane · Space/↑ = jump · S/↓ = slide · Esc = pause
**Mobile:** swipe left/right/up/down

## Features

- Original cast: Kade "Volt", Rin Sable, Zeph-9 — built from primitive
  low-poly geometry with procedural run/jump/slide/stumble/fly animation.
- Procedurally generated neon-cyberpunk city with recycling road segments,
  randomized buildings/signage, and ambient background traffic.
- Day/night cycle with lerped lighting, sky and fog.
- Obstacles: low barriers, cones, laser gates, trains, vehicles, road gaps.
- Coins, energy crystals, combo multiplier, and five power-ups (Magnet,
  Double Score, Speed Boost, Shield, Jetpack) with upgradeable durations.
- Bloom post-processing, particle bursts, screen shake, motion-blur-style
  FOV punch during speed boosts.
- Shop (runners / outfits / hoverboards / power-up upgrades), daily
  missions, achievements, and high-score tracking — all saved to
  `localStorage`.
- Fully procedural audio: a generative synth soundtrack plus jump/slide/
  coin/crash/power-up SFX, all built at runtime with the Web Audio API
  (no audio files).

## Structure

```
index.html        UI shell, styles, import map
src/storage.js     save/load, daily missions, achievements
src/data.js        characters, outfits, hoverboards, power-up tiers
src/audio.js       procedural music + SFX engine
src/player.js       low-poly character builder + animation
src/world.js        city generation, day/night, spawn manager
src/effects.js       particles + screen shake
src/ui.js            menu / shop / missions / settings DOM wiring
src/main.js           render loop, input, collisions, game state
```
