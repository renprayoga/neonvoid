// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between five screens:
// title, play, paused, upgrade and game over.
//
// ?seed=N fixes the random pattern. ?shot=start|play|upgrade|boss|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
//
// A debug hook for local verification: window.__game exposes the world state, the
// current screen, the best score, and start/world/input handles (used by the headless
// playtest, never by the game itself).
import { BEST_KEY, MUTE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  createWorld,
  EVENT_BOSS, EVENT_DASH, EVENT_EXPLODE, EVENT_HIT, EVENT_OVER, EVENT_PICKUP,
  EVENT_SHOOT, EVENT_SPIT, EVENT_WAVE,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import {
  createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE,
  upgradeCardRects,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; }
  catch { return 0; }
}
function saveBest(value) {
  try { window.localStorage.setItem(BEST_KEY, String(value)); }
  catch { /* storage can be off: best lasts this visit only */ }
}
function readMuted() {
  try { return window.localStorage.getItem(MUTE_KEY) === '1'; }
  catch { return false; }
}
function saveMuted(value) {
  try { window.localStorage.setItem(MUTE_KEY, value ? '1' : '0'); }
  catch { /* ignore */ }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, world.state.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (x, y) => renderer.toField(x, y));
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  audio.setMuted(readMuted());

  function announce(message) { status.textContent = message; }

  function startGame() {
    audio.unlock();
    audio.click();
    world.startRun();
    screen = SCREEN_PLAY;
    announce('Playing. Survive the waves.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.gameOver();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_SPIT) audio.hit();
    if (events & EVENT_EXPLODE) audio.explode();
    if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_WAVE) audio.wave();
    if (events & EVENT_BOSS) audio.boss();
    if (events & EVENT_OVER) endGame();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = !audio.isMuted();
      audio.setMuted(muted);
      saveMuted(muted);
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function clickUpgrade(x, y) {
    const rects = upgradeCardRects();
    for (const r of rects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.index;
    }
    return null;
  }

  function step(dt) {
    const actions = handleActions();
    const click = input.takeClick();
    if (screen === SCREEN_TITLE) {
      if (click) startGame();
      else world.step(dt, { dir: { x: 0, y: 0 }, aim: { x: 640, y: 360 }, firing: false, dash: false, click: null, upgradeKey: null });
      return;
    }
    if (screen === SCREEN_PAUSED) return;
    if (screen === SCREEN_OVER) return;
    if (screen === SCREEN_UPGRADE) {
      // Number keys 1-3 select a card; a click on a card selects it too.
      let upgradeKey = null;
      if (click) {
        const hit = clickUpgrade(click.x, click.y);
        if (hit !== null) upgradeKey = hit;
      }
      const events = world.step(dt, { dir: { x: 0, y: 0 }, aim: { x: 640, y: 360 }, firing: false, dash: false, click: null, upgradeKey });
      if (world.state.phase === 'play') {
        screen = SCREEN_PLAY;
        audio.upgrade();
        announce(`Wave ${world.state.wave}.`);
      }
      void events;
      return;
    }
    // SCREEN_PLAY
    const events = world.step(dt, {
      dir: input.direction(),
      aim: input.aim(),
      firing: input.isFiring(),
      dash: !!(actions & ACTION_DASH),
      click: null,
      upgradeKey: null,
    });
    if (world.state.phase === 'upgrade') {
      screen = SCREEN_UPGRADE;
      announce(`Wave ${world.state.wave} cleared. Choose an upgrade.`);
    }
    playEvents(events);
  }

  // Number keys select upgrade cards (keydown is global, so poll here).
  const numberKeys = new Set();
  window.addEventListener('keydown', (event) => {
    if (['1', '2', '3'].includes(event.key)) numberKeys.add(event.key);
  });
  window.addEventListener('keyup', (event) => { numberKeys.delete(event.key); });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_UPGRADE) {
      // Consume a number key as an upgrade choice before stepping.
      let key = null;
      if (numberKeys.has('1')) key = 0;
      else if (numberKeys.has('2')) key = 1;
      else if (numberKeys.has('3')) key = 2;
      if (key !== null) {
        numberKeys.clear();
        if (world.chooseUpgrade(key)) {
          screen = SCREEN_PLAY;
          audio.upgrade();
          announce(`Wave ${world.state.wave}.`);
        }
      }
      step(0);
      renderer.draw(world.state, screen, best, world.state.time);
      return;
    }
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
      if (screen === SCREEN_PAUSED || screen === SCREEN_OVER) { accumulator = 0; break; }
    }
    renderer.draw(world.state, screen, best, world.state.time);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // Debug / verification hook (not part of play): state, screen and an autopilot driver.
  window.__game = {
    get state() { return world.state; },
    get screen() { return screen; },
    get best() { return best; },
    start: startGame,
    world,
    input,
  };

  announce('NEONVOID. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
