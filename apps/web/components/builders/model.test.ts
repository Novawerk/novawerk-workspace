import { describe, expect, it } from "vitest";

import { FIXTURE_PEOPLE, fixtureBlocks } from "./fixtures";
import {
  CELLS,
  SEASON_BLOCKS,
  TOWER_N,
  blocksToCarry,
  buildModel,
  latestBlocks,
  heroSpan,
  PLAN_CELLS,
  planSlots,
  sceneGeometry,
  seasonLabel,
  sortBlocks,
  summaryLine,
  towerSlots,
} from "./model";
import type { Block } from "./types";

const block = (id: string, mergedAt: string, extra: Partial<Block> = {}): Block => ({
  id,
  title: id,
  area: "web",
  size: "S",
  handle: "lena-k",
  mergedAt,
  ...extra,
});

describe("towerSlots", () => {
  it("gives each size its run of cubes, inside the 5×5 footprint, never two in one cell", () => {
    const blocks = fixtureBlocks(200);
    const { slots, layers } = towerSlots(blocks);
    const seen = new Set<string>();
    slots.forEach((slot, i) => {
      expect(slot.cells).toHaveLength(CELLS[blocks[i].size]);
      for (const c of slot.cells) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(TOWER_N);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(TOWER_N);
        const key = `${c.x},${c.y},${c.z}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });
    expect(layers).toBe(slots[slots.length - 1].z + 1);
  });

  it("turns every other layer 90°", () => {
    const xl = Array.from({ length: 12 }, (_, i) => block(`NW-${i}`, "2026-05-01T00:00:00Z", { size: "XL" }));
    const { slots } = towerSlots(xl);
    const even = slots.find((s) => s.z === 0)!;
    const odd = slots.find((s) => s.z === 1)!;
    expect(new Set(even.cells.map((c) => c.y)).size).toBe(1);
    expect(new Set(odd.cells.map((c) => c.x)).size).toBe(1);
  });

  it("is empty for no blocks", () => {
    expect(towerSlots([])).toEqual({ slots: [], layers: 0 });
  });
});

describe("buildModel", () => {
  it("is the same whatever order the blocks come in", () => {
    const blocks = fixtureBlocks(80);
    const a = buildModel(blocks, FIXTURE_PEOPLE);
    const b = buildModel([...blocks].reverse(), [...FIXTURE_PEOPLE].reverse());
    expect(b.blocks.map((x) => x.id)).toEqual(a.blocks.map((x) => x.id));
    expect(b.seasons[0].slots).toEqual(a.seasons[0].slots);
    expect(b.builders.map((f) => f.handle)).toEqual(a.builders.map((f) => f.handle));
  });

  it("sorts oldest first, ties by id", () => {
    const sorted = sortBlocks([block("NW-2", "2026-05-02T00:00:00Z"), block("NW-9", "2026-05-01T00:00:00Z"), block("NW-1", "2026-05-02T00:00:00Z")]);
    expect(sorted.map((b) => b.id)).toEqual(["NW-9", "NW-1", "NW-2"]);
  });

  it("puts named contributors before people without a public profile, and initiators apart", () => {
    const m = buildModel(fixtureBlocks(142), FIXTURE_PEOPLE);
    const firstQuiet = m.builders.findIndex((f) => !f.person);
    expect(firstQuiet).toBeGreaterThan(0);
    expect(m.builders.slice(firstQuiet).every((f) => !f.person)).toBe(true);
    expect(m.initiators.map((f) => f.person?.project)).toEqual(["Kiezradar", "Tidepool"]);
  });

  it("starts a new season every 300 blocks", () => {
    expect(buildModel(fixtureBlocks(299), []).seasons).toHaveLength(1);
    const full = buildModel(fixtureBlocks(SEASON_BLOCKS), []);
    expect(full.seasons).toHaveLength(2);
    expect(full.seasons[0].finished).toBe(true);
    expect(full.seasons[1].blocks).toHaveLength(0);
    const two = buildModel(fixtureBlocks(640, "2025-06-01"), []);
    expect(two.seasons.map((s) => s.blocks.length)).toEqual([300, 300, 40]);
    expect(two.seasons[2].label).toBe("Now");
  });
});

describe("text", () => {
  it("writes the summary line", () => {
    const m = buildModel([block("NW-1", "2026-05-01T00:00:00Z"), block("NW-2", "2026-05-02T00:00:00Z", { handle: "mira" })], []);
    expect(summaryLine(m)).toBe("2 tasks merged by 2 people. One block at a time.");
    expect(summaryLine(buildModel([block("NW-1", "2026-05-01T00:00:00Z")], []))).toBe("1 task merged by 1 person. One block at a time.");
    expect(summaryLine(buildModel(fixtureBlocks(1300, "2024-01-01"), []))).toMatch(/^1,300 tasks merged by \d+ people\./);
  });

  it("lists the latest ten, newest first", () => {
    const m = buildModel(fixtureBlocks(30), []);
    const latest = latestBlocks(m);
    expect(latest).toHaveLength(10);
    expect(latest[0].id).toBe(m.blocks[29].id);
  });

  it("names seasons by the UTC month", () => {
    expect(seasonLabel("2026-07-15T00:00:00Z")).toBe("Summer 2026");
    expect(seasonLabel("2026-10-01T00:00:00Z")).toBe("Autumn 2026");
    expect(seasonLabel("2026-12-20T00:00:00Z")).toBe("Winter 2027");
  });
});

describe("blocksToCarry", () => {
  it("carries five on a first visit, what is new since, and the newest when nothing is", () => {
    expect(blocksToCarry(142, null)).toBe(5);
    expect(blocksToCarry(3, null)).toBe(3);
    expect(blocksToCarry(142, 139)).toBe(3);
    expect(blocksToCarry(142, 142)).toBe(1);
    expect(blocksToCarry(142, 50)).toBe(10);
    expect(blocksToCarry(0, null)).toBe(0);
  });
});

describe("sceneGeometry", () => {
  it("uses 3× pixels on wide screens and 2× on phones", () => {
    const m = buildModel(fixtureBlocks(142), FIXTURE_PEOPLE);
    expect(sceneGeometry(m, 760, "full").P).toBe(3);
    expect(sceneGeometry(m, 360, "full").P).toBe(2);
  });

  it("zooms a hero in on a small tower and eases out as it grows", () => {
    expect(heroSpan(0)).toBe(130);
    expect(heroSpan(1)).toBeLessThan(heroSpan(5));
    expect(heroSpan(5)).toBeLessThan(heroSpan(142));
    expect(heroSpan(1000)).toBe(240);
    const P = (n: number, w: number) => sceneGeometry(buildModel(fixtureBlocks(n), FIXTURE_PEOPLE), w, "hero").P;
    expect(P(1, 1088)).toBe(8);
    expect(P(142, 1088)).toBe(5);
    expect(P(1, 343)).toBe(3);
    expect(P(142, 343)).toBe(2);
    expect(P(1, 1600)).toBe(8);
  });

  it("outlines the next cells on a hero, after the last block", () => {
    const m = buildModel(fixtureBlocks(1), FIXTURE_PEOPLE);
    const g = sceneGeometry(m, 1088, "hero");
    expect(g.plan).toHaveLength(PLAN_CELLS);
    const built = new Set(m.seasons[0].slots.flatMap((s) => s.cells.map((c) => `${c.x},${c.y},${c.z}`)));
    for (const s of g.plan) for (const c of s.cells) expect(built.has(`${c.x},${c.y},${c.z}`)).toBe(false);
    expect(sceneGeometry(m, 760, "full").plan).toEqual([]);
    expect(planSlots({ blocks: [] }, 2).map((s) => s.cells[0])).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]);
  });

  it("keeps the star and the ground inside the scene", () => {
    for (const n of [0, 12, 142, 299, 640, 1300])
      for (const w of [320, 390, 760, 1120, 1400])
        for (const size of ["full", "compact", "hero"] as const) {
          const m = buildModel(fixtureBlocks(n, "2024-01-01"), FIXTURE_PEOPLE);
          const g = sceneGeometry(m, w, size);
          const cur = m.seasons[m.seasons.length - 1];
          const layers = Math.max(cur.layers, ...g.plan.map((s) => s.z + 1));
          // The star's top edge, with 1 px of bob.
          const starTop = g.current.oy + (TOWER_N * g.current.c) / 2 - layers * g.current.h - g.starRise - 1;
          expect(starTop, `${n} blocks at ${w}px ${size}`).toBeGreaterThanOrEqual(0);
          expect(g.current.oy + (TOWER_N + g.ring) * g.current.c + 2).toBeLessThanOrEqual(g.bh);
          for (const s of g.skyline) expect(s.ox - TOWER_N * s.c).toBeGreaterThanOrEqual(0);
        }
  });

  it("shows at most three finished seasons and counts the rest", () => {
    const m = buildModel(fixtureBlocks(1300, "2024-01-01"), []);
    const g = sceneGeometry(m, 760, "full");
    expect(g.skyline.length).toBeLessThanOrEqual(3);
    expect(g.skyline.length + g.hiddenSeasons).toBe(4);
  });
});
