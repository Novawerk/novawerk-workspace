// A tiny synthesiser for video soundtracks: deterministic noise, a biquad, a dozen instruments
// (drums, bass, pads, plucks, UI sounds) and a stereo mixer with a reverb send, a ducked pad bus
// and a WAV writer. No samples, no licences. A project's music.ts arranges these on its timeline.
//
//   const mix = new Mix(duration);
//   mix.put(seconds, pluck(69), gain, pan, reverbSend);
//   mix.write(new URL("./public/music.wav", import.meta.url), { duck });

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const SR = 44100;

// --- utilities -------------------------------------------------------------------------------

let seed = 0x6e6f7661; // deterministic noise: same file every run
export function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const noise = () => rand() * 2 - 1;
export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  constructor(type: "lp" | "hp" | "bp", f: number, q = 0.707) {
    this.set(type, f, q);
  }
  set(type: "lp" | "hp" | "bp", f: number, q = 0.707) {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
    const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === "lp") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (type === "hp") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha];
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export const buf = (seconds: number) => new Float32Array(Math.round(seconds * SR));

// --- instruments -----------------------------------------------------------------------------

export function kick() {
  const s = buf(0.45);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (46 + 120 * Math.exp(-t * 32))) / SR;
    const body = Math.sin(ph) * Math.exp(-t * 6.5);
    const click = noise() * Math.exp(-t * 500) * 0.35;
    s[i] = Math.tanh(1.6 * (body + click));
  }
  return s;
}

export function hat(open = false) {
  const s = buf(open ? 0.25 : 0.07);
  const hp = new Biquad("hp", 7500, 0.8);
  for (let i = 0; i < s.length; i++) s[i] = hp.run(noise()) * Math.exp((-i / SR) * (open ? 14 : 75));
  return s;
}

export function clap() {
  const s = buf(0.3);
  const bp = new Biquad("bp", 1400, 1.2);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const bursts = [0, 0.011, 0.022].reduce((a, o) => a + (t >= o ? Math.exp(-(t - o) * 180) : 0), 0);
    s[i] = bp.run(noise()) * (bursts + 0.5 * Math.exp(-t * 16)) * 1.6;
  }
  return s;
}

export function bass(midi: number, dur: number) {
  const s = buf(dur);
  const f = mtof(midi);
  const lp = new Biquad("lp", 600, 1.1);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph = (ph + f / SR) % 1;
    const saw = 2 * ph - 1;
    const sub = Math.sin(2 * Math.PI * ph);
    lp.set("lp", 180 + 1100 * Math.exp(-t * 14), 1.1);
    const env = Math.min(1, t / 0.004) * (0.55 + 0.45 * Math.exp(-t * 10)) * Math.min(1, (dur - t) / 0.02);
    s[i] = (lp.run(saw) * 0.8 + sub * 0.5) * env;
  }
  return s;
}

/** Detuned saws through a soft low-pass; two calls give a wide stereo pair. */
export function pad(midis: number[], dur: number, cutoff = 1500, attack = 0.25) {
  const s = buf(dur);
  const voices = midis.flatMap((m) => [-0.09, 0, 0.08].map((d) => ({ f: mtof(m + d + (rand() - 0.5) * 0.04), ph: rand() })));
  const lp = new Biquad("lp", cutoff, 0.6);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    let x = 0;
    for (const v of voices) {
      v.ph = (v.ph + v.f / SR) % 1;
      x += 2 * v.ph - 1;
    }
    const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / 0.35);
    s[i] = (lp.run(x) / voices.length) * env;
  }
  return s;
}

/** Karplus–Strong pluck: a short, woody note. */
export function pluck(midi: number, dur = 0.6, bright = 0.5) {
  const s = buf(dur);
  const period = Math.round(SR / mtof(midi));
  const line = new Float32Array(period);
  let prev = 0;
  for (let i = 0; i < period; i++) {
    prev = prev * (1 - bright) + noise() * bright;
    line[i] = prev;
  }
  for (let i = 0; i < s.length; i++) {
    const k = i % period;
    const out = line[k]!;
    line[k] = 0.5 * (out + line[(k + 1) % period]!) * 0.996;
    s[i] = out * Math.min(1, (dur - i / SR) / 0.05);
  }
  return s;
}

/** A soft paper "tock" for a note landing on the pile. */
export function tock() {
  const s = buf(0.12);
  const bp = new Biquad("bp", 2400, 1.5);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (160 * Math.exp(-t * 40) + 70)) / SR;
    s[i] = Math.sin(ph) * Math.exp(-t * 45) * 0.8 + bp.run(noise()) * Math.exp(-t * 120) * 0.9;
  }
  return s;
}

/** Band-passed noise sweeping from f0 to f1, shaped by `shape(t ∈ 0…1)`. */
export function sweep(dur: number, f0: number, f1: number, shape: (x: number) => number, q = 1.4) {
  const s = buf(dur);
  const bp = new Biquad("bp", f0, q);
  for (let i = 0; i < s.length; i++) {
    const x = i / s.length;
    if (i % 32 === 0) bp.set("bp", f0 * (f1 / f0) ** x, q);
    s[i] = bp.run(noise()) * shape(x) * 2.2;
  }
  return s;
}

/** A low boom with a noise wash, for the start of a section. */
export function impact(len = 1.6) {
  const s = buf(len);
  const hp = new Biquad("hp", 3000, 0.7);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (38 + 40 * Math.exp(-t * 8))) / SR;
    s[i] = Math.sin(ph) * Math.exp(-t * 2.6) * 0.9 + hp.run(noise()) * Math.exp(-t * 3.2) * 0.35;
  }
  return s;
}

/** A cut: a dry, bright snap. */
export function snap() {
  const s = buf(0.08);
  const hp = new Biquad("hp", 2500, 0.9);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = hp.run(noise()) * Math.exp(-t * 85) + Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-t * 320) * 0.6;
  }
  return s;
}

/** One typewriter key: a bright click over a small wooden thock, a little different each time. */
export function key() {
  const s = buf(0.09);
  const bp = new Biquad("bp", 3000 + rand() * 1200, 2.2);
  const body = 150 + rand() * 60;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = bp.run(noise()) * Math.exp(-t * 260) * 1.6 + Math.sin(2 * Math.PI * body * t) * Math.exp(-t * 70) * 0.5;
  }
  return s;
}

/** The star lands: a low thud. */
export function thud() {
  const s = buf(0.5);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (52 + 90 * Math.exp(-t * 25))) / SR;
    s[i] = Math.tanh(1.4 * Math.sin(ph) * Math.exp(-t * 9));
  }
  return s;
}

/** The star unfolds: a short metallic "shing" — inharmonic partials over a rising hiss. */
export function shing() {
  const s = buf(1.4);
  const partials = [2349, 3136, 4186, 5274, 6645];
  const hiss = sweep(0.14, 1500, 9000, (x) => x ** 1.5);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    let x = 0;
    partials.forEach((f, k) => (x += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (4 + k * 1.5)) / (k + 1)));
    s[i] = x * Math.min(1, t / 0.003) * 0.6 + (hiss[i] ?? 0) * 0.5;
  }
  return s;
}

/** A robot's beep: a square-wave blip that bends up, two quick notes. */
export function beep(midi: number) {
  const s = buf(0.16);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = mtof(t < 0.06 ? midi : midi + 5) * (1 + 0.04 * Math.sin(t * 90));
    ph = (ph + f / SR) % 1;
    const env = (t < 0.06 ? Math.exp(-t * 20) : Math.exp(-(t - 0.06) * 30)) * Math.min(1, t / 0.002);
    s[i] = (ph < 0.5 ? 1 : -1) * env * 0.5;
  }
  const lp = new Biquad("lp", 3500, 0.7);
  for (let i = 0; i < s.length; i++) s[i] = lp.run(s[i]!);
  return s;
}

/** A tiny metal footstep. */
export function patter() {
  const s = buf(0.035);
  const bp = new Biquad("bp", 5200 + rand() * 1500, 3);
  for (let i = 0; i < s.length; i++) s[i] = bp.run(noise()) * Math.exp((-i / SR) * 160) * 1.8;
  return s;
}

/** A servo whir: a buzzy saw sliding up, through a band-pass. */
export function whir(dur: number) {
  const s = buf(dur);
  const bp = new Biquad("bp", 900, 2);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const x = i / s.length;
    ph = (ph + (110 + 260 * x) / SR) % 1;
    if (i % 64 === 0) bp.set("bp", 700 + 2200 * x, 2);
    s[i] = bp.run(2 * ph - 1) * Math.sin(Math.PI * x) * 1.4;
  }
  return s;
}

// --- mixer -----------------------------------------------------------------------------------

export class Mix {
  readonly duration: number;
  readonly n: number;
  readonly l: Float32Array;
  readonly r: Float32Array;
  readonly send: Float32Array; // reverb bus (mono in)
  readonly padL: Float32Array; // the "pad" bus, ducked on write
  readonly padR: Float32Array;

  constructor(duration: number) {
    this.duration = duration;
    this.n = Math.ceil(duration * SR);
    this.l = new Float32Array(this.n);
    this.r = new Float32Array(this.n);
    this.send = new Float32Array(this.n);
    this.padL = new Float32Array(this.n);
    this.padR = new Float32Array(this.n);
  }

  /** Mix a mono sound in at `t` seconds, panned (-1 … 1), with a reverb send. */
  put = (t: number, s: Float32Array, gain: number, pan = 0, send = 0, bus: "main" | "pad" = "main") => {
    const l = bus === "pad" ? this.padL : this.l;
    const r = bus === "pad" ? this.padR : this.r;
    const start = Math.round(t * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < s.length; i++) {
      const j = start + i;
      if (j < 0 || j >= this.n) continue;
      l[j]! += s[i]! * gl;
      r[j]! += s[i]! * gr;
      this.send[j]! += s[i]! * gain * send;
    }
  };

  /**
   * Fold the pad bus in (times `duck(t)`, for a sidechain), add the reverb, soft-clip, normalise
   * to -1 dBFS, fade the last `fadeOut` seconds and write a 16-bit stereo WAV.
   */
  write(file: URL | string, { duck = () => 1, fadeOut = 1.2 }: { duck?: (t: number) => number; fadeOut?: number } = {}) {
    const { n, l: L, r: R, send: SEND } = this;
    for (let j = 0; j < n; j++) {
      const d = duck(j / SR);
      L[j]! += this.padL[j]! * d;
      R[j]! += this.padR[j]! * d;
      SEND[j]! += (this.padL[j]! + this.padR[j]!) * 0.15 * d;
    }
    const wetL = reverb(SEND, 0), wetR = reverb(SEND, 23);
    let peak = 0;
    for (let j = 0; j < n; j++) {
      L[j] = Math.tanh((L[j]! + wetL[j]! * 0.9) * 1.1);
      R[j] = Math.tanh((R[j]! + wetR[j]! * 0.9) * 1.1);
      peak = Math.max(peak, Math.abs(L[j]!), Math.abs(R[j]!));
    }
    const norm = 0.89 / peak;
    const fadeFrom = (this.duration - fadeOut) * SR;
    const pcm = Buffer.alloc(44 + n * 4);
    pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write("WAVE", 8);
    pcm.write("fmt ", 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
    pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
    pcm.write("data", 36); pcm.writeUInt32LE(n * 4, 40);
    for (let j = 0; j < n; j++) {
      const fade = j > fadeFrom ? 1 - (j - fadeFrom) / (n - fadeFrom) : 1;
      pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[j]! * norm * fade)) * 32767), 44 + j * 4);
      pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[j]! * norm * fade)) * 32767), 46 + j * 4);
    }
    const path = typeof file === "string" ? file : fileURLToPath(file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, pcm);
    return { peak };
  }
}

/** A small Schroeder reverb. */
function reverb(input: Float32Array, spread: number) {
  const N = input.length;
  const out = new Float32Array(N);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => ({ line: new Float32Array(d + spread), i: 0, lp: 0 }));
  for (let j = 0; j < N; j++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.line[c.i]!;
      c.lp = y * 0.7 + c.lp * 0.3;
      c.line[c.i] = input[j]! * 0.015 + c.lp * 0.84;
      c.i = (c.i + 1) % c.line.length;
      acc += y;
    }
    out[j] = acc;
  }
  for (const d of [556 + spread, 441 + spread, 341 + spread]) {
    const line = new Float32Array(d);
    let k = 0;
    for (let j = 0; j < N; j++) {
      const b = line[k]!;
      const x = out[j]!;
      line[k] = x + b * 0.5;
      out[j] = b - x * 0.5;
      k = (k + 1) % d;
    }
  }
  return out;
}

/** Call `fn` every `step` seconds from `from` up to (not including) `to`. */
export function each(from: number, to: number, step: number, fn: (t: number, i: number) => void) {
  for (let i = 0, t = from; t < to - 1e-9; i++, t = from + i * step) fn(t, i);
}
