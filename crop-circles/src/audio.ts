// Procedural night-field ambience — crickets, a distant insect shimmer and a
// soft wind bed, all synthesised with the Web Audio API. No audio files, so it
// works offline and inside cross-origin iframes (e.g. Framer). Sound is created
// lazily on the first user gesture (the unmute click) per autoplay policy.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let built = false;
let running = false;
let timer: number | null = null;

function whiteBuffer(seconds: number): AudioBuffer {
  const len = Math.floor(ctx!.sampleRate * seconds);
  const buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function brownBuffer(seconds: number): AudioBuffer {
  const len = Math.floor(ctx!.sampleRate * seconds);
  const buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.2;
  }
  return buf;
}

// continuous beds: soft wind + a faint shimmering wash of distant insects
function buildBed() {
  const c = ctx!;
  // wind
  const wind = c.createBufferSource();
  wind.buffer = brownBuffer(4);
  wind.loop = true;
  const wlp = c.createBiquadFilter();
  wlp.type = "lowpass";
  wlp.frequency.value = 320;
  const wg = c.createGain();
  wg.gain.value = 0.05;
  wind.connect(wlp).connect(wg).connect(master!);
  const wlfo = c.createOscillator();
  wlfo.frequency.value = 0.06;
  const wlg = c.createGain();
  wlg.gain.value = 0.025;
  wlfo.connect(wlg).connect(wg.gain);
  wlfo.start();
  wind.start();

  // distant insect shimmer
  const sh = c.createBufferSource();
  sh.buffer = whiteBuffer(4);
  sh.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 4800;
  bp.Q.value = 7;
  const sg = c.createGain();
  sg.gain.value = 0.013;
  sh.connect(bp).connect(sg).connect(master!);
  const trem = c.createOscillator();
  trem.type = "sine";
  trem.frequency.value = 6.5;
  const tg = c.createGain();
  tg.gain.value = 0.007;
  trem.connect(tg).connect(sg.gain);
  trem.start();
  sh.start();

  // warm low drone
  const drone = c.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 68;
  const dg = c.createGain();
  dg.gain.value = 0.02;
  drone.connect(dg).connect(master!);
  drone.start();
}

interface Voice {
  freq: number; // pitch of the wing-stroke pulse
  amp: number;
  decay: number; // length of a single pulse (s) — short = sharper chirp
  pulseGap: [number, number]; // spacing between pulses in a chirp
  pulses: [number, number]; // how many pulses per chirp
  pan: [number, number];
}

// distinct cricket "individuals" — different pitch, pulse rate, distance & pan
const VOICES: Voice[] = [
  { freq: 4550, amp: 0.09, decay: 0.018, pulseGap: [0.03, 0.045], pulses: [3, 6], pan: [-0.65, -0.1] },
  { freq: 5050, amp: 0.07, decay: 0.014, pulseGap: [0.024, 0.036], pulses: [4, 8], pan: [0.1, 0.65] },
  { freq: 4250, amp: 0.06, decay: 0.022, pulseGap: [0.04, 0.06], pulses: [2, 4], pan: [-0.3, 0.3] },
  { freq: 5500, amp: 0.04, decay: 0.012, pulseGap: [0.02, 0.03], pulses: [5, 9], pan: [0.35, 0.95] },
];

// one wing-stroke: a short tone pulse with a sharp attack and quick decay, plus
// a tiny down-glide — this reads as a natural "chirp tick", not a synth buzz
function pulse(t: number, v: Voice, panVal: number) {
  if (!ctx || !master) return;
  const c = ctx;
  const f = v.freq * (0.985 + Math.random() * 0.03);
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(f * 1.03, t);
  osc.frequency.exponentialRampToValueAtTime(f * 0.98, t + v.decay);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v.amp, t + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.0015 + v.decay);

  const pan = c.createStereoPanner();
  pan.pan.value = panVal;

  osc.connect(g).connect(pan).connect(master);
  osc.start(t);
  osc.stop(t + v.decay + 0.02);
}

// a chirp = a quick burst of pulses from one cricket
function chirp(v: Voice, when?: number) {
  if (!ctx) return;
  const t0 = when ?? ctx.currentTime + 0.03;
  const n = v.pulses[0] + Math.floor(Math.random() * (v.pulses[1] - v.pulses[0] + 1));
  const gap = v.pulseGap[0] + Math.random() * (v.pulseGap[1] - v.pulseGap[0]);
  const panVal = v.pan[0] + Math.random() * (v.pan[1] - v.pan[0]);
  for (let i = 0; i < n; i++) pulse(t0 + i * gap, v, panVal);
}

// keep several crickets chirping, frequently overlapping
function loop() {
  if (!running || !ctx) return;
  const pick = () => VOICES[Math.floor(Math.random() * VOICES.length)];
  chirp(pick());
  if (Math.random() < 0.6) chirp(pick(), ctx.currentTime + 0.03 + Math.random() * 0.3);
  if (Math.random() < 0.3) chirp(pick(), ctx.currentTime + 0.05 + Math.random() * 0.5);
  timer = window.setTimeout(loop, 200 + Math.random() * 650);
}

// shared noise buffer for footsteps / rustles
let noiseBuf: AudioBuffer | null = null;
function noise(): AudioBuffer {
  if (!noiseBuf) noiseBuf = whiteBuffer(1);
  return noiseBuf;
}

// one footstep through the wheat — a soft low thud + a crunchy noise burst
export function footstep() {
  if (!ctx || !master) return;
  const c = ctx;
  const t = c.currentTime;
  const pan = c.createStereoPanner();
  pan.pan.value = (Math.random() - 0.5) * 0.3;
  pan.connect(master);

  // crunch (band-passed noise)
  const src = c.createBufferSource();
  src.buffer = noise();
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1300 * (0.8 + Math.random() * 0.5);
  bp.Q.value = 0.7;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(bp).connect(g).connect(pan);
  src.start(t);
  src.stop(t + 0.16);

  // soft thud
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(115, t);
  o.frequency.exponentialRampToValueAtTime(58, t + 0.1);
  const og = c.createGain();
  og.gain.setValueAtTime(0.11, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(og).connect(pan);
  o.start(t);
  o.stop(t + 0.14);
}

// faint, distant rustle as an alien scurries through the stalks
export function rustle(pan = 0, dur = 1.4) {
  if (!ctx || !master) return;
  const c = ctx;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise();
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3000;
  bp.Q.value = 1.1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.045, t + dur * 0.35);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  const sp = c.createStereoPanner();
  sp.pan.value = Math.max(-1, Math.min(1, pan));
  // tremolo gives it a stalk-brushing texture
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 17;
  const lg = c.createGain();
  lg.gain.value = 0.02;
  lfo.connect(lg).connect(g.gain);
  src.connect(bp).connect(g).connect(sp).connect(master);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export function setSoundEnabled(on: boolean) {
  try {
    if (on) {
      if (!ctx) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
      }
      if (!built) {
        buildBed();
        built = true;
      }
      ctx.resume();
      const now = ctx.currentTime;
      master!.gain.cancelScheduledValues(now);
      master!.gain.setValueAtTime(master!.gain.value, now);
      master!.gain.linearRampToValueAtTime(0.85, now + 1.4); // gentle fade-in
      if (!running) {
        running = true;
        loop();
      }
    } else {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (ctx && master) {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + 0.6); // fade-out
      }
    }
  } catch {
    /* audio unavailable — ignore */
  }
}
