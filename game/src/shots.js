// The screenshot scenes behind ?shot=start|play|upgrade|boss|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (flee the nearest enemy, keep firing at the nearest one, dash when crowded), so the frame
// is what a short game really looks like and the same seed always gives the same frame.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 44;
const UPGRADE_SECONDS = 30;
const BOSS_SECONDS = 150;
const END_LIMIT_SECONDS = 600;

/** Aim at the nearest enemy, move away from the nearest threat, fire when one is in range.
 *  `sloppy` is the hurried-player pilot for the end scene: it fires late, never dashes
 *  and only flees when a threat is almost on top of it, so it is caught out once the
 *  waves speed up — exactly as a hurried player is. */
function autopilot(state, sloppy = false) {
  const p = state.player;
  let nearest = null;
  let nearestD = Infinity;
  let nearestThreat = null;
  let threatD = Infinity;
  for (const e of state.enemies) {
    if (e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < nearestD) { nearestD = d; nearest = e; }
    if (d < threatD && (e.kind === 'drifter' || e.kind === 'brute' || e.kind === 'mote' || e.kind === 'boss')) {
      threatD = d; nearestThreat = e;
    }
  }
  const fleeAt = sloppy ? 110 : 170;
  let dir = { x: 0, y: 0 };
  if (nearestThreat && threatD < fleeAt) {
    const dx = p.x - nearestThreat.x;
    const dy = p.y - nearestThreat.y;
    const d = Math.hypot(dx, dy) || 1;
    dir = { x: dx / d, y: dy / d };
    // Steer toward the centre when pushed to an edge.
    if (p.x < 140) dir.x += 0.6;
    if (p.x > FIELD.width - 140) dir.x -= 0.6;
    if (p.y < 140) dir.y += 0.6;
    if (p.y > FIELD.height - 140) dir.y -= 0.6;
  } else if (nearest) {
    // Drift to a mid-range orbit so shots land but threats stay away.
    const dx = nearest.x - p.x;
    const dy = nearest.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const want = 220;
    const radial = d > want + 40 ? 1 : d < want - 40 ? -1 : 0;
    dir = { x: (dx / d) * radial + (-dy / d) * 0.5, y: (dy / d) * radial + (dx / d) * 0.5 };
  }
  const len = Math.hypot(dir.x, dir.y);
  if (len > 1) { dir.x /= len; dir.y /= len; }
  const aim = nearest ? { x: nearest.x, y: nearest.y } : { x: p.x + 100, y: p.y };
  return {
    dir,
    aim,
    firing: nearest !== null && nearestD < (sloppy ? 300 : 560),
    dash: !sloppy && nearestThreat !== null && threatD < 90 && p.dashCooldown <= 0,
    click: null,
    upgradeKey: null,
  };
}

export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'boss' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, autopilot(world.state));
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.startRun();
  // Play forward: the intermission starts wave 1, upgrades are taken, the boss
  // arrives on wave 5. Stop at the requested scene.
  const target = name === 'boss' ? BOSS_SECONDS : name === 'end' ? END_LIMIT_SECONDS : name === 'upgrade' ? UPGRADE_SECONDS : PLAY_SECONDS;
  let screen = SCREEN_PLAY;
  let resigned = false;
  let bossSeenAt = null;
  for (let i = 0; i < target / STEP + 150 / STEP; i += 1) {
    const state = world.state;
    if (state.phase === 'upgrade') {
      if (name === 'upgrade') { screen = SCREEN_UPGRADE; break; }
      world.chooseUpgrade(0);
      continue;
    }
    // The end scene is a game that ends: once the time is up, the pilot stops
    // playing (a resigned player) and the real rules finish the run.
    if (name === 'end' && i >= target / STEP) resigned = true;
    const input = resigned
      ? { dir: { x: 0, y: 0 }, aim: { x: state.player.x + 100, y: state.player.y }, firing: false, dash: false, click: null, upgradeKey: null }
      : autopilot(state, name === 'end');
    const events = world.step(STEP, input);
    if (events & EVENT_OVER) { screen = SCREEN_OVER; break; }
    if (name === 'boss' && state.boss) {
      // Capture a few seconds after the boss arrives, once it is properly
      // inside the arena: a boss still sliding in from an edge reads as empty.
      if (bossSeenAt === null) bossSeenAt = state.time;
      const b = state.boss;
      if (state.time - bossSeenAt > 4 && b.x > 120 && b.x < FIELD.width - 120 && b.y > 120 && b.y < FIELD.height - 120) {
        screen = SCREEN_PLAY;
        break;
      }
    }
    if (name === 'play') {
      // Capture a busy moment, not a lull: wave 4+ with at least 4 enemies
      // close to the player (a real fight, clustered on screen), falling back
      // to the fixed time if the fight never gets that crowded.
      const near = state.enemies.filter((e) => Math.hypot(e.x - state.player.x, e.y - state.player.y) < 350).length;
      if (state.wave >= 4 && near >= 4 && state.time > 20) { screen = SCREEN_PLAY; break; }
      if (i >= PLAY_SECONDS / STEP - 1) { screen = SCREEN_PLAY; break; }
    }
    if (name !== 'end' && i >= target / STEP - 1) break;
  }
  return { screen, best: world.state.score };
}
