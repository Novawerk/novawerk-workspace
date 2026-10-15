// The canvas side of the builders scene: pixel art on a low-resolution offscreen canvas, copied to
// the visible one without smoothing. Browser-only; the component starts it from an effect.

import {
  SKY_STAR_RISE,
  TOWER_N,
  toScreen,
  type Figure,
  type Geometry,
  type SceneModel,
  type Slot,
  type Tower,
} from "./model";
import type { Block, BlockArea } from "./types";

export type Hit =
  | { kind: "figure"; figure: Figure; x: number; y: number }
  | { kind: "block"; block: Block; x: number; y: number };

export type SceneOptions = {
  canvas: HTMLCanvasElement;
  model: SceneModel;
  geo: Geometry;
  /** Reduced motion: one still frame, nothing walks or gets carried. */
  still: boolean;
  /** How many of the newest blocks to carry in. */
  carry: number;
  /** Phones: fewer walkers and fewer unnamed figures. */
  small: boolean;
  compact: boolean;
  onHit: (hit: Hit | null) => void;
  /** Called once every carried block is in place. */
  onSettled: () => void;
};

const AREA_VAR: Record<BlockArea, string> = {
  web: "--bs-web",
  admin: "--bs-admin",
  api: "--bs-api",
  agents: "--bs-agents",
  docs: "--bs-docs",
  posts: "--bs-docs",
  ci: "--bs-ci",
  videos: "--bs-ci",
};

/** The Nova Star in 11×11 pixels; "c" is the core. */
const STAR_PX = [".....#.....", ".....#.....", ".....#.....", "....#c#....", "...##c##...", "###ccccc###", "...##c##...", "....#c#....", ".....#.....", ".....#.....", ".....#....."];

type Faces = [top: string, left: string, right: string];
type Colors = {
  face: Record<BlockArea, Faces>;
  ink: string;
  head: string;
  g1: string;
  g2: string;
  soil: Faces;
  ladder: string;
  star: string;
  core: string;
  coreLit: string;
  ring: string;
  shadow: string;
};

/** f > 0 lighter, f < 0 darker. Accepts #rgb and #rrggbb. */
export function shade(hex: string, f: number): string {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? [...m].map((x) => x + x).join("") : m, 16);
  if (Number.isNaN(n)) return hex;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

function readColors(el: Element): Colors {
  const cs = getComputedStyle(el);
  const g = (v: string) => cs.getPropertyValue(v).trim() || "#888888";
  const faces = (base: string): Faces => [shade(base, 0.28), base, shade(base, -0.28)];
  const face = Object.fromEntries(Object.entries(AREA_VAR).map(([a, v]) => [a, faces(g(v))])) as Record<BlockArea, Faces>;
  const ground = g("--bs-ground");
  return {
    face,
    ink: g("--bs-fig-ink"),
    head: g("--bs-fig-head"),
    g1: ground,
    g2: g("--bs-ground-2"),
    soil: [ground, g("--bs-soil"), shade(g("--bs-soil"), -0.2)],
    ladder: g("--bs-ladder"),
    star: g("--bs-star"),
    core: g("--bs-core"),
    coreLit: g("--bs-core-lit"),
    ring: g("--bs-ring"),
    shadow: g("--bs-shadow"),
  };
}

type Pose = "stand" | "walk" | "rest" | "work" | "climb" | "flag";
type Fig = Figure & { gx: number; gy: number; x0: number; y0: number; axis: number; mode: Pose; ph: number; top?: number };
type Seg = { kind: "walk" | "climb" | "place"; from: [number, number, number]; to: [number, number, number]; at: number; d: number };
type Trip = { i: number; fig: Fig | null; block: Block; start: number; segs: Seg[]; placedAt: number; dur: number };

export function startScene(o: SceneOptions) {
  const { canvas: cv, model, geo, still } = o;
  const { P, bw, bh } = geo;
  const T = geo.current;
  const N = TOWER_N;
  const R = geo.ring;
  const season = model.seasons[model.seasons.length - 1];
  const blocks = season.blocks;
  const slots = season.slots;
  const total = blocks.length;

  // The component sizes the canvas in CSS (bw·P × bh·P); the backing store follows the device.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(bw * P * dpr);
  cv.height = Math.round(bh * P * dpr);
  const ctx = cv.getContext("2d");
  const off = document.createElement("canvas");
  off.width = bw;
  off.height = bh;
  const g = off.getContext("2d");
  if (!ctx || !g) return { stop() {}, recolor() {}, clear() {} };

  let C = readColors(cv);
  const px = (x: number, y: number, w: number, h: number, f: string) => {
    g.fillStyle = f;
    g.fillRect(x, y, w, h);
  };
  const scr = (x: number, y: number, z: number) => toScreen(T, x, y, z);

  /** A cube whose top face has its top vertex at (sx, sy). */
  function cube([top, left, right]: Faces, sx: number, sy: number, c: number, h: number) {
    for (let j = 0; j < c; j++) {
      const t = sy + c / 2 + Math.floor(j / 2);
      px(sx - c + j, t, 1, h, left);
      px(sx + c - 1 - j, t, 1, h, right);
    }
    tile(top, sx, sy, c);
  }
  function tile(fill: string, sx: number, sy: number, c: number) {
    for (let r = 0; r < c; r++) {
      const hw = 2 * (r < c / 2 ? r : c - 1 - r) + 2;
      px(sx - hw, sy + r, hw * 2, 1, fill);
    }
  }
  /** A checkered ground slab with a soil edge on the two front sides. */
  function slab(t: Tower, from: number, to: number) {
    for (let x = from; x < to; x++)
      for (let y = from; y < to; y++) {
        const [sx, sy] = toScreen(t, x, y, 0);
        const fill = (x + y) & 1 ? C.g1 : C.g2;
        if (x === to - 1 || y === to - 1) cube([fill, C.soil[1], C.soil[2]], sx, sy, t.c, 2);
        else tile(fill, sx, sy, t.c);
      }
  }
  function star(cx: number, top: number, s: number, lit: boolean) {
    STAR_PX.forEach((row, r) =>
      [...row].forEach((ch, k) => {
        if (ch !== ".") px(cx - Math.floor((11 * s) / 2) + k * s, top + r * s, s, s, ch === "c" ? (lit ? C.coreLit : C.core) : C.star);
      }),
    );
  }

  // People: initiators with flags at the front, then contributors on the ground ring.
  const figs: Fig[] = geo.flags.map(([gx, gy], n) => ({ ...model.initiators[n], gx, gy, x0: gx, y0: gy, axis: 0, mode: "flag", ph: n }));
  const maxWalk = o.compact ? 2 : o.small ? 3 : 6;
  const maxQuiet = o.compact ? 3 : o.small ? 5 : 10;
  let quiet = 0;
  const cast = model.builders.filter((f) => f.person || quiet++ < maxQuiet);
  const free = geo.spots;
  let walkers = 0;
  cast.slice(0, free.length).forEach((f, i) => {
    let mode: Pose = i % 4 === 1 ? "rest" : i % 5 === 0 ? "work" : "walk";
    if (mode === "walk" && ++walkers > maxWalk) mode = "stand";
    const [gx, gy] = free[i];
    figs.push({ ...f, gx, gy, x0: gx, y0: gy, axis: i % 2, mode, ph: i * 1.9 });
  });

  // Blocks carried in: the newest `carry` of the tower being built.
  const drop = still ? 0 : Math.min(o.carry, total);
  const firstHidden = total - drop;
  const V = 1.6; // cells per second
  const VC = 2.2; // cubes per second, climbing
  const LAD = { x: N + 0.25, y: N / 2 };
  const trips: Trip[] = Array.from({ length: drop }, (_, n) => {
    const i = firstHidden + n;
    const b = slots[i];
    const fig = figs.find((q) => q.handle === blocks[i].handle && q.mode !== "flag") ?? null;
    const sx = fig ? fig.x0 : N + R - 0.5;
    const sy = fig ? fig.y0 : -R + 0.5;
    const tx = Math.min(N - 0.5, b.cx + 0.6);
    const ty = b.cy;
    const raw: [Seg["kind"], [number, number, number], [number, number, number]][] = [
      ["walk", [sx, sy, 0], [LAD.x, LAD.y, 0]],
      ["climb", [LAD.x, LAD.y, 0], [LAD.x, LAD.y, b.z]],
      ["walk", [N - 0.3, LAD.y, b.z], [tx, ty, b.z]],
      ["place", [tx, ty, b.z], [tx, ty, b.z]],
      ["walk", [tx, ty, b.z], [N - 0.3, LAD.y, b.z]],
      ["climb", [LAD.x, LAD.y, b.z], [LAD.x, LAD.y, 0]],
      ["walk", [LAD.x, LAD.y, 0], [sx, sy, 0]],
    ];
    let acc = 0;
    const segs = raw.map(([kind, from, to]) => {
      const d =
        kind === "place" ? 0.5 : kind === "climb" ? Math.abs(to[2] - from[2]) / VC + 0.05 : Math.hypot(to[0] - from[0], to[1] - from[1]) / V + 0.05;
      const s = { kind, from, to, at: acc, d };
      acc += d;
      return s;
    });
    return { i, fig, block: blocks[i], start: 0.6 + n * 2.6, segs, placedAt: segs[3].at + segs[3].d, dur: acc };
  });
  const endAt = trips.length ? Math.max(...trips.map((t) => t.start + t.dur)) : 0;
  let settled = trips.length === 0;

  function sprite(f: { area: BlockArea; ph: number }, gx: number, gy: number, gz: number, pose: Pose, t: number, carry: boolean) {
    const [sx, sy] = scr(gx, gy, gz);
    const step = Math.floor(t * 6) % 2;
    const face = C.face[f.area] ?? C.face.web;
    px(sx - 2, sy, 4, 1, C.shadow);
    if (pose === "rest") {
      px(sx - 1, sy - 1, 3, 1, C.ink);
      px(sx - 1, sy - 4, 1, 3, face[1]);
      px(sx, sy - 4, 1, 3, face[2]);
      px(sx - 1, sy - 6, 2, 2, C.head);
      return sy - 6;
    }
    if (pose === "climb") {
      px(sx - 1, sy - 2 - step, 1, 2, C.ink);
      px(sx, sy - 1 - (1 - step), 1, 2, C.ink);
    } else if (pose === "walk") {
      px(sx - 1, sy - 2, 1, 2 - step, C.ink);
      px(sx, sy - 2, 1, 1 + step, C.ink);
    } else {
      px(sx - 1, sy - 2, 1, 2, C.ink);
      px(sx, sy - 2, 1, 2, C.ink);
    }
    px(sx - 1, sy - 5, 1, 3, face[1]);
    px(sx, sy - 5, 1, 3, face[2]);
    px(sx - 1, sy - 7, 2, 2, C.head);
    if (carry) {
      px(sx - 2, sy - 7, 1, 2, face[1]);
      px(sx + 1, sy - 7, 1, 2, face[2]);
    }
    if (pose === "work") {
      if (step) {
        px(sx + 1, sy - 6, 1, 1, C.ink);
        px(sx + 2, sy - 7, 1, 1, C.ink);
      } else px(sx + 1, sy - 4, 2, 1, C.ink);
    }
    // The flag's cloth, with the project's name, is HTML laid over the canvas; this is the pole.
    if (pose === "flag") px(sx + 1, sy - 13, 1, 11, C.ink);
    return sy - 8;
  }

  const segAt = (tr: Trip, t: number): [Seg, number] | null => {
    const u = t - tr.start;
    for (const s of tr.segs) if (u < s.at + s.d) return [s, Math.max(0, (u - s.at) / s.d)];
    return null;
  };
  const lerp = (a: number[], b: number[], u: number) => a.map((v, n) => v + (b[n] - v) * u);

  let hiFig: Fig | null = null;
  let hiBlock = -1;
  let hitCubes: [number, number, number][] = [];

  function drawSkyline() {
    for (const s of geo.skyline) {
      const past = model.seasons[s.season];
      slab(s, 0, N);
      const items: { k: number; cell: Slot["cells"][number]; i: number }[] = [];
      past.slots.forEach((slot, i) => slot.cells.forEach((cell) => items.push({ k: cell.x + cell.y + cell.z * 0.01, cell, i })));
      items.sort((a, b) => a.k - b.k);
      for (const it of items) {
        const [sx, sy] = toScreen(s, it.cell.x, it.cell.y, it.cell.z + 1);
        cube(C.face[past.blocks[it.i].area] ?? C.face.web, sx, sy, s.c, s.h);
      }
      const [stx, sty] = toScreen(s, N / 2, N / 2, past.layers);
      star(stx, sty - SKY_STAR_RISE, 1, true);
    }
  }

  function frame(t: number) {
    g!.clearRect(0, 0, bw, bh);
    drawSkyline();
    slab(T, -R, N + R);

    type Item = { k: number; late?: boolean; draw: () => void };
    const items: Item[] = [];
    hitCubes = [];
    let topZ = 0;
    for (let i = 0; i < total; i++) {
      let dz = 0;
      if (i >= firstHidden) {
        const tr = trips[i - firstHidden];
        const u = t - tr.start - tr.placedAt;
        if (u < 0) continue;
        const v = Math.min(1, u / 0.45);
        dz = Math.round((1 - v) * 3 - Math.sin(Math.PI * v) * (1 - v) * 1.5);
      }
      const slot = slots[i];
      topZ = Math.max(topZ, slot.z + 1);
      for (const q of slot.cells)
        items.push({
          k: q.x + q.y + q.z * 0.01,
          draw: () => {
            const [sx, sy] = scr(q.x, q.y, q.z + 1);
            const yy = sy - dz * T.h;
            cube(C.face[blocks[i].area] ?? C.face.web, sx, yy, T.c, T.h);
            hitCubes.push([sx, yy, i]);
            if (i === hiBlock) px(sx - 1, yy - 1, 2, 1, C.ring);
          },
        });
    }
    const busy = new Set(trips.filter((tr) => t >= tr.start && t < tr.start + tr.dur && tr.fig).map((tr) => tr.fig));
    for (const f of figs) {
      f.top = undefined;
      if (busy.has(f)) continue;
      let pose = f.mode;
      if (f.mode === "walk") {
        if (still) pose = "stand";
        else {
          const s = Math.sin(t * 0.35 + f.ph) * 1.2;
          f.gx = f.axis ? f.x0 + s : f.x0;
          f.gy = f.axis ? f.y0 : f.y0 + s;
        }
      }
      if (still && pose === "work") pose = "stand";
      items.push({
        k: f.gx + f.gy + 0.5,
        draw: () => {
          f.top = sprite(f, f.gx, f.gy, 0, pose, t + f.ph, false);
          if (f === hiFig) {
            const [sx] = scr(f.gx, f.gy, 0);
            px(sx, f.top - 3, 1, 2, C.ring);
          }
        },
      });
    }
    for (const tr of trips) {
      const at = segAt(tr, t);
      if (!at) continue;
      const [s, u] = at;
      const p = lerp(s.from, s.to, s.kind === "place" ? 1 : u);
      const carry = tr.segs.indexOf(s) < 3;
      const pose: Pose = s.kind === "climb" ? "climb" : s.kind === "place" ? "stand" : "walk";
      const who = tr.fig ?? { area: tr.block.area, ph: 0 };
      items.push({
        k: p[0] + p[1] + p[2] + 0.6,
        late: p[2] > 0 || s.kind === "climb",
        draw: () => {
          const top = sprite(who, p[0], p[1], p[2], pose, t, carry);
          if (carry) {
            const [sx] = scr(p[0], p[1], p[2]);
            const fc = C.face[tr.block.area] ?? C.face.web;
            px(sx - 2, top - 3, 4, 1, fc[0]);
            px(sx - 2, top - 2, 2, 2, fc[1]);
            px(sx, top - 2, 2, 2, fc[2]);
          }
        },
      });
    }
    items.sort((a, b) => a.k - b.k);
    for (const it of items) if (!it.late) it.draw();
    // The ladder leans on the right face: after the tower, before anyone on it or on top.
    if (total > 0) {
      const [lx, ly] = scr(LAD.x, LAD.y, 0);
      const top = scr(LAD.x, LAD.y, topZ)[1] - 3;
      for (let y = ly; y > top; y--) {
        px(lx - 2, y, 1, 1, C.ladder);
        px(lx + 2, y, 1, 1, C.ladder);
        if ((ly - y) % 3 === 0) px(lx - 1, y, 3, 1, C.ladder);
      }
    }
    for (const it of items) if (it.late) it.draw();

    // The Nova Star above the tower, bobbing slowly.
    const [stx, sty] = scr(N / 2, N / 2, topZ);
    star(stx, sty - 44 + (still ? 0 : Math.round(Math.sin(t * 1.4))), 2, false);

    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.imageSmoothingEnabled = false;
    ctx!.clearRect(0, 0, cv.width, cv.height);
    ctx!.drawImage(off, 0, 0, cv.width, cv.height);

    if (!settled && t > endAt) {
      settled = true;
      o.onSettled();
    }
  }

  // The clock only runs while the scene is on screen and the tab is visible, so nothing is skipped.
  let clock = 0;
  let last: number | null = null;
  let raf = 0;
  let onScreen = true;
  let stopped = false;
  const running = () => !still && !stopped && onScreen && document.visibilityState === "visible";
  const tick = (ms: number) => {
    raf = 0;
    clock += last == null ? 0 : Math.min(0.1, (ms - last) / 1000);
    last = ms;
    frame(clock);
    if (running()) raf = requestAnimationFrame(tick);
  };
  const resume = () => {
    if (stopped) return;
    if (running()) {
      if (!raf) {
        last = null;
        raf = requestAnimationFrame(tick);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const redraw = () => {
    if (!stopped && !raf) frame(clock);
  };
  frame(0);
  resume();

  let io: IntersectionObserver | null = null;
  try {
    io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      resume();
    });
    io.observe(cv);
  } catch {
    // No IntersectionObserver: keep running.
  }
  document.addEventListener("visibilitychange", resume);

  const hit = (ev: PointerEvent): Hit | null => {
    const r = cv.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * bw;
    const y = ((ev.clientY - r.top) / r.height) * bh;
    let fig: Fig | null = null;
    for (const f of figs) {
      if (f.top == null) continue;
      const [sx, sy] = scr(f.gx, f.gy, 0);
      if (Math.abs(sx - x) <= 3 && y >= f.top - 2 && y <= sy + 1) fig = f;
    }
    if (fig) {
      const [sx] = scr(fig.gx, fig.gy, 0);
      return { kind: "figure", figure: fig, x: sx * P, y: (fig.top! - 2) * P };
    }
    const c = T.c;
    for (let n = hitCubes.length - 1; n >= 0; n--) {
      const [sx, sy, i] = hitCubes[n];
      const dx = Math.abs(x - sx);
      if (dx <= c && y >= sy && y <= sy + c + T.h && dx / c <= 1 - Math.max(0, (sy + c / 2 - y) / (c / 2))) {
        return { kind: "block", block: blocks[i], x: sx * P, y: (sy - 1) * P };
      }
    }
    return null;
  };
  const show = (h: Hit | null) => {
    const nf = h?.kind === "figure" ? (h.figure as Fig) : null;
    const nb = h?.kind === "block" ? blocks.indexOf(h.block) : -1;
    if (nf === hiFig && nb === hiBlock) return;
    hiFig = nf;
    hiBlock = nb;
    cv.dataset.hover = String(!!h);
    redraw();
    o.onHit(h);
  };
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerType === "mouse") show(hit(ev));
  };
  const onLeave = (ev: PointerEvent) => {
    // Moving onto the card (it sits over the canvas) keeps it open, so its link can be clicked.
    const to = ev.relatedTarget;
    if (ev.pointerType === "mouse" && !(to instanceof Node && cv.parentElement?.contains(to))) show(null);
  };
  // A tap (or a click) opens the card too; touch has no hover.
  const onDown = (ev: PointerEvent) => show(hit(ev));
  cv.addEventListener("pointermove", onMove);
  cv.addEventListener("pointerleave", onLeave);
  cv.addEventListener("pointerdown", onDown);

  return {
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener("visibilitychange", resume);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerleave", onLeave);
      cv.removeEventListener("pointerdown", onDown);
    },
    /** Re-read the colours after a theme change. */
    recolor() {
      C = readColors(cv);
      if (!stopped) frame(clock);
    },
    /** Close the card and clear the highlight. */
    clear() {
      show(null);
    },
  };
}
