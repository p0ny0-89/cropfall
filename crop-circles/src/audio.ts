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
  freq: number;
  trill: number;
  amp: number;
  dur: [number, number];
  pan: [number, number];
  lp: number;
}

// a few cricket "voices" — different pitches, trill rates, distances & pans
const VOICES: Voice[] = [
  { freq: 4600, trill: 34, amp: 0.085, dur: [0.25, 0.6], pan: [-0.7, -0.2], lp: 6500 },
  { freq: 5050, trill: 42, amp: 0.06, dur: [0.2, 0.5], pan: [0.2, 0.7], lp: 6000 },
  { freq: 4250, trill: 28, amp: 0.05, dur: [0.4, 0.9], pan: [-0.2, 0.3], lp: 5200 },
  { freq: 5450, trill: 48, amp: 0.03, dur: [0.15, 0.35], pan: [0.4, 0.95], lp: 4200 },
];

// one cricket trill: a tone gated by a fast LFO, inside an attack/decay envelope
function chirp(v: Voice) {
  if (!ctx || !master) return;
  const c = ctx;
  const t = c.currentTime + 0.02;
  const dur = v.dur[0] + Math.random() * (v.dur[1] - v.dur[0]);

  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = v.freq * (0.97 + Math.random() * 0.06);

  const trillGain = c.createGain();
  trillGain.gain.value = 0.5;
  const lfo = c.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = v.trill * (0.9 + Math.random() * 0.2);
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.5;
  lfo.connect(lfoGain).connect(trillGain.gain);

  const env = c.createGain();
  env.gain.value = 0;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = v.lp;
  const pan = c.createStereoPanner();
  pan.pan.value = v.pan[0] + Math.random() * (v.pan[1] - v.pan[0]);

  osc.connect(trillGain).connect(env).connect(lp).connect(pan).connect(master);

  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(v.amp, t + 0.03);
  env.gain.setValueAtTime(v.amp, t + dur - 0.05);
  env.gain.linearRampToValueAtTime(0, t + dur);

  const end = t + dur + 0.05;
  osc.start(t);
  lfo.start(t);
  osc.stop(end);
  lfo.stop(end);
}

function loop() {
  if (!running) return;
  chirp(VOICES[Math.floor(Math.random() * VOICES.length)]);
  // occasional answering chirp from another cricket
  if (Math.random() < 0.35) {
    window.setTimeout(
      () => running && chirp(VOICES[Math.floor(Math.random() * VOICES.length)]),
      120 + Math.random() * 220
    );
  }
  timer = window.setTimeout(loop, 350 + Math.random() * 1100);
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
