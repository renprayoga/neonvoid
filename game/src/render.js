// Canvas 2D renderer: neon glow on a dark grid, screen shake, HUD and every screen.
// The playfield is 1280x720 logical; the canvas is scaled to fit the window.
import { FIELD, FONT, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_OVER = 'over';

const CARD_W = 300;
const CARD_H = 150;
const CARD_GAP = 28;

export function upgradeCardRects() {
  const total = CARD_W * 3 + CARD_GAP * 2;
  const x0 = (FIELD.width - total) / 2;
  const y = 300;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (CARD_W + CARD_GAP), y, w: CARD_W, h: CARD_H, index: i }));
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    offsetX = (canvas.width - FIELD.width * scale) / 2;
    offsetY = (canvas.height - FIELD.height * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  function toField(clientX, clientY) {
    return { x: (clientX - offsetX) / scale, y: (clientY - offsetY) / scale };
  }

  function drawBackground(state, time) {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Nebula blobs
    const blobs = [
      { x: 260, y: 150, r: 260, c: 'rgba(76, 201, 240, 0.05)' },
      { x: 1020, y: 560, r: 300, c: 'rgba(199, 125, 255, 0.05)' },
      { x: 900, y: 120, r: 220, c: 'rgba(255, 77, 109, 0.045)' },
    ];
    for (const b of blobs) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, b.c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
    // Stars
    for (const s of state.stars) {
      const a = 0.35 + 0.4 * Math.abs(Math.sin(s.twinkle));
      ctx.fillStyle = `rgba(238, 241, 245, ${a.toFixed(2)})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    // Grid
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= FIELD.width; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, FIELD.height); }
    for (let y = 0; y <= FIELD.height; y += 64) { ctx.moveTo(0, y); ctx.lineTo(FIELD.width, y); }
    ctx.stroke();
    // Arena border
    ctx.strokeStyle = PALETTE.gridBright;
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, FIELD.width - 8, FIELD.height - 8);
    void time;
  }

  function glowCircle(x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawPlayer(p, time) {
    const blink = p.iframes > 0 && Math.floor(time * 18) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (!blink) {
      glowCircle(0, 0, p.radius + 6, PALETTE.playerGlow, 0.35);
      // Ship: sleek dart pointing at aim angle
      ctx.rotate(p.angle);
      ctx.fillStyle = '#0b1026';
      ctx.strokeStyle = PALETTE.player;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-12, -12);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-12, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Cockpit
      ctx.fillStyle = '#dff6ff';
      ctx.beginPath();
      ctx.arc(6, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      // Engine flame when dashing
      if (p.dashTimer > 0) {
        ctx.fillStyle = 'rgba(76, 201, 240, 0.8)';
        ctx.beginPath();
        ctx.moveTo(-12, -5);
        ctx.lineTo(-30 - Math.random() * 10, 0);
        ctx.lineTo(-12, 5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    // Shield ring
    if (p.shieldTimer > 0) {
      ctx.strokeStyle = 'rgba(76, 201, 240, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 10 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Dash cooldown arc under the player
    if (p.dashCooldown > 0) {
      const frac = 1 - p.dashCooldown / 1.6;
      ctx.strokeStyle = 'rgba(139, 147, 163, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawEnemy(e, time) {
    ctx.save();
    ctx.translate(e.x, e.y);
    const spawnScale = e.spawnT > 0 ? 1 - e.spawnT / 0.35 : 1;
    ctx.scale(spawnScale, spawnScale);
    const flash = e.flash > 0;
    const color = flash ? '#ffffff' : e.color;
    glowCircle(0, 0, e.radius, e.glow, e.elite ? 0.5 : 0.3);
    ctx.fillStyle = 'rgba(5, 6, 15, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = e.elite ? 3.5 : 2.5;
    ctx.beginPath();
    if (e.kind === 'drifter') {
      // Spiked triangle
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2 + time * 1.5;
        const x = Math.cos(a) * e.radius;
        const y = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (e.kind === 'spitter') {
      // Diamond with eye
      ctx.moveTo(0, -e.radius); ctx.lineTo(e.radius, 0); ctx.lineTo(0, e.radius); ctx.lineTo(-e.radius, 0);
      ctx.closePath();
    } else if (e.kind === 'brute') {
      // Hexagon
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const x = Math.cos(a) * e.radius;
        const y = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (e.kind === 'splitter' || e.kind === 'mote') {
      // Square, rotating
      ctx.rotate(time * 2 + e.wobble);
      ctx.rect(-e.radius * 0.8, -e.radius * 0.8, e.radius * 1.6, e.radius * 1.6);
    } else if (e.kind === 'boss') {
      // Big rotating hex with inner ring
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + time * 0.5;
        const x = Math.cos(a) * e.radius;
        const y = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    // Core
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(3, e.radius * 0.28), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Elite crown
    if (e.elite) {
      ctx.fillStyle = '#ffd60a';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('★', e.x, e.y - e.radius - 8);
    }
    // HP bar for tough enemies
    if (e.maxHp > 40 && e.hp < e.maxHp) {
      const w = e.radius * 2;
      const y = e.y - e.radius - 10;
      ctx.fillStyle = 'rgba(10, 14, 32, 0.8)';
      ctx.fillRect(e.x - w / 2, y, w, 5);
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 5);
    }
  }

  function drawBullets(state) {
    for (const b of state.bullets) {
      // Trail: a short line behind the bullet, so fire reads as streams of light.
      ctx.strokeStyle = 'rgba(255, 230, 109, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      glowCircle(b.x, b.y, 6, '#ffe66d', 0.5);
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of state.enemyBullets) {
      glowCircle(b.x, b.y, 7, '#ff70a6', 0.5);
      ctx.fillStyle = '#ff70a6';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPickups(state, time) {
    for (const pk of state.pickups) {
      const bob = Math.sin(time * 4 + pk.bob) * 3;
      const y = pk.y + bob;
      const blink = pk.life < 3 && Math.floor(time * 6) % 2 === 0;
      if (blink) continue;
      glowCircle(pk.x, y, pk.radius + 4, pk.color, 0.45);
      ctx.fillStyle = 'rgba(5, 6, 15, 0.9)';
      ctx.strokeStyle = pk.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pk.x, y, pk.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pk.color;
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'shield' ? '◉' : '»', pk.x, y + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function drawFx(state) {
    for (const pt of state.particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * a + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of state.texts) {
      const a = Math.max(0, t.life / t.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color;
      ctx.font = `bold ${t.size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function bar(x, y, w, h, frac, color, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
    ctx.strokeStyle = 'rgba(238, 241, 245, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  function drawHud(state, best) {
    const p = state.player;
    // Top-left: score, combo, wave
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText(String(state.score).padStart(6, '0'), 24, 44);
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`WAVE ${Math.max(1, state.wave)}`, 24, 68);
    if (state.combo > 1) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText(`COMBO ×${state.combo}`, 24, 92);
    }
    // Top-right: best, kills
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText(`BEST ${Math.max(best, state.score)}`, FIELD.width - 24, 40);
    ctx.fillText(`KILLS ${state.kills}`, FIELD.width - 24, 62);
    // Bottom-left: HP bar + timers
    ctx.textAlign = 'left';
    bar(24, FIELD.height - 44, 240, 16, p.hp / p.maxHp, p.hp > 30 ? '#80ed99' : '#ff4d6d', 'rgba(10, 14, 32, 0.8)');
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText(`HULL ${Math.ceil(p.hp)} / ${p.maxHp}`, 24, FIELD.height - 52);
    if (p.shieldTimer > 0) { ctx.fillStyle = '#4cc9f0'; ctx.fillText(`◉ SHIELD ${Math.ceil(p.shieldTimer)}s`, 280, FIELD.height - 32); }
    if (p.rapidTimer > 0) { ctx.fillStyle = '#ffd60a'; ctx.fillText(`» RAPID ${Math.ceil(p.rapidTimer)}s`, 280, FIELD.height - 32); }
    // Bottom-right: dash status + upgrades
    ctx.textAlign = 'right';
    ctx.fillStyle = p.dashCooldown <= 0 ? '#4cc9f0' : PALETTE.muted;
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText(p.dashCooldown <= 0 ? 'SHIFT — DASH READY' : 'DASH…', FIELD.width - 24, FIELD.height - 32);
    if (p.upgradesTaken.length > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `13px ${FONT}`;
      ctx.fillText(`UPGRADES ${p.upgradesTaken.length}`, FIELD.width - 24, FIELD.height - 52);
    }
    // Boss HP bar
    if (state.boss) {
      const b = state.boss;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff2e63';
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText('— VOIDLORD —', FIELD.width / 2, 30);
      bar(FIELD.width / 2 - 220, 40, 440, 12, b.hp / b.maxHp, '#ff2e63', 'rgba(10, 14, 32, 0.85)');
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(5, 6, 15, 0.45)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    // Logo
    ctx.save();
    ctx.shadowColor = '#4cc9f0';
    ctx.shadowBlur = 34;
    ctx.fillStyle = '#eafcff';
    ctx.font = `900 92px ${FONT}`;
    ctx.fillText('NEONVOID', FIELD.width / 2, 250);
    ctx.restore();
    ctx.fillStyle = '#ff4d6d';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText('A R E N A   S U R V I V A L', FIELD.width / 2, 292);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `18px ${FONT}`;
    ctx.fillText('WASD / arrows to fly  ·  mouse to aim  ·  hold click to fire', FIELD.width / 2, 350);
    ctx.fillText('SHIFT to dash through danger  ·  P to pause  ·  M to mute', FIELD.width / 2, 378);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('Survive the waves. Kill the Voidlord every 5th wave.', FIELD.width / 2, 414);
    ctx.fillText('Between waves, pick 1 of 3 upgrades. How long can you last?', FIELD.width / 2, 438);
    // Start button
    const pulse = 0.75 + 0.25 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#4cc9f0';
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText('— CLICK OR PRESS SPACE TO START —', FIELD.width / 2, 520);
    ctx.globalAlpha = 1;
    if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText(`BEST SCORE  ${best}`, FIELD.width / 2, 566);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText('No downloads. No network. Just you, the void, and a very loud ship.', FIELD.width / 2, 640);
  }

  function drawUpgrade(state) {
    ctx.fillStyle = 'rgba(5, 6, 15, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 180);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `20px ${FONT}`;
    ctx.fillText('Choose one upgrade — click a card, or press 1 / 2 / 3', FIELD.width / 2, 224);
    const rects = upgradeCardRects();
    state.upgradeChoices.forEach((u, i) => {
      const r = rects[i];
      panel(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#4cc9f0';
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText(`[${i + 1}]`, r.x + r.w / 2, r.y + 30);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 19px ${FONT}`;
      ctx.fillText(u.name, r.x + r.w / 2, r.y + 62);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `15px ${FONT}`;
      ctx.fillText(u.desc, r.x + r.w / 2, r.y + 94);
      ctx.fillStyle = '#ffd60a';
      ctx.font = `13px ${FONT}`;
      ctx.fillText('CLICK TO TAKE', r.x + r.w / 2, r.y + 126);
    });
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText(`Score ${state.score}  ·  Hull ${Math.ceil(state.player.hp)}/${state.player.maxHp}  ·  Next: wave ${state.wave + 1}`, FIELD.width / 2, 520);
  }

  function drawPaused(state, best) {
    ctx.fillStyle = 'rgba(5, 6, 15, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 48px ${FONT}`;
    ctx.fillText('PAUSED', FIELD.width / 2, 320);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `18px ${FONT}`;
    ctx.fillText('P or Esc to resume  ·  M to mute', FIELD.width / 2, 364);
    void state; void best;
  }

  function drawOver(state, best, stats) {
    ctx.fillStyle = 'rgba(5, 6, 15, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d6d';
    ctx.font = `bold 56px ${FONT}`;
    ctx.fillText('SHIP DESTROYED', FIELD.width / 2, 210);
    const isBest = state.score >= best && state.score > 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(`SCORE  ${state.score}`, FIELD.width / 2, 280);
    if (isBest) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('★ NEW BEST SCORE ★', FIELD.width / 2, 316);
    } else {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `18px ${FONT}`;
      ctx.fillText(`Best ${best}`, FIELD.width / 2, 316);
    }
    ctx.fillStyle = PALETTE.text;
    ctx.font = `18px ${FONT}`;
    const acc = state.shotsFired > 0 ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
    ctx.fillText(`Waves cleared ${stats.wavesCleared}  ·  Kills ${state.kills}  ·  Accuracy ${acc}%  ·  Time ${Math.floor(state.time)}s`, FIELD.width / 2, 366);
    ctx.fillText(`Voidlords destroyed ${stats.bossesKilled}  ·  Upgrades taken ${state.player.upgradesTaken.length}`, FIELD.width / 2, 396);
    const pulse = 0.75 + 0.25 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#4cc9f0';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText('— PRESS SPACE OR CLICK TO FLY AGAIN —', FIELD.width / 2, 480);
    ctx.globalAlpha = 1;
  }

  function drawIntermission(state) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText('GET READY…', FIELD.width / 2, FIELD.height / 2 - 20);
  }

  function draw(state, screen, best, time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.setTransform(scale, 0, 0, scale, offsetX + shakeX * scale, offsetY + shakeY * scale);
    drawBackground(state, time);
    drawPickups(state, time);
    for (const e of state.enemies) drawEnemy(e, time);
    if (state.player && screen !== SCREEN_TITLE) drawPlayer(state.player, time);
    drawBullets(state);
    drawFx(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_UPGRADE) drawHud(state, best);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(state);
    else if (screen === SCREEN_PAUSED) drawPaused(state, best);
    else if (screen === SCREEN_OVER) drawOver(state, best, state.stats);
    else if (state.phase === 'intermission') drawIntermission(state);
    // Vignette
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    const vg = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.45, FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  return { draw, toField, resize };
}
