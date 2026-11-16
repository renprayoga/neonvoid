# NEONVOID — Arena Survival

[![make.fun](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![Rank](https://make.fun/badge/best-game-01/renprayoga/neonvoid/rank.svg)](https://make.fun/bounty/best-game-01)
[![Reward](https://make.fun/badge/best-game-01/renprayoga/neonvoid/reward.svg)](https://make.fun/bounty/best-game-01)

A neon top-down arena shooter, written from scratch for the make.fun bounty
**"Make the best game"** ([best-game-01](https://make.fun/bounty/best-game-01)).

One ship against the void. Survive escalating waves, kill the Voidlord every
5th wave, and pick 1 of 3 upgrades between waves. How long can you last?

## How to play

- **WASD / arrows** — fly
- **Mouse** — aim
- **Hold click** — fire
- **SHIFT** — dash (brief invulnerability, recharges)
- **P / Esc** — pause · **M** — mute

## What is in it

- 6 enemy kinds: drifters, spitters, brutes, splitters (which burst into motes),
  elite variants, and the **Voidlord** boss every 5th wave with radial bullet bursts
- 10 upgrades between waves: multishot, piercing, explosive rounds, fire rate,
  damage, speed, hull, dash, magnet, regeneration
- Pickups: hull repair, shield, rapid fire — magnetised toward the ship
- Combo multiplier, wave banners, floating score text, particles, screen shake,
  hit flashes, spawn-in animations
- Synthesized sound only (WebAudio oscillators + noise, plus a bass loop) —
  no audio files, no network requests, ever
- Title, pause, upgrade, game-over and restart screens; best score kept locally
- Deterministic seeds (`?seed=N`) and staged screenshot scenes
  (`?shot=start|play|upgrade|boss|end`)

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Plain static files: `game/index.html` and its ES modules, no library, no build
step. Node 22+ for the local server; any desktop browser to play.

## Layout

| File | What it is |
| --- | --- |
| `game/index.html` | Page + canvas |
| `game/src/main.js` | Boot, loop, screens, input wiring |
| `game/src/world.js` | Simulation: player, enemies, waves, upgrades, collisions |
| `game/src/render.js` | Canvas renderer: neon glow, HUD, all screens |
| `game/src/audio.js` | WebAudio synth SFX + bass loop |
| `game/src/input.js` | Keyboard + mouse |
| `game/src/shots.js` | Screenshot scenes + autopilot |
| `game/src/config.js` | All tuning numbers and colours |
| `game/src/random.js` | Deterministic RNG |
| `main.ts` | Hands the entry in (copies game/ + screenshots/, writes dossier.json) |
| `serve.ts` | Tiny static server for local play |
| `screenshots/` | 4 real renders of the game |
| `.makefun/owner.json` | Claim file: the entrant's Solana wallet (public address only) |
| `LICENSE` | MIT |
