// The simulation: player, enemies, bullets, pickups, particles, waves and upgrades.
// Pure state + step(): no DOM, no canvas, no audio here — main.js wires those in.
import { ENEMIES, FIELD, PICKUPS, PLAYER, UPGRADES, WAVES } from './config.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE = 4;
export const EVENT_BOSS = 8;
export const EVENT_PICKUP = 16;
export const EVENT_SHOOT = 32;
export const EVENT_SPIT = 64;
export const EVENT_DASH = 128;
export const EVENT_EXPLODE = 256;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function spawnEdge(random) {
  const side = random.int(0, 3);
  const margin = 30;
  if (side === 0) return { x: random.range(0, FIELD.width), y: -margin };
  if (side === 1) return { x: random.range(0, FIELD.width), y: FIELD.height + margin };
  if (side === 2) return { x: -margin, y: random.range(0, FIELD.height) };
  return { x: FIELD.width + margin, y: random.range(0, FIELD.height) };
}

export function createWorld(random) {
  const state = {
    player: null,
    enemies: [],
    bullets: [],
    enemyBullets: [],
    pickups: [],
    particles: [],
    texts: [],
    stars: [],
    wave: 0,
    score: 0,
    combo: 1,
    comboTimer: 0,
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    time: 0,
    phase: 'title', // title | intermission | play | upgrade | over
    phaseTimer: 0,
    spawnQueue: [],
    spawnTimer: 0,
    upgradeChoices: [],
    shake: 0,
    boss: null,
    stats: { wavesCleared: 0, bossesKilled: 0 },
  };

  function freshPlayer() {
    return {
      x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0,
      angle: -Math.PI / 2, radius: PLAYER.radius,
      hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
      fireTimer: 0, dashTimer: 0, dashCooldown: 0, dashDirX: 0, dashDirY: -1,
      iframes: 0, shieldTimer: 0, rapidTimer: 0,
      damageMul: 1, fireMul: 1, speedMul: 1, dashMul: 1, magnetMul: 1,
      shots: 1, pierce: 0, explosive: false, regen: 0,
      upgradesTaken: [],
    };
  }

  function makeStars() {
    state.stars = [];
    for (let i = 0; i < 140; i += 1) {
      state.stars.push({
        x: random.range(0, FIELD.width), y: random.range(0, FIELD.height),
        size: random.range(0.6, 2.2), twinkle: random.range(0, TAU),
        speed: random.range(0.2, 1.2),
      });
    }
  }

  function addParticles(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = random.range(0, TAU);
      const v = random.range(speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
        life: random.range(life * 0.5, life), maxLife: life,
        size: random.range(size * 0.5, size * 1.5), color,
      });
    }
    if (state.particles.length > 420) state.particles.splice(0, state.particles.length - 420);
  }

  function addText(x, y, text, color, size) {
    state.texts.push({ x, y, text, color, size: size ?? 16, life: 0.9, maxLife: 0.9 });
  }

  function addScore(base, x, y) {
    const gained = Math.round(base * state.combo);
    state.score += gained;
    state.comboTimer = 3;
    addText(x, y, `+${gained}`, '#ffd60a', 15);
    return gained;
  }

  function makeEnemy(kind, x, y, elite) {
    const def = ENEMIES[kind];
    const hpMul = 1 + (state.wave - 1) * 0.16 + (elite ? 2.2 : 0);
    return {
      kind, x, y, vx: 0, vy: 0,
      radius: def.radius * (elite ? 1.35 : 1),
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      speed: def.speed * random.range(0.9, 1.1) * (1 + (state.wave - 1) * 0.025),
      damage: def.damage, score: def.score * (elite ? 3 : 1),
      color: def.color, glow: def.glow,
      elite: !!elite,
      fireTimer: random.range(0.5, 1.5),
      wobble: random.range(0, TAU),
      flash: 0,
      spawnT: 0.35, // spawn-in animation
    };
  }

  function waveComposition(wave) {
    const kinds = ['drifter'];
    if (wave >= 2) kinds.push('spitter');
    if (wave >= 3) kinds.push('splitter');
    if (wave >= 4) kinds.push('brute');
    const count = Math.min(8 + (wave - 1) * 4, 40);
    const queue = [];
    for (let i = 0; i < count; i += 1) {
      let kind;
      const roll = random.next();
      if (wave >= 4 && roll < 0.16) kind = 'brute';
      else if (wave >= 3 && roll < 0.38) kind = 'splitter';
      else if (wave >= 2 && roll < 0.62) kind = 'spitter';
      else kind = 'drifter';
      queue.push(kind);
    }
    return queue;
  }

  function startWave(wave) {
    state.wave = wave;
    state.phase = 'play';
    state.spawnQueue = waveComposition(wave);
    state.spawnTimer = 0.4;
    state.texts.length = 0; // stale banners from the last wave never overlap the new one
    if (wave % WAVES.bossEvery === 0) {
      const at = spawnEdge(random);
      const boss = makeEnemy('boss', at.x, at.y, false);
      boss.hp = ENEMIES.boss.hp * (1 + (wave / WAVES.bossEvery - 1) * 0.6);
      boss.maxHp = boss.hp;
      state.enemies.push(boss);
      state.boss = boss;
      addText(FIELD.width / 2, 200, '⚠ VOIDLORD APPROACHES ⚠', '#ff2e63', 34);
      return EVENT_BOSS;
    }
    addText(FIELD.width / 2, 200, `WAVE ${wave}`, '#4cc9f0', 34);
    return EVENT_WAVE;
  }

  function offerUpgrades() {
    const pool = UPGRADES.filter((u) => {
      if (u.id === 'multishot' && state.player.shots >= 4) return false;
      if (u.id === 'pierce' && state.player.pierce >= 3) return false;
      if (u.id === 'explosive' && state.player.explosive) return false;
      if (u.id === 'maxhp' && state.player.maxHp >= 175) return false;
      if (u.id === 'regen' && state.player.regen >= 3.0) return false;
      return true;
    });
    const choices = [];
    while (choices.length < 3 && pool.length > 0) {
      const index = random.int(0, pool.length - 1);
      choices.push(pool.splice(index, 1)[0]);
    }
    state.upgradeChoices = choices;
    state.phase = 'upgrade';
    state.texts.length = 0; // the wave-clear bonus text must not sit on top of the cards
  }

  function applyUpgrade(upgrade) {
    upgrade.apply(state.player);
    state.player.upgradesTaken.push(upgrade.id);
    addText(state.player.x, state.player.y - 40, upgrade.name, '#ffd60a', 20);
    startWave(state.wave + 1);
  }

  function dropPickup(x, y, kind) {
    const def = PICKUPS[kind];
    state.pickups.push({
      kind, x, y, radius: def.radius, color: def.color,
      life: 9, bob: random.range(0, TAU),
    });
  }

  function maybeDrop(enemy) {
    const roll = random.next();
    if (enemy.kind === 'boss' || enemy.elite) {
      dropPickup(enemy.x, enemy.y, 'health');
      dropPickup(enemy.x + 30, enemy.y, 'shield');
      return;
    }
    if (roll < 0.07) dropPickup(enemy.x, enemy.y, 'health');
    else if (roll < 0.11) dropPickup(enemy.x, enemy.y, 'shield');
    else if (roll < 0.15) dropPickup(enemy.x, enemy.y, 'rapid');
  }

  function explodeEnemy(enemy, award) {
    addParticles(enemy.x, enemy.y, enemy.color, enemy.kind === 'boss' ? 70 : 22, 260, 0.7, 4);
    addParticles(enemy.x, enemy.y, '#ffffff', 8, 180, 0.4, 2.5);
    state.shake = Math.max(state.shake, enemy.kind === 'boss' ? 14 : 5);
    if (award) {
      addScore(enemy.score, enemy.x, enemy.y);
      state.kills += 1;
      state.combo = Math.min(5, 1 + Math.floor(state.kills / 15));
    }
    maybeDrop(enemy);
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < 2; i += 1) {
        const mote = makeEnemy('mote', enemy.x + random.range(-16, 16), enemy.y + random.range(-16, 16), false);
        mote.spawnT = 0.15;
        state.enemies.push(mote);
      }
    }
    if (enemy.kind === 'boss') {
      state.boss = null;
      state.stats.bossesKilled += 1;
      addText(FIELD.width / 2, 260, 'VOIDLORD DESTROYED', '#ffd60a', 30);
      addScore(500, FIELD.width / 2, 300);
    }
  }

  function firePlayer() {
    const p = state.player;
    const baseAngle = p.angle;
    const spread = 0.11;
    const n = p.shots;
    for (let i = 0; i < n; i += 1) {
      const offset = (i - (n - 1) / 2) * spread;
      const angle = baseAngle + offset;
      state.bullets.push({
        x: p.x + Math.cos(angle) * (p.radius + 8),
        y: p.y + Math.sin(angle) * (p.radius + 8),
        vx: Math.cos(angle) * PLAYER.bulletSpeed,
        vy: Math.sin(angle) * PLAYER.bulletSpeed,
        damage: PLAYER.bulletDamage * p.damageMul,
        pierce: p.pierce, radius: 5, life: 1.1, explosive: p.explosive,
      });
    }
    state.shotsFired += n;
    addParticles(p.x + Math.cos(baseAngle) * 20, p.y + Math.sin(baseAngle) * 20, '#ffe66d', 2, 120, 0.2, 2);
  }

  function hurtPlayer(damage) {
    const p = state.player;
    if (p.iframes > 0 || p.dashTimer > 0 || state.phase !== 'play') return EVENT_HIT;
    if (p.shieldTimer > 0) { p.shieldTimer -= 1; addText(p.x, p.y - 30, 'SHIELD', '#4cc9f0', 15); return EVENT_HIT; }
    p.hp -= damage;
    p.iframes = PLAYER.invulnerable;
    state.shake = Math.max(state.shake, 9);
    addParticles(p.x, p.y, '#ff4d6d', 16, 220, 0.5, 3.5);
    state.combo = 1;
    state.comboTimer = 0;
    if (p.hp <= 0) {
      p.hp = 0;
      state.phase = 'over';
      addParticles(p.x, p.y, '#4cc9f0', 60, 320, 1.1, 5);
      addParticles(p.x, p.y, '#ffffff', 30, 240, 0.9, 3);
      return EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function stepPlayer(dt, dir, aim, firing, dash) {
    const p = state.player;
    p.angle = Math.atan2(aim.y - p.y, aim.x - p.x);
    if (p.iframes > 0) p.iframes -= dt;
    if (p.dashCooldown > 0) p.dashCooldown -= dt;
    if (p.shieldTimer > 0) p.shieldTimer -= dt;
    if (p.rapidTimer > 0) p.rapidTimer -= dt;
    if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
    if (p.fireTimer > 0) p.fireTimer -= dt;

    if (dash && p.dashCooldown <= 0 && p.dashTimer <= 0) {
      const len = Math.hypot(dir.x, dir.y);
      if (len > 0) { p.dashDirX = dir.x / len; p.dashDirY = dir.y / len; }
      else { p.dashDirX = Math.cos(p.angle); p.dashDirY = Math.sin(p.angle); }
      p.dashTimer = PLAYER.dashTime;
      p.dashCooldown = PLAYER.dashCooldown / p.dashMul;
      p.iframes = Math.max(p.iframes, PLAYER.dashIframes);
      addParticles(p.x, p.y, '#4cc9f0', 12, 160, 0.35, 3);
      return 'dash';
    }
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.x += p.dashDirX * PLAYER.dashSpeed * dt;
      p.y += p.dashDirY * PLAYER.dashSpeed * dt;
    } else {
      const speed = PLAYER.speed * p.speedMul;
      p.vx += dir.x * PLAYER.accel * dt;
      p.vy += dir.y * PLAYER.accel * dt;
      const drag = Math.exp(-PLAYER.friction * dt);
      p.vx *= drag;
      p.vy *= drag;
      const v = Math.hypot(p.vx, p.vy);
      if (v > speed) { p.vx = (p.vx / v) * speed; p.vy = (p.vy / v) * speed; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    p.x = Math.max(p.radius, Math.min(FIELD.width - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(FIELD.height - p.radius, p.y));

    if (firing && p.fireTimer <= 0) {
      p.fireTimer = PLAYER.fireInterval / p.fireMul / (p.rapidTimer > 0 ? 2 : 1);
      firePlayer();
      return 'shoot';
    }
    return null;
  }

  function stepEnemy(e, dt) {
    const p = state.player;
    if (e.spawnT > 0) { e.spawnT -= dt; return; }
    if (e.flash > 0) e.flash -= dt;
    e.wobble += dt;
    // An enemy left outside the field (spawned on an edge) steers back inside
    // before anything else: a wave must always be finishable.
    if (e.x < 0 || e.x > FIELD.width || e.y < 0 || e.y > FIELD.height) {
      const cx = FIELD.width / 2 - e.x;
      const cy = FIELD.height / 2 - e.y;
      const cd = Math.hypot(cx, cy) || 1;
      e.vx += (cx / cd) * e.speed * 3 * dt;
      e.vy += (cy / cd) * e.speed * 3 * dt;
      const v0 = Math.hypot(e.vx, e.vy);
      if (v0 > e.speed * 1.2) { e.vx = (e.vx / v0) * e.speed * 1.2; e.vy = (e.vy / v0) * e.speed * 1.2; }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      return null;
    }
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (e.kind === 'drifter' || e.kind === 'mote') {
      // Blend velocity toward the player so chasers converge instead of
      // orbiting forever at high speed (a wave must always be finishable).
      const blend = Math.min(1, 3.2 * dt);
      e.vx += ((dx / d) * e.speed - e.vx) * blend;
      e.vy += ((dy / d) * e.speed - e.vy) * blend;
    } else if (e.kind === 'brute' || e.kind === 'boss') {
      const blend = Math.min(1, 2.4 * dt);
      e.vx += ((dx / d) * e.speed - e.vx) * blend;
      e.vy += ((dy / d) * e.speed - e.vy) * blend;
    } else if (e.kind === 'splitter') {
      const wob = Math.sin(e.wobble * 3) * 0.6;
      const px = dx / d;
      const py = dy / d;
      e.vx += (px + -py * wob) * e.speed * 2.2 * dt;
      e.vy += (py + px * wob) * e.speed * 2.2 * dt;
    } else if (e.kind === 'spitter') {
      if (d > ENEMIES.spitter.range) {
        e.vx += (dx / d) * e.speed * 2.2 * dt;
        e.vy += (dy / d) * e.speed * 2.2 * dt;
      } else {
        e.vx *= Math.exp(-2 * dt);
        e.vy *= Math.exp(-2 * dt);
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = ENEMIES.spitter.fireInterval * random.range(0.9, 1.2);
          const spread = random.range(-0.12, 0.12);
          const a = Math.atan2(dy, dx) + spread;
          state.enemyBullets.push({
            x: e.x, y: e.y,
            vx: Math.cos(a) * ENEMIES.spitter.bulletSpeed,
            vy: Math.sin(a) * ENEMIES.spitter.bulletSpeed,
            damage: ENEMIES.spitter.damage, radius: 6, life: 3,
          });
          return 'spit';
        }
      }
    }
    const v = Math.hypot(e.vx, e.vy);
    const maxV = e.speed * (e.kind === 'boss' ? 1.15 : 1);
    if (v > maxV) { e.vx = (e.vx / v) * maxV; e.vy = (e.vy / v) * maxV; }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    // Boss radial burst
    if (e.kind === 'boss') {
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = 2.4;
        const n = 12;
        for (let i = 0; i < n; i += 1) {
          const a = (i / n) * TAU + e.wobble;
          state.enemyBullets.push({
            x: e.x, y: e.y,
            vx: Math.cos(a) * 170, vy: Math.sin(a) * 170,
            damage: 12, radius: 6, life: 4,
          });
        }
        return 'burst';
      }
    }
    return null;
  }

  function explodeBullet(b) {
    addParticles(b.x, b.y, '#ffd60a', 14, 220, 0.45, 3.5);
    state.shake = Math.max(state.shake, 3);
    for (const e of state.enemies) {
      if (e.spawnT > 0) continue;
      const rr = e.radius + 70;
      if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
        e.hp -= b.damage * 0.6;
        e.flash = 0.12;
      }
    }
  }

  function stepBullets(dt) {
    let shotEvent = 0;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -80 || b.x > FIELD.width + 80 || b.y < -80 || b.y > FIELD.height + 80) {
        state.bullets.splice(i, 1);
        continue;
      }
      let dead = false;
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const e = state.enemies[j];
        if (e.spawnT > 0) continue;
        const rr = e.radius + b.radius;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          e.hp -= b.damage;
          e.flash = 0.12;
          state.shotsHit += 1;
          addParticles(b.x, b.y, e.color, 4, 140, 0.25, 2);
          if (b.explosive) explodeBullet(b);
          if (b.pierce > 0) { b.pierce -= 1; }
          else { dead = true; }
          if (e.hp <= 0) {
            explodeEnemy(e, true);
            shotEvent |= EVENT_EXPLODE;
            state.enemies.splice(j, 1);
          }
          if (dead) break;
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
    for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = state.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -80 || b.x > FIELD.width + 80 || b.y < -80 || b.y > FIELD.height + 80) {
        state.enemyBullets.splice(i, 1);
        continue;
      }
      const p = state.player;
      const rr = p.radius + b.radius - 3;
      if (dist2(b.x, b.y, p.x, p.y) < rr * rr) {
        state.enemyBullets.splice(i, 1);
        const event = hurtPlayer(b.damage);
        if (event) shotEvent |= event;
      }
    }
    return shotEvent;
  }

  function stepCollisions() {
    const p = state.player;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      if (e.spawnT > 0) continue;
      const rr = e.radius + p.radius - 2;
      if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
        const event = hurtPlayer(e.damage);
        // Knock the enemy back so one touch is not a chain of hits.
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        e.x = p.x + (dx / d) * (rr + 6);
        e.y = p.y + (dy / d) * (rr + 6);
        if (event === EVENT_OVER) return EVENT_OVER;
        if (event) return EVENT_HIT;
      }
    }
    // Pickups, magnetised toward the player.
    const magnetR = PLAYER.pickupRadius * p.magnetMul;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      pk.life -= 1 / 60;
      const d = Math.hypot(p.x - pk.x, p.y - pk.y);
      if (d < magnetR && d > 1) {
        const pull = 420 * (1 - d / magnetR) + 120;
        pk.x += ((p.x - pk.x) / d) * pull * (1 / 60);
        pk.y += ((p.y - pk.y) / d) * pull * (1 / 60);
      }
      if (d < p.radius + pk.radius + 4) {
        if (pk.kind === 'health') { p.hp = Math.min(p.maxHp, p.hp + PICKUPS.health.heal); addText(p.x, p.y - 30, `+${PICKUPS.health.heal} HP`, '#80ed99', 16); }
        if (pk.kind === 'shield') { p.shieldTimer = PICKUPS.shield.time; addText(p.x, p.y - 30, 'SHIELD UP', '#4cc9f0', 16); }
        if (pk.kind === 'rapid') { p.rapidTimer = PICKUPS.rapid.time; addText(p.x, p.y - 30, 'RAPID FIRE', '#ffd60a', 16); }
        addParticles(pk.x, pk.y, pk.color, 10, 160, 0.4, 3);
        state.pickups.splice(i, 1);
        return EVENT_PICKUP;
      }
      if (pk.life <= 0) state.pickups.splice(i, 1);
    }
    return 0;
  }

  function stepFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.exp(-2.5 * dt);
      pt.vy *= Math.exp(-2.5 * dt);
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const t = state.texts[i];
      t.y -= 34 * dt;
      t.life -= dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
    for (const s of state.stars) { s.twinkle += dt * s.speed; }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 1;
    }
  }

  function spawnStep(dt) {
    if (state.spawnQueue.length === 0) return;
    if (state.enemies.length >= WAVES.maxAlive) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer > 0) return;
    state.spawnTimer = WAVES.spawnInterval * Math.max(0.45, 1 - state.wave * 0.03) * random.range(0.7, 1.3);
    const kind = state.spawnQueue.shift();
    const at = spawnEdge(random);
    const elite = state.wave >= 3 && random.chance(0.08);
    state.enemies.push(makeEnemy(kind, at.x, at.y, elite));
  }

  function reset() {
    state.player = freshPlayer();
    state.enemies = [];
    state.bullets = [];
    state.enemyBullets = [];
    state.pickups = [];
    state.particles = [];
    state.texts = [];
    state.wave = 0;
    state.score = 0;
    state.combo = 1;
    state.comboTimer = 0;
    state.kills = 0;
    state.shotsFired = 0;
    state.shotsHit = 0;
    state.time = 0;
    state.spawnQueue = [];
    state.boss = null;
    state.stats = { wavesCleared: 0, bossesKilled: 0 };
    makeStars();
  }

  reset();

  return {
    state,
    reset,
    startRun() {
      reset();
      state.phase = 'intermission';
      state.phaseTimer = 1.2;
    },
    step(dt, input) {
      // input: { dir, aim, firing, dash, click, upgradeKey }
      let events = 0;
      state.time += dt;
      if (state.phase === 'title') {
        // Ambient drift behind the title: a few wanderers, no combat.
        if (state.enemies.length < 5 && random.chance(dt * 0.5)) {
          const at = spawnEdge(random);
          state.enemies.push(makeEnemy(random.pick(['drifter', 'mote']), at.x, at.y, false));
        }
        for (const e of state.enemies) {
          e.wobble += dt;
          if (e.spawnT > 0) e.spawnT -= dt;
          e.x += Math.cos(e.wobble) * 24 * dt;
          e.y += Math.sin(e.wobble * 1.3) * 24 * dt;
        }
        stepFx(dt);
        return 0;
      }
      if (state.phase === 'intermission') {
        state.phaseTimer -= dt;
        stepFx(dt);
        if (state.phaseTimer <= 0) events |= startWave(1);
        return events;
      }
      if (state.phase === 'upgrade') {
        if (input.upgradeKey !== null && input.upgradeKey !== undefined) {
          const choice = state.upgradeChoices[input.upgradeKey];
          if (choice) {
            applyUpgrade(choice);
            events |= EVENT_WAVE;
          }
        } else if (input.click) {
          const hit = input.clickUpgrade?.(input.click.x, input.click.y);
          if (hit !== null && hit !== undefined) {
            applyUpgrade(state.upgradeChoices[hit]);
            events |= EVENT_WAVE;
          }
        }
        stepFx(dt);
        return events;
      }
      if (state.phase === 'over') { stepFx(dt); return 0; }

      // phase === 'play'
      const sound = stepPlayer(dt, input.dir, input.aim, input.firing, input.dash);
      if (sound === 'shoot') events |= EVENT_SHOOT;
      if (sound === 'dash') events |= EVENT_DASH;
      spawnStep(dt);
      for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
        const s = stepEnemy(state.enemies[i], dt);
        if (s === 'spit' || s === 'burst') events |= EVENT_SPIT;
      }
      const bulletEvent = stepBullets(dt);
      if (bulletEvent) events |= bulletEvent;
      const collisionEvent = stepCollisions();
      if (collisionEvent) events |= collisionEvent;
      stepFx(dt);
      if (state.phase === 'over') return events | EVENT_OVER;
      // Wave cleared: queue empty and no enemies left (boss counts as an enemy).
      if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
        state.stats.wavesCleared += 1;
        addScore(100 * state.wave, FIELD.width / 2, 300);
        addText(FIELD.width / 2, 330, 'WAVE CLEARED', '#80ed99', 26);
        offerUpgrades();
      }
      return events;
    },
    chooseUpgrade(index) {
      if (state.phase !== 'upgrade') return false;
      const choice = state.upgradeChoices[index];
      if (!choice) return false;
      applyUpgrade(choice);
      return true;
    },
    soundFor(stepResult) { return stepResult; },
  };
}
