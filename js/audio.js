// Every sound is synthesised in the browser (Web Audio); there are no audio files.

let ctx = null;
let out = null;
let loud = null; // separate, overdriven bus for the explosion
let noiseBuf = null;
let enabled = true;
let vibOn = true;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(comp);
    comp.connect(ctx.destination);
    // Explosion bus: distortion, more level, a hard limiter instead of the gentle compressor
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 3.2);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const boost = ctx.createGain();
    boost.gain.value = 1.5;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.25;
    shaper.connect(boost);
    boost.connect(limiter);
    limiter.connect(ctx.destination);
    loud = shaper;
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // iOS: keep playing with the silent switch on, where the browser offers it
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ f = 440, f2 = null, type = 'sine', t = 0, d = 0.1, g = 0.2, a = 0.004, big = false }) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + t;
  const o = c.createOscillator();
  const v = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  v.gain.setValueAtTime(0.0001, t0);
  v.gain.exponentialRampToValueAtTime(g, t0 + a);
  v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(v);
  v.connect(big ? loud : out);
  o.start(t0);
  o.stop(t0 + d + 0.02);
}

function noise({ f = 1000, f2 = null, q = 1, type = 'bandpass', t = 0, d = 0.1, g = 0.2, a = 0.002, big = false }) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + t;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const fl = c.createBiquadFilter();
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t0);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  const v = c.createGain();
  v.gain.setValueAtTime(0.0001, t0);
  v.gain.exponentialRampToValueAtTime(g, t0 + a);
  v.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  s.connect(fl);
  fl.connect(v);
  v.connect(big ? loud : out);
  s.start(t0, Math.random());
  s.stop(t0 + d + 0.02);
}

function vib(pattern) {
  if (!vibOn || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}

export const sfx = {
  setSound(on) { enabled = !!on; },
  setVibration(on) { vibOn = !!on; if (!on && navigator.vibrate) { try { navigator.vibrate(0); } catch (e) { /* ignore */ } } },
  canVibrate() { return typeof navigator.vibrate === 'function'; },
  unlock() { ac(); },

  tap() { tone({ f: 520, f2: 380, type: 'triangle', d: 0.06, g: 0.16 }); },
  nav() { tone({ f: 330, f2: 440, type: 'triangle', d: 0.09, g: 0.14 }); },
  backNav() { tone({ f: 440, f2: 300, type: 'triangle', d: 0.09, g: 0.14 }); },
  on() { tone({ f: 440, type: 'triangle', d: 0.07, g: 0.15 }); tone({ f: 660, type: 'triangle', t: 0.06, d: 0.1, g: 0.15 }); },
  off() { tone({ f: 520, type: 'triangle', d: 0.07, g: 0.14 }); tone({ f: 330, type: 'triangle', t: 0.06, d: 0.1, g: 0.14 }); },
  step(up) { tone({ f: up ? 600 : 420, type: 'square', d: 0.04, g: 0.07 }); },
  deny() { tone({ f: 160, type: 'sawtooth', d: 0.12, g: 0.12 }); tone({ f: 140, type: 'sawtooth', t: 0.13, d: 0.14, g: 0.12 }); vib([30, 40, 30]); },
  sheet() { noise({ f: 900, f2: 2400, q: 0.8, d: 0.12, g: 0.08 }); },

  // Dice: a dry click that drops in pitch as the roll slows down
  diceTick(i = 0) {
    const f = 1500 - Math.min(i, 14) * 45;
    noise({ f, q: 9, d: 0.035, g: 0.5 });
    tone({ f: f / 2.5, type: 'square', d: 0.025, g: 0.05 });
    vib(6);
  },
  land() {
    tone({ f: 150, f2: 55, d: 0.28, g: 0.5 });
    noise({ f: 700, f2: 200, q: 0.7, d: 0.16, g: 0.3 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ f, type: 'triangle', t: 0.05 + i * 0.045, d: 0.5, g: 0.11 }));
    vib([25, 30, 45]);
  },
  whoosh() { noise({ f: 500, f2: 3200, q: 0.9, d: 0.22, g: 0.12, a: 0.05 }); },
  ready() {
    tone({ f: 392, type: 'triangle', d: 0.1, g: 0.16 });
    tone({ f: 523.25, type: 'triangle', t: 0.08, d: 0.1, g: 0.16 });
    tone({ f: 783.99, type: 'triangle', t: 0.16, d: 0.28, g: 0.16 });
    vib(20);
  },
  reveal() {
    tone({ f: 587.33, type: 'triangle', d: 0.12, g: 0.14 });
    tone({ f: 880, type: 'triangle', t: 0.09, d: 0.3, g: 0.14 });
  },
  pick() { tone({ f: 392, type: 'triangle', d: 0.08, g: 0.16 }); tone({ f: 523.25, type: 'triangle', t: 0.07, d: 0.16, g: 0.16 }); },

  // Match strike and hiss
  ignite() {
    noise({ f: 3000, f2: 6000, q: 0.6, type: 'highpass', d: 0.09, g: 0.3 });
    noise({ f: 1200, f2: 5200, q: 0.9, t: 0.08, d: 0.75, g: 0.2, a: 0.08 });
    tone({ f: 90, f2: 180, type: 'sine', t: 0.08, d: 0.4, g: 0.16, a: 0.05 });
    vib(40);
  },
  tick(alt) {
    const f = alt ? 1050 : 1500;
    noise({ f, q: 14, d: 0.045, g: 0.9 });
    tone({ f: alt ? 210 : 300, type: 'sine', d: 0.04, g: 0.1 });
    vib(alt ? 8 : 12);
  },
  pause() { tone({ f: 500, f2: 250, type: 'triangle', d: 0.25, g: 0.16 }); },
  resume() { tone({ f: 250, f2: 500, type: 'triangle', d: 0.2, g: 0.16 }); },

  boom() {
    // Small phone speakers barely reproduce bass, so the punch sits in the mids:
    // sharp crack, distorted body, second hit, long rumble, falling debris.
    const b = { big: true };
    noise({ ...b, f: 1800, q: 0.5, type: 'highpass', d: 0.07, g: 1.4, a: 0.001 });
    noise({ ...b, f: 2600, f2: 240, q: 0.45, d: 1.3, g: 1.5, a: 0.001 });
    noise({ ...b, f: 6000, f2: 150, q: 0.4, type: 'lowpass', d: 2.4, g: 1.1, a: 0.001 });
    tone({ ...b, f: 320, f2: 38, type: 'sawtooth', d: 1.0, g: 0.9, a: 0.001 });
    tone({ ...b, f: 180, f2: 30, type: 'sine', d: 1.8, g: 1.2, a: 0.001 });
    tone({ ...b, f: 110, f2: 45, type: 'square', d: 0.55, g: 0.45, a: 0.001 });
    // second hit and echo
    noise({ ...b, f: 1300, f2: 200, q: 0.5, t: 0.13, d: 0.9, g: 0.9, a: 0.004 });
    tone({ ...b, f: 150, f2: 34, type: 'sawtooth', t: 0.13, d: 0.8, g: 0.6, a: 0.004 });
    noise({ ...b, f: 900, f2: 160, q: 0.5, t: 0.34, d: 0.9, g: 0.5, a: 0.01 });
    // rumble
    noise({ ...b, f: 520, f2: 90, q: 0.8, type: 'lowpass', t: 0.45, d: 2.8, g: 0.7, a: 0.25 });
    tone({ ...b, f: 70, f2: 40, type: 'triangle', t: 0.4, d: 2.2, g: 0.5, a: 0.2 });
    for (let i = 0; i < 16; i++) {
      noise({ ...b, f: 1500 + Math.random() * 4000, q: 10, t: 0.35 + Math.random() * 2.0, d: 0.035, g: 0.22 });
    }
    vib([600, 60, 320, 60, 220, 60, 140, 60, 80]);
  },

  finale() {
    [392, 392, 311.13, 261.63].forEach((f, i) => tone({ f, type: 'sawtooth', t: i * 0.24, d: i === 3 ? 0.9 : 0.2, g: 0.09 }));
    [523.25, 659.25, 783.99].forEach((f) => tone({ f, type: 'triangle', t: 1.15, d: 0.9, g: 0.09 }));
  },
};
