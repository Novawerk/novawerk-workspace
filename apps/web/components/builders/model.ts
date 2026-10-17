// Pure layout for the builders scene. Everything here is a function of the block list (and, for
// the geometry, the width), so every visitor sees the same tower and the server can prerender the
// text parts. No clocks, no randomness.

import { BLOCK_AREAS, isIdea, type Block, type BlockArea, type BlockSize, type BuildersSize, type Person } from "./types";

/** Cubes a block covers, by size. */
export const CELLS: Record<BlockSize, number> = { S: 1, M: 2, L: 3, XL: 4 };
/** The tower's footprint is N×N cells. */
export const TOWER_N = 5;
/** A season ends once its tower holds this many blocks; a new tower starts beside it. */
export const SEASON_BLOCKS = 300;
/** Finished towers shown as a skyline; older ones are only counted. */
export const MAX_SKYLINE = 3;

export type Cell = { x: number; y: number; z: number };
export type Slot = { cells: Cell[]; z: number; cx: number; cy: number };

export type Season = {
  blocks: Block[];
  slots: Slot[];
  layers: number;
  finished: boolean;
  label: string;
};

export type Figure = {
  handle: string;
  person: Person | null;
  /** Merged tasks. */
  blocks: number;
  /** Accepted ideas. */
  ideas: number;
  /** The area they built in most, colouring the figure's body; "idea" for someone with only ideas. */
  area: BlockArea | "idea";
  areas: BlockArea[];
};

export type SceneModel = {
  blocks: Block[];
  seasons: Season[];
  /** Named contributors first (latest work first), then people without a public profile. */
  builders: Figure[];
  initiators: Figure[];
  peopleCount: number;
};

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Oldest first; ties by id, so the order never depends on the input order. */
export function sortBlocks(blocks: readonly Block[]): Block[] {
  return [...blocks].sort((a, b) => time(a.mergedAt) - time(b.mergedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Slots for blocks laid in order: rows of N cells, N rows a layer, each layer turned 90°. */
export function towerSlots(blocks: readonly Block[]): { slots: Slot[]; layers: number } {
  const N = TOWER_N;
  const slots: Slot[] = [];
  let z = 0;
  let row = 0;
  let col = 0;
  for (const b of blocks) {
    const len = CELLS[b.size] ?? 1;
    if (col + len > N) {
      row++;
      col = 0;
    }
    if (row >= N) {
      z++;
      row = 0;
      col = 0;
    }
    const alongX = z % 2 === 0;
    const cells: Cell[] = [];
    for (let j = 0; j < len; j++) cells.push(alongX ? { x: col + j, y: row, z } : { x: row, y: col + j, z });
    slots.push({
      cells,
      z,
      cx: cells.reduce((n, c) => n + c.x, 0) / len + 0.5,
      cy: cells.reduce((n, c) => n + c.y, 0) / len + 0.5,
    });
    col += len;
  }
  return { slots, layers: blocks.length ? z + 1 : 0 };
}

const SEASON_NAMES = ["Winter", "Winter", "Spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter"];

/** "Summer 2026", from the UTC month. December counts as the next year's winter. */
export function seasonLabel(iso: string): string {
  const d = new Date(time(iso));
  const m = d.getUTCMonth();
  return `${SEASON_NAMES[m]} ${d.getUTCFullYear() + (m === 11 ? 1 : 0)}`;
}

/** Splits sorted blocks into towers of SEASON_BLOCKS. The last one is the tower being built (maybe empty). */
export function splitSeasons(sorted: readonly Block[]): Season[] {
  const out: Season[] = [];
  for (let i = 0; i <= sorted.length; i += SEASON_BLOCKS) {
    const chunk = sorted.slice(i, i + SEASON_BLOCKS);
    const finished = chunk.length === SEASON_BLOCKS;
    out.push({ blocks: chunk, ...towerSlots(chunk), finished, label: finished ? seasonLabel(chunk[chunk.length - 1].mergedAt) : "Now" });
    if (!finished) break;
  }
  return out;
}

function mainArea(counts: Map<BlockArea, number>): BlockArea {
  let best: BlockArea = "web";
  let n = 0;
  for (const a of BLOCK_AREAS) {
    const c = counts.get(a) ?? 0;
    if (c > n) {
      best = a;
      n = c;
    }
  }
  return best;
}

export function buildModel(blocks: readonly Block[], people: readonly Person[]): SceneModel {
  const sorted = sortBlocks(blocks);
  const byHandle = new Map(people.map((p) => [p.handle, p]));
  const stats = new Map<string, { n: number; ideas: number; last: number; areas: Map<BlockArea, number> }>();
  sorted.forEach((b, i) => {
    const s = stats.get(b.handle) ?? { n: 0, ideas: 0, last: 0, areas: new Map() };
    if (isIdea(b)) s.ideas++;
    else {
      s.n++;
      if (b.area) s.areas.set(b.area, (s.areas.get(b.area) ?? 0) + 1);
    }
    s.last = i;
    stats.set(b.handle, s);
  });
  const figure = (handle: string): Figure => {
    const s = stats.get(handle);
    const areas = s ? BLOCK_AREAS.filter((a) => s.areas.has(a)) : [];
    const area = !s ? "admin" : areas.length ? mainArea(s.areas) : s.ideas ? "idea" : "admin";
    return { handle, person: byHandle.get(handle) ?? null, blocks: s?.n ?? 0, ideas: s?.ideas ?? 0, area, areas };
  };
  const last = (h: string) => stats.get(h)?.last ?? -1;
  const named = people
    .filter((p) => p.kind === "contributor")
    .map((p) => p.handle)
    .sort((a, b) => last(b) - last(a) || (a < b ? -1 : 1));
  const quiet = [...stats.keys()]
    .filter((h) => !byHandle.has(h))
    .sort((a, b) => stats.get(b)!.n - stats.get(a)!.n || last(b) - last(a) || (a < b ? -1 : 1));
  const initiators = people
    .filter((p) => p.kind === "initiator")
    .map((p) => p.handle)
    .sort((a, b) => (a < b ? -1 : 1));
  return {
    blocks: sorted,
    seasons: splitSeasons(sorted),
    builders: [...named, ...quiet].map(figure),
    initiators: initiators.map(figure),
    peopleCount: stats.size,
  };
}

/** "142 tasks merged and 9 ideas accepted, by 38 people. One block at a time." */
export function summaryLine(model: Pick<SceneModel, "blocks" | "peopleCount">): string {
  const k = model.blocks.filter(isIdea).length;
  const n = model.blocks.length - k;
  const m = model.peopleCount;
  const f = (x: number) => x.toLocaleString("en-US");
  const tasks = `${f(n)} ${n === 1 ? "task" : "tasks"} merged`;
  const people = `${f(m)} ${m === 1 ? "person" : "people"}`;
  if (!k) return `${tasks} by ${people}. One block at a time.`;
  return `${tasks} and ${f(k)} ${k === 1 ? "idea" : "ideas"} accepted, by ${people}. One block at a time.`;
}

/** Newest first, for the accessible list. */
export function latestBlocks(model: Pick<SceneModel, "blocks">, n = 10): Block[] {
  return model.blocks.slice(-n).reverse();
}

/**
 * How many of the newest blocks to carry in. `seen` is the block count stored on the last visit
 * (null on the first). First visit: 5. Nothing new: the newest one again. Never more than 10.
 */
export function blocksToCarry(total: number, seen: number | null): number {
  if (total <= 0) return 0;
  if (seen == null || !Number.isFinite(seen)) return Math.min(5, total);
  return Math.min(total, 10, Math.max(1, total - seen));
}

// ---------------------------------------------------------------------------------------------
// Geometry. The scene is drawn at low resolution (1 art px = P screen px) in 2:1 isometric.

export type Tower = {
  /** Screen position (art px) of the back corner of the ground cell (0, 0). */
  ox: number;
  oy: number;
  /** Tile half-width and cube height, in art px. */
  c: number;
  h: number;
};

export type SkylineTower = Tower & { season: number; labelX: number; labelY: number };

export type Geometry = {
  /** Screen px per art px. */
  P: number;
  bw: number;
  bh: number;
  current: Tower;
  /** Ground cells around the tower on each side. */
  ring: number;
  skyline: SkylineTower[];
  /** Finished seasons not drawn (shown as a count). */
  hiddenSeasons: number;
  /** Ground spots for figures, in cell coordinates, nearest the tower first. */
  spots: [number, number][];
  /** Where initiators stand with their flags: the front-left edge of the tower's base. */
  flags: [number, number][];
  /** The next few cells to build, drawn as dashed outlines ("room to build"). Hero only. */
  plan: Slot[];
  /** Art px from the centre of the tower's top face (outlines included) up to the star's top edge. */
  starRise: number;
};

/** Screen position (art px) of grid point (x, y) at height z on a tower's ground. */
export function toScreen(t: Tower, x: number, y: number, z: number): [number, number] {
  return [Math.round(t.ox + (x - y) * t.c), Math.round(t.oy + ((x + y) * t.c) / 2 - z * t.h)];
}

/** Height of the pixel star above a tower's top face centre (its top edge), at 2 px per star pixel. */
const STAR_RISE = 46;
/** The star is 22 art px tall. A hero's star sits just above the top face's back corner. */
export const heroStarRise = (c: number) => (TOWER_N * c) / 2 + 24;
/** How many unbuilt cells a hero outlines. */
export const PLAN_CELLS = 4;

/** The next `n` cells of a tower, as if `n` small blocks came next. */
export function planSlots(season: Pick<Season, "blocks">, n = PLAN_CELLS): Slot[] {
  const next = Array.from({ length: n }, () => ({ size: "S" }) as Block);
  return towerSlots([...season.blocks, ...next]).slots.slice(season.blocks.length);
}

/**
 * A hero's camera: about this many art px across. Few blocks frame the tower closely (bigger
 * pixels); it eases out to the whole ground as the tower grows. A function of the count only.
 */
export function heroSpan(blocks: number): number {
  return Math.round(240 - 110 * Math.exp(-Math.max(0, blocks) / 40));
}
/** Skyline towers: smaller tiles, a 1 px-per-pixel star. */
export const SKY_C = 4;
export const SKY_H = 3;
export const SKY_STAR_RISE = 22;
const SKY_GAP = 6;

const towerTop = (layers: number, c: number, h: number) => (TOWER_N * c) / 2 - layers * h;

export function sceneGeometry(model: Pick<SceneModel, "seasons" | "initiators">, width: number, size: BuildersSize): Geometry {
  const N = TOWER_N;
  // A hero scales its pixels with the width (about 240 logical pixels across), so it fills the page.
  const hero = size === "hero";
  const total = model.seasons.reduce((n, s) => n + s.blocks.length, 0);
  // A hero scales its pixels with the width and zooms in while the tower is small (heroSpan).
  const P = hero ? Math.min(8, Math.max(2, Math.round(width / heroSpan(total)))) : width < 520 ? 2 : 3;
  const bw = Math.max(120, Math.floor(width / P));
  const minH = Math.floor(bw * (size === "compact" ? 0.72 : 0.5));
  const maxH = Math.floor(bw * (size === "compact" ? 0.95 : 0.8));
  const current = model.seasons[model.seasons.length - 1];
  const finished = model.seasons.slice(0, -1);
  const plan = hero ? planSlots(current) : [];
  // The top layer counting the outlines, which the star sits above.
  const layers = Math.max(current.layers, ...plan.map((s) => s.z + 1));

  // As many skyline towers as fit next to a slab with a ring of at least two cells.
  const skyW = 2 * N * SKY_C + SKY_GAP;
  const fit = Math.max(0, Math.floor((bw - 2 * (N + 4) * 6 - 4) / skyW));
  const shown = finished.slice(-Math.min(MAX_SKYLINE, fit, finished.length));
  const left = shown.length ? 4 + shown.length * skyW : 0;

  // Shrink the tower until it fits the tallest allowed scene.
  const options: [number, number][] = [[6, 5], [6, 4], [4, 4], [4, 3], [4, 2]];
  let pick = options[0];
  let ring = 2;
  let need = 0;
  for (const [c, h] of options) {
    const maxRing = size === "compact" ? 3 : 5;
    ring = Math.max(2, Math.min(maxRing, Math.floor(((bw - left - 4) / (2 * c) - N) / 2)));
    // Everything measured from oy: the star on top, the ground's front edge (+2 soil) at the bottom.
    const top = towerTop(layers, c, h) - (hero ? heroStarRise(c) + 2 : STAR_RISE);
    const bottom = (N + ring) * c + 2;
    const skyTop = Math.min(0, ...shown.map((s) => (N * c) / 2 + c - N * SKY_C + towerTop(s.layers, SKY_C, SKY_H) - SKY_STAR_RISE));
    need = bottom - Math.min(top, skyTop) + 6;
    pick = [c, h];
    if (need <= maxH) break;
  }
  const [c, h] = pick;
  // maxH only picks the tile size; a tower too tall even at the smallest one makes the scene taller.
  const bh = Math.max(minH, need);
  const ox = Math.floor(left + (bw - left) / 2);
  const oy = bh - 3 - ((N + ring) * c + 2);

  // Skyline: oldest on the left, standing a little behind the slab's left corner.
  const baseY = Math.min(oy + (N * c) / 2 + c, bh - 10);
  const skyline: SkylineTower[] = shown.map((s, i) => {
    const sox = 4 + i * skyW + N * SKY_C;
    const soy = baseY - N * SKY_C;
    return { ox: sox, oy: soy, c: SKY_C, h: SKY_H, season: finished.indexOf(s), labelX: sox, labelY: baseY + 3 };
  });

  // Figure spots: a ring around the tower, keeping the ladder (right face) clear.
  const spots: [number, number][] = [];
  for (let x = -ring + 0.5; x < N + ring; x += 1.5)
    for (let y = -ring + 0.5; y < N + ring; y += 1.5) {
      if (x > -1.2 && x < N + 1.4 && y > -1.2 && y < N + 1.2) continue;
      if (x > N - 0.2 && x < N + 2 && y > 1.2 && y < 3.8) continue;
      if (x < 1.5 && y > N + 0.3 && y < N + 1.6) continue; // where the initiators stand
      spots.push([x, y]);
    }
  const d = ([x, y]: [number, number]) => Math.hypot(x - N / 2, y - N / 2) + Math.sin(x * 3 + y) * 0.6;
  spots.sort((a, b) => d(a) - d(b));

  const flags: [number, number][] = [];
  // 2.4 cells apart, so the name labels on the flags (14 px tall) never overlap.
  for (let n = 0; n < model.initiators.length && -0.6 - n * 2.4 >= -ring + 0.2; n++) flags.push([-0.6 - n * 2.4, N + 0.9]);

  const starRise = hero ? heroStarRise(c) : 44;
  return { P, bw, bh, current: { ox, oy, c, h }, ring, skyline, hiddenSeasons: finished.length - shown.length, spots, flags, plan, starRise };
}
