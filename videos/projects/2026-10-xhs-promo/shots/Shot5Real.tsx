import { useCurrentFrame } from "remotion";

import type { ReactNode } from "react";

import { Note, Rich } from "../../../kit/brand";
import { Burst, FoodMapCover, YimaCover } from "../../../kit/shapes";
import { Stage, progress } from "../../../kit/motion";
import { type Copy, useCopy } from "../copy";
import { monoFamily } from "../../../kit/fonts";
import { BAR, BEAT, CUES, color, ease, sec } from "../theme";

// 0:25–0:34 · Back on white. The four steps drop in as notes, a staircase; the fourth is the
// one that counts and lands in ink. On 29 s the steps give way to the two launched projects,
// drawn like the site's project cards with colourful covers; shapes burst out as each lands.
export const SHOT5_FRAMES = sec(CUES.next - CUES.real);

const PROJECTS_AT = 2 * BAR; // 29.0 s

const tilt = [-3, 2, -2, 3];

export function Shot5Real() {
  const f = useCurrentFrame();
  const { caption, steps, projects, lineSize, stepSize } = useCopy().real;

  return (
    <Stage>
      <div style={{ position: "absolute", left: 72, right: 72, top: 110, fontSize: 112, fontWeight: 900, lineHeight: 1.12, letterSpacing: -2 }}>
        {caption.map((line, k) => {
          const p = progress(f, k * 3, 7, ease.spring);
          return (
            <div key={line} style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
              <Rich text={line} accent={color.accent} />
            </div>
          );
        })}
      </div>

      {f < PROJECTS_AT
        ? steps.map((step, k) => {
            const at = BEAT + k * BEAT;
            if (f < at) return null;
            const last = k === steps.length - 1;
            const d = progress(f, at, last ? 9 : 6, ease.spring);
            return (
              <Note
                key={step.n}
                ink={color.ink}
                style={{
                  position: "absolute",
                  left: 72 + k * 120,
                  top: 470 + k * 150,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 24,
                  ...(last ? { padding: "34px 46px" } : {}),
                  background: last ? color.ink : color.paper,
                  color: last ? color.paper : color.ink,
                  transform: `rotate(${tilt[k]}deg) scale(${(last ? 1.4 : 1.25) - (last ? 0.4 : 0.25) * d})`,
                  opacity: d,
                }}
              >
                <span style={{ fontFamily: monoFamily, fontSize: 30, fontWeight: 500, color: last ? color.signal : color.muted }}>{step.n}</span>
                <span style={{ fontSize: last ? stepSize[1] : stepSize[0], fontWeight: 900, color: last ? color.signal : undefined }}>{step.label}</span>
              </Note>
            );
          })
        : projects.map((project, k) => {
            const at = PROJECTS_AT + k * BEAT;
            if (f < at) return null;
            const d = progress(f, at, 7, ease.spring);
            const zh = progress(f, at + BEAT, 7, ease.spring);
            return (
              <div key={project.title}>
                <ProjectCard
                  project={project}
                  cover={k === 0 ? <YimaCover f={f} at={at} /> : <FoodMapCover f={f} at={at} />}
                  style={{ position: "absolute", left: 72 + k * 486, top: 460, transform: `rotate(${k ? 2 : -2}deg) scale(${1.2 - 0.2 * d})`, opacity: d }} />
                <Burst f={f} at={at} which={k as 0 | 1} cx={297 + k * 486} cy={730} />
                <div
                  style={{
                    position: "absolute",
                    left: 72,
                    right: 72,
                    top: 1090 + k * 92,
                    fontSize: 52,
                    fontWeight: 700,
                    opacity: zh,
                    transform: `translateY(${(1 - zh) * 16}px)`,
                  }}
                >
                  <Rich text={project.line} accent={color.accent} />
                </div>
              </div>
            );
          })}
    </Stage>
  );
}

type Project = Copy["real"]["projects"][number];

/** apps/web/components/project-card.tsx at video scale, with an illustrated cover. */
function ProjectCard({ project, cover, style }: { project: Project; cover: ReactNode; style: React.CSSProperties }) {
  const launched = project.status === "Launched";
  return (
    <div style={{ width: 450, height: 540, display: "flex", flexDirection: "column", background: color.paper, border: `3px solid ${color.ink}`, ...style }}>
      <div style={{ height: 281, borderBottom: `3px solid ${color.ink}` }}>{cover}</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 30 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 38, fontWeight: 600, letterSpacing: -0.8, lineHeight: 1.1 }}>
          <span>{project.title}</span>
          <span style={{ color: color.muted }}>↗</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 24, color: color.muted, lineHeight: 1.3 }}>{project.tagline}</div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 12, fontFamily: monoFamily, fontSize: 22, color: color.muted }}>
          <span style={{ width: 14, height: 14, background: launched ? color.accent : color.muted }} />
          <span>{project.status}</span>
          <span>·</span>
          <span>{project.year}</span>
        </div>
      </div>
    </div>
  );
}
