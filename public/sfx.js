// Synthesized sound effects (WebAudio): no audio files, no dependencies.
let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem("innerlock-muted") === "1";
} catch {
  // storage unavailable: default to sound on
}

function audio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = "square", vol = 0.05, at = 0, to = null } = {}) {
  if (muted) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  start: () => [440, 660, 880].forEach((f, i) => tone(f, 0.12, { at: i * 0.09, type: "triangle" })),
  send: () => tone(520, 0.07, { to: 780, type: "triangle" }),
  tick: () => tone(1400 + Math.random() * 300, 0.02, { vol: 0.012 }),
  tool: () => tone(300, 0.09, { type: "sawtooth", vol: 0.04, to: 180 }),
  hint: () => [660, 880].forEach((f, i) => tone(f, 0.1, { at: i * 0.1, type: "sine", vol: 0.07 })),
  pass: () => tone(880, 0.09, { type: "sine", vol: 0.07 }),
  fail: () => tone(140, 0.25, { type: "sawtooth", vol: 0.07, to: 70 }),
  stamp: () => tone(90, 0.3, { type: "square", vol: 0.12, to: 40 }),
  money: () => [988, 1319, 988, 1319].forEach((f, i) => tone(f, 0.08, { at: i * 0.07, vol: 0.06 })),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { at: i * 0.12, type: "triangle", vol: 0.08 })),
  toast: () => tone(1200, 0.08, { type: "sine", vol: 0.05, to: 1800 }),
};

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem("innerlock-muted", muted ? "1" : "0");
  } catch {
    // ignore
  }
  return muted;
}
