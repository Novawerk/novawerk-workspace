"use client";

import { useEffect, useMemo, useState } from "react";

import { BuildersScene } from "@/components/builders/builders-scene";
import { FIXTURE_PEOPLE, fixtureBlocks } from "@/components/builders/fixtures";
import type { BuildersSize } from "@/components/builders/types";

import styles from "./preview.module.css";

const DATASETS = {
  "142 blocks": () => fixtureBlocks(142),
  "12 blocks": () => fixtureBlocks(12, "2026-09-20"),
  "Empty": () => [],
  "640 blocks (2 seasons done)": () => fixtureBlocks(640, "2025-06-01"),
  "1,300 blocks (4 seasons done)": () => fixtureBlocks(1300, "2024-01-01"),
} as const;
type Dataset = keyof typeof DATASETS;
type Theme = "system" | "light" | "dark";

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">{label}</legend>
      <span className="w-20 font-mono text-xs">{label}</span>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} className={styles.chip} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </fieldset>
  );
}

export function BuildersPreview() {
  const [dataset, setDataset] = useState<Dataset>("142 blocks");
  const [size, setSize] = useState<BuildersSize>("full");
  const [theme, setTheme] = useState<Theme>("system");
  const [motion, setMotion] = useState<"animated" | "still">("animated");
  const [run, setRun] = useState(0);
  const blocks = useMemo(() => DATASETS[dataset](), [dataset]);

  useEffect(() => {
    const root = document.documentElement;
    const before = root.dataset.theme;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    return () => {
      if (before === undefined) delete root.dataset.theme;
      else root.dataset.theme = before;
    };
  }, [theme]);

  const replay = (seen: number | null) => {
    try {
      if (seen == null) localStorage.removeItem("nw-blocks-seen");
      else localStorage.setItem("nw-blocks-seen", String(seen));
    } catch {
      // Storage blocked: the scene carries the newest block.
    }
    setRun((n) => n + 1);
  };

  return (
    <div className={styles.stage}>
      <div className={`mx-auto grid ${size === "hero" ? "max-w-6xl" : "max-w-4xl"} gap-8 px-4 py-10 sm:px-6`}>
        <div className="grid gap-2">
          <p className="font-mono text-xs">/dev/builders · not in production builds</p>
          <h1 className="text-2xl font-semibold tracking-tight">One block at a time</h1>
          <p className={styles.muted}>Fixture data. Point at a block or a person.</p>
        </div>
        <div className="grid gap-3 text-sm">
          <Seg label="Data" value={dataset} options={Object.keys(DATASETS) as Dataset[]} onChange={setDataset} />
          <Seg label="Size" value={size} options={["full", "compact", "hero"] as const} onChange={setSize} />
          <Seg label="Theme" value={theme} options={["system", "light", "dark"] as const} onChange={setTheme} />
          <Seg label="Motion" value={motion} options={["animated", "still"] as const} onChange={setMotion} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 font-mono text-xs">Visit</span>
            <button type="button" className={styles.chip} onClick={() => replay(Math.max(0, blocks.length - 6))}>
              Pretend I was here last week
            </button>
            <button type="button" className={styles.chip} onClick={() => replay(null)}>
              First visit
            </button>
            <button type="button" className={styles.chip} onClick={() => replay(blocks.length)}>
              Nothing new
            </button>
          </div>
        </div>
        <BuildersScene key={`${dataset}-${size}-${run}`} blocks={blocks} people={FIXTURE_PEOPLE} size={size} still={motion === "still"} />
      </div>
    </div>
  );
}
