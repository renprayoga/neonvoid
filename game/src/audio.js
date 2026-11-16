// All sound is synthesized with WebAudio: no audio files, no network. A tiny
// oscillator/noise synth for effects, plus a quiet looping bass line for music.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.12;
      musicGain.connect(master);
    } catch {
      return false;
    }
    return true;
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* audio is decoration, never fatal */ }
  }

  function noise(dur, vol, lowpass) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    } catch { /* audio is decoration, never fatal */ }
  }

  // A minor-key bass walk, one note every 240 ms, scheduled ahead in small steps.
  const BASS = [55, 55, 65.41, 55, 49, 55, 82.41, 73.42];
  function startMusic() {
    if (!ensure() || musicTimer !== null) return;
    musicStep = 0;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const freq = BASS[musicStep % BASS.length];
      musicStep += 1;
      try {
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(t0);
        osc.stop(t0 + 0.24);
      } catch { /* ignore */ }
    }, 240);
  }

  return {
    unlock() { resume(); startMusic(); },
    setMuted(value) { muted = value; if (master) master.gain.value = value ? 0 : 0.5; },
    isMuted() { return muted; },
    shoot() { tone(880, 0.07, 'square', 0.08, 320); },
    hit() { tone(220, 0.06, 'sawtooth', 0.1, 140); },
    explode() { noise(0.35, 0.35, 900); tone(120, 0.3, 'sine', 0.3, 40); },
    hurt() { tone(160, 0.25, 'sawtooth', 0.25, 60); noise(0.15, 0.2, 600); },
    pickup() { tone(660, 0.09, 'sine', 0.18, 990); },
    dash() { noise(0.12, 0.15, 2400); },
    upgrade() { tone(523, 0.12, 'sine', 0.2); tone(784, 0.18, 'sine', 0.2); },
    wave() { tone(392, 0.15, 'square', 0.14, 523); tone(523, 0.2, 'square', 0.14, 784); },
    boss() { tone(98, 0.5, 'sawtooth', 0.3, 49); noise(0.4, 0.2, 500); },
    gameOver() { tone(392, 0.3, 'triangle', 0.2, 196); tone(294, 0.4, 'triangle', 0.2, 147); },
    click() { tone(700, 0.05, 'sine', 0.12); },
  };
}
