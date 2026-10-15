"use client";

// "One block at a time" (聚沙成塔): every merged task is a block on a pixel tower, carried up a
// ladder by the person who did it. Design: docs/contributor-board-design.md.
//
// The text (summary line, list of the latest merges) renders on the server from the block list.
// The canvas, the last-visit comparison and all timing start in effects, so the prerendered part
// never reads the clock.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import styles from "./builders-scene.module.css";
import { startScene, type Hit } from "./engine";
import { blocksToCarry, buildModel, latestBlocks, sceneGeometry, summaryLine, toScreen } from "./model";
import type { Block, BuildersSize, Person } from "./types";

const SEEN_KEY = "nw-blocks-seen";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 11, 2026", in UTC so server and browser agree. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function readSeen(): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

function saveSeen(n: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(n));
  } catch {
    // Storage blocked: every visit carries the newest block again.
  }
}

function media(query: string) {
  return {
    subscribe(cb: () => void) {
      try {
        const m = matchMedia(query);
        m.addEventListener("change", cb);
        return () => m.removeEventListener("change", cb);
      } catch {
        return () => {};
      }
    },
    get() {
      try {
        return matchMedia(query).matches;
      } catch {
        return false;
      }
    },
  };
}
const reducedMotion = media("(prefers-reduced-motion: reduce)");
const darkScheme = media("(prefers-color-scheme: dark)");
const serverFalse = () => false;

export function BuildersScene({
  blocks,
  people,
  size = "full",
  still = false,
}: {
  blocks: Block[];
  people: Person[];
  size?: BuildersSize;
  /** Force a still frame, as with reduced motion (thumbnails, previews). */
  still?: boolean;
}) {
  const model = useMemo(() => buildModel(blocks, people), [blocks, people]);
  const named = useMemo(() => new Set(people.map((p) => p.handle)), [people]);
  const maxWidth = size === "compact" ? 420 : size === "hero" ? 1400 : 760;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ReturnType<typeof startScene> | null>(null);
  const carryRef = useRef<number | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [hit, setHit] = useState<Hit | null>(null);
  const reduced = useSyncExternalStore(reducedMotion.subscribe, reducedMotion.get, serverFalse) || still;
  const dark = useSyncExternalStore(darkScheme.subscribe, darkScheme.get, serverFalse);
  const geo = useMemo(() => sceneGeometry(model, width ?? maxWidth, size), [model, width, maxWidth, size]);
  const summary = summaryLine(model);
  const total = model.blocks.length;

  // The layout depends on the width (2× or 3× pixels, ring size), so measure it.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // A hero stays about half as tall as it is wide, so it is capped to fit ~70% of the window's height.
    const tallest = () => (size === "hero" ? Math.max(480, Math.floor(window.innerHeight * 1.4)) : Infinity);
    const measure = () => setWidth(Math.max(240, Math.min(maxWidth, tallest(), Math.floor(el.clientWidth))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (size === "hero") window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [maxWidth, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (width == null || !canvas) return;
    if (carryRef.current == null) {
      // Once per mount: blocks merged since the last visit are carried in.
      carryRef.current = blocksToCarry(total, readSeen());
      saveSeen(total);
    }
    const scene = startScene({
      canvas,
      model,
      geo,
      still: reduced,
      carry: carryRef.current,
      small: geo.P === 2,
      compact: size === "compact",
      onHit: setHit,
      onSettled: () => {
        carryRef.current = 0;
      },
    });
    sceneRef.current = scene;
    // The page may switch theme by attribute (data-theme / class on <html>).
    const mo = new MutationObserver(() => scene.recolor());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => {
      scene.stop();
      mo.disconnect();
      sceneRef.current = null;
    };
  }, [width, model, geo, reduced, size, total]);

  useEffect(() => {
    sceneRef.current?.recolor();
  }, [dark]);

  // Close the card with Escape or a tap elsewhere.
  useEffect(() => {
    if (!hit) return;
    const close = () => sceneRef.current?.clear();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [hit]);

  const W = geo.bw * geo.P;
  const H = geo.bh * geo.P;
  const measured = width != null;
  const who = (handle: string) => (named.has(handle) ? `@${handle}` : "A contributor");

  return (
    <div className={styles.scene} style={{ maxWidth }}>
      <div ref={wrapRef} className="w-full">
        <div className="relative mx-auto" style={measured ? { width: W, height: H } : { width: "100%", aspectRatio: `${geo.bw} / ${geo.bh}` }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${summary} Little pixel people carry each block up a ladder onto a tower crowned with the Nova Star.`}
            className={styles.canvas}
            style={{ width: "100%", height: "100%" }}
          />
          {measured &&
            geo.flags.map(([gx, gy], n) => {
              const [sx, sy] = toScreen(geo.current, gx, gy, 0);
              const project = model.initiators[n].person?.project;
              return project ? (
                <span key={model.initiators[n].handle} className={styles.flag} style={{ left: (sx + 2) * geo.P, top: (sy - 13) * geo.P }} aria-hidden>
                  {project}
                </span>
              ) : null;
            })}
          {measured &&
            geo.skyline.map((s) => (
              <span key={s.season} className={styles.label} style={{ left: s.labelX * geo.P, top: s.labelY * geo.P }}>
                {model.seasons[s.season].label}
              </span>
            ))}
          {measured && geo.hiddenSeasons > 0 && geo.skyline.length > 0 && (
            <span className={styles.label} style={{ left: geo.skyline[0].labelX * geo.P, top: geo.skyline[0].labelY * geo.P + 14 }}>
              +{geo.hiddenSeasons} earlier
            </span>
          )}
          {hit && (
            <div
              className={styles.card}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse" && e.relatedTarget !== canvasRef.current) sceneRef.current?.clear();
              }}
              style={{ left: W < 220 ? W / 2 : Math.min(Math.max(hit.x, 110), W - 110), top: hit.y }}>
              {hit.kind === "block" ? (
                <>
                  <b>{hit.block.title}</b>
                  <span className={styles.muted}>
                    {who(hit.block.handle)} · merged {formatDate(hit.block.mergedAt)} · {hit.block.size} · {hit.block.area}
                  </span>
                  <Link href={`/tasks/${hit.block.id}`}>Open {hit.block.id} →</Link>
                </>
              ) : hit.figure.person ? (
                <>
                  <b>@{hit.figure.handle}</b>
                  <span className={styles.muted}>
                    {hit.figure.person.kind === "initiator" && hit.figure.person.project
                      ? `Started ${hit.figure.person.project}. Initiator.`
                      : `${hit.figure.person.name} · ${hit.figure.blocks} ${hit.figure.blocks === 1 ? "block" : "blocks"}${hit.figure.areas.length ? `: ${hit.figure.areas.join(", ")}` : ""}`}
                  </span>
                  <Link href={`/u/${hit.figure.handle}`}>Profile →</Link>
                </>
              ) : (
                <>
                  <b>A contributor</b>
                  <span className={styles.muted}>
                    {hit.figure.blocks} {hit.figure.blocks === 1 ? "block" : "blocks"}
                    {hit.figure.areas.length ? `: ${hit.figure.areas.join(", ")}` : ""}. Their profile is private.
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <p className={`mt-3 text-center text-sm ${styles.muted}`}>{summary}</p>
      <div className="sr-only">
        <p>Latest merges</p>
        <ul>
          {latestBlocks(model).map((b) => (
            <li key={b.id}>
              <a href={`/tasks/${b.id}`}>{b.title}</a>, {who(b.handle)}, merged <time dateTime={b.mergedAt}>{formatDate(b.mergedAt)}</time>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
