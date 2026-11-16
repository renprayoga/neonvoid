// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };
export const STEP = 1 / 60; // fixed simulation step, 60 updates a second

export const PLAYER = {
  radius: 14,
  speed: 300,
  accel: 2600,
  friction: 6.5,
  maxHp: 100,
  fireInterval: 0.16,
  bulletSpeed: 640,
  bulletDamage: 12,
  dashSpeed: 900,
  dashTime: 0.16,
  dashCooldown: 1.6,
  dashIframes: 0.28,
  invulnerable: 0.8,
  pickupRadius: 90,
};

export const ENEMIES = {
  drifter:  { radius: 16, hp: 22,  speed: 110, damage: 10, score: 50,  color: '#ff4d6d', glow: '#ff4d6d' },
  spitter:  { radius: 15, hp: 18,  speed: 85,  damage: 8,  score: 80,  color: '#c77dff', glow: '#c77dff', range: 340, fireInterval: 2.2, bulletSpeed: 220 },
  brute:    { radius: 26, hp: 90,  speed: 55,  damage: 18, score: 150, color: '#ff9f1c', glow: '#ff9f1c' },
  splitter: { radius: 18, hp: 26,  speed: 130, damage: 9,  score: 70,  color: '#2ec4b6', glow: '#2ec4b6' },
  mote:     { radius: 9,  hp: 8,   speed: 210, damage: 6,  score: 25,  color: '#80ed99', glow: '#80ed99' },
  boss:     { radius: 52, hp: 900, speed: 62,  damage: 24, score: 2000, color: '#ff2e63', glow: '#ff2e63' },
};

export const WAVES = {
  // seconds of calm between waves, and the wave at which the boss appears
  intermission: 4,
  bossEvery: 5,
  // base spawn budget: count = base + perWave * (wave - 1), split across kinds
  baseCount: 8,
  perWave: 4,
  maxAlive: 30,
  spawnInterval: 0.55,
};

export const UPGRADES = [
  { id: 'damage',   name: 'OVERCHARGE',  desc: '+25% bullet damage',        apply: (p) => { p.damageMul *= 1.25; } },
  { id: 'firerate', name: 'RAPID CYCLER', desc: '+20% fire rate',           apply: (p) => { p.fireMul *= 1.2; } },
  { id: 'multishot',name: 'SPLIT SHOT',  desc: '+1 bullet per shot',        apply: (p) => { p.shots += 1; } },
  { id: 'pierce',   name: 'RAILGUN',     desc: 'Bullets pierce +1 enemy',   apply: (p) => { p.pierce += 1; } },
  { id: 'speed',    name: 'ION THRUSTERS', desc: '+12% move speed',         apply: (p) => { p.speedMul *= 1.12; } },
  { id: 'maxhp',    name: 'REINFORCED HULL', desc: '+25 max HP and heal 25', apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: 'dash',     name: 'PHASE DASH',  desc: 'Dash recharges 35% faster', apply: (p) => { p.dashMul *= 1.35; } },
  { id: 'magnet',   name: 'TRACTOR FIELD', desc: '+60% pickup radius',      apply: (p) => { p.magnetMul *= 1.6; } },
  { id: 'explosive',name: 'NOVA ROUNDS', desc: 'Bullets explode on hit',    apply: (p) => { p.explosive = true; } },
  { id: 'regen',    name: 'NANO WEAVE',  desc: 'Regenerate 1.0 HP / second', apply: (p) => { p.regen += 1.0; } },
];

export const PICKUPS = {
  health: { radius: 12, heal: 25, color: '#80ed99', weight: 3 },
  shield: { radius: 12, time: 6, color: '#4cc9f0', weight: 2 },
  rapid:  { radius: 12, time: 6, color: '#ffd60a', weight: 2 },
};

export const PALETTE = {
  backdrop: '#05060f',
  grid: '#12162e',
  gridBright: '#1b2142',
  player: '#4cc9f0',
  playerGlow: '#4cc9f0',
  bullet: '#ffe66d',
  enemyBullet: '#ff70a6',
  text: '#eef1f5',
  muted: '#8b93a3',
  panel: 'rgba(10, 14, 32, 0.82)',
  panelEdge: '#2a3358',
  danger: '#ff4d6d',
  gold: '#ffd60a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const BEST_KEY = 'neonvoid.best';
export const MUTE_KEY = 'neonvoid.muted';
