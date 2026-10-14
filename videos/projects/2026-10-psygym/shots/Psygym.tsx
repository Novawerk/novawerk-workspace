import { useCurrentFrame } from "remotion";

import { Lockup, Note, starFall } from "../../../kit/brand";
import { Lines } from "./parts";
import { Robot } from "./HammerRobot";
import { Stage, progress } from "../../../kit/motion";
import { copy } from "../copy";
import { monoFamily } from "../../../kit/fonts";
import { hammerTimes } from "../timeline";
import { BEAT, CUES, END, PLAN, RECRUIT, ROAD, color, ease, sec } from "../theme";
import { COLS, Cursor, DotGrid, FRAME, ProtoFrame, ROWS, RowTitles, WORLD, framePos } from "./canvas";
import { ANSWER_RECTS } from "./Why";

// The second half, in the same look as the first: white and ink grounds, ink-bordered notes,
// green on white and the brighter signal green on ink. Only the app inside the phone keeps
// PSYGYM's own colours — that is the product.

/** A note that slams in: big and tilted to its place, with a two-frame flash. */
function Slam({ f, at, tilt, children, style, flash = color.signal }: { f: number; at: number; tilt: number; children: React.ReactNode; style?: React.CSSProperties; flash?: string }) {
  if (f < at) return null;
  const d = progress(f, at, 6, ease.spring);
  return (
    <Note
      style={{
        position: "absolute",
        border: "none",
        background: f - at < 2 ? flash : color.paper,
        transform: `rotate(${tilt}deg) scale(${1.5 - 0.5 * d})`,
        opacity: Math.min(1, d * 1.5),
        ...style,
      }}
    >
      {children}
    </Note>
  );
}

const tag = { fontFamily: monoFamily, fontSize: 24, fontWeight: 600, letterSpacing: 3, color: color.accent } as const;

/** 0:26–0:32 · The answers become the design. The two answer cards shrink and turn into the
 *  S1 and R1 frames on the canvas, the ground turns into the canvas's dot grid, then the camera
 *  pulls back over all the screens; collaborators' cursors move, two comments land. */
export function Shot5Plan() {
  const f = useCurrentFrame();
  const c = copy.plan;
  const view = { top: 330, w: 1080, h: 1440 - 330 };
  const a = framePos(6), b = framePos(7); // S1 会谈, R1 督导报告
  const s0 = 1.1;
  const c0 = { x: (a.cx + b.cx) / 2, y: a.cy };
  const morph = progress(f, 0, sec(PLAN.morph), ease.ui);
  const z = progress(f, sec(PLAN.zoomFrom), sec(PLAN.zoomTo) - sec(PLAN.zoomFrom), ease.ui);
  const drift = Math.max(0, f - sec(PLAN.zoomTo)) / 120;
  const s = Math.exp(Math.log(s0) + (Math.log(0.43) - Math.log(s0)) * z) * (1 + 0.05 * drift);
  const cx = c0.x + (WORLD.w / 2 - c0.x) * z + 60 * drift;
  const cy = c0.y + (WORLD.h / 2 - 60 - c0.y) * z;
  // Where a canvas point lands on screen at the opening camera.
  const toScreen = (x: number, y: number) => ({ x: view.w / 2 + (x - c0.x) * s0, y: view.top + view.h / 2 + (y - c0.y) * s0 });
  const order = Array.from({ length: COLS * ROWS }, (_, i) => i).sort((p, q) => dist(p) - dist(q));
  const landed = f >= sec(PLAN.morph);
  const cursorIn = progress(f, 40, 10);
  return (
    <Stage>
      <div style={{ position: "absolute", left: -200, right: -200, top: view.top, bottom: -300, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: morph }}>
          <DotGrid />
        </div>
        <div style={{ position: "absolute", left: 200, top: 0, width: 0, height: 0, transform: `translate(${view.w / 2 - cx * s}px, ${view.h / 2 - cy * s}px) scale(${s})`, transformOrigin: "0 0" }}>
          <div style={{ opacity: progress(f, sec(PLAN.zoomFrom) + 10, 10) }}>
            <RowTitles />
          </div>
          {order.map((i, rank) => {
            const p = rank < 2 ? (landed ? 1 : 0) : progress(f, sec(PLAN.zoomFrom) + 4 + rank * 5, 8, ease.spring);
            return (
              <div key={i} style={{ opacity: Math.min(1, p) }}>
                <ProtoFrame i={i} />
              </div>
            );
          })}
          {c.comments.map((text, k) => {
            const p = progress(f, 100 + k * 30, 8, ease.spring);
            const at = framePos(k ? 10 : 7);
            return (
              <Note key={text} style={{ position: "absolute", left: at.x + 40, top: at.y + 420, padding: "26px 36px", fontSize: 54, fontWeight: 800, background: color.paper, border: `5px solid ${color.ink}`, transform: `rotate(${k ? 3 : -3}deg) scale(${0.8 + 0.2 * p})`, opacity: Math.min(1, p) }}>
                <span style={{ color: color.accent }}>● </span>
                {text}
              </Note>
            );
          })}
        </div>
        {c.cursors.map((name, k) => {
          const t = f / 30;
          const x = 200 + [180, 640, 420][k]! + Math.sin(t * [0.9, 0.7, 1.1][k]! + k * 2) * 150;
          const y = [260, 520, 820][k]! + Math.cos(t * [0.8, 1, 0.6][k]! + k) * 110;
          return (
            <div key={name} style={{ opacity: cursorIn }}>
              <Cursor x={x} y={y} name={name} tint={[color.accent, color.ink, CLAY][k]!} />
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: -300, height: 630, background: color.paper, borderBottom: `3px solid rgba(15,15,15,${morph})` }} />
      <Lines f={f} at={sec(c.captions[0]!.at)} lines={c.captions[0]!.lines} accent={color.accent} size={96} style={{ position: "absolute", left: 72, right: 72, top: 70 }} />

      {/* The two answer cards, shrinking into their frames. */}
      {!landed
        ? ANSWER_RECTS.map((r, k) => {
            const fr = framePos(k ? 7 : 6);
            const tl = toScreen(fr.x, fr.y);
            const to = { x: tl.x, y: tl.y, w: FRAME.w * s0, h: FRAME.h * s0 };
            const lerp = (u: number, v: number) => u + (v - u) * morph;
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: lerp(r.x, to.x),
                  top: lerp(r.y, to.y),
                  width: lerp(r.w, to.w),
                  height: lerp(r.h, to.h),
                  boxSizing: "border-box",
                  background: color.paper,
                  border: `${lerp(3, 2)}px solid ${morph > 0.6 ? "#E4E4E7" : color.ink}`,
                  borderRadius: lerp(0, 28 * s0),
                  transform: `rotate(${(k ? 1.2 : -1.2) * (1 - morph)}deg)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <div style={{ opacity: Math.max(0, 1 - morph * 1.6), textAlign: "center", whiteSpace: "nowrap" }}>
                  <div style={{ fontFamily: monoFamily, fontSize: lerp(24, 14), fontWeight: 600, letterSpacing: 3, color: color.accent }}>{copy.why.answers[k]!.tag}</div>
                  <div style={{ fontSize: lerp(84, 40), fontWeight: 900 }}>{copy.why.answers[k]!.title}</div>
                </div>
              </div>
            );
          })
        : null}
    </Stage>
  );
}

const CLAY = "#8A5A2B"; // PSYGYM's second colour, for the third cursor

function dist(i: number) {
  const a = framePos(i), b = framePos(6);
  return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}

/** 0:32–0:40 · On ink: the four stops drop in as notes, a staircase; the last one is the launch. */
export function Shot6Road() {
  const f = useCurrentFrame();
  const c = copy.road;
  const at = (t: number) => sec(t - CUES.road);
  const scope = progress(f, at(ROAD.scope), 8);
  const launchAt = at(ROAD.launch);
  const tilt = [-3, 2, -2, 0];
  return (
    <Stage bg={color.ink} fg={color.paper}>
      <Lines f={f} at={0} lines={c.caption} accent={color.signal} size={104} style={{ position: "absolute", left: 72, right: 72, top: 90 }} />
      {c.stops.slice(0, 3).map((stop, k) => (
        <Slam key={stop.date} f={f} at={at(ROAD.stops[k]!)} tilt={tilt[k]!} style={{ left: 72 + k * 110, top: 420 + k * 170, padding: "18px 36px 22px", display: "flex", alignItems: "baseline", gap: 24 }}>
          <span style={{ fontFamily: monoFamily, fontSize: 34, fontWeight: 600, color: color.accent }}>{stop.date}</span>
          <span style={{ fontSize: 64, fontWeight: 900, letterSpacing: -1 }}>{stop.label}</span>
        </Slam>
      ))}
      <div style={{ position: "absolute", left: 292, top: 900, fontSize: 36, fontWeight: 600, color: "rgba(255,255,255,0.75)", opacity: scope }}>{c.scope}</div>
      {/* The launch: lands in the signal green, bigger than the rest, and stays. */}
      <Slam f={f} at={at(ROAD.stops[3]!)} tilt={-1.5} flash={color.paper} style={{ left: 72, right: 72, top: 1010, padding: "24px 44px 30px", background: f - at(ROAD.stops[3]!) < 2 ? color.paper : color.signal }}>
        <div style={{ ...tag, color: color.ink }}>{c.stops[3]!.date}</div>
        <div style={{ fontSize: 108, fontWeight: 900, letterSpacing: -3, color: color.ink, transform: `scale(${1 + 0.05 * progress(f, launchAt, 8, ease.spring)})`, transformOrigin: "0 50%" }}>{c.stops[3]!.label}</div>
      </Slam>
    </Stage>
  );
}

/** 0:40–0:44 · Who it's for: notes drop into a pile; an ink panel wipes up: a practice tool, not therapy. */
export function Shot7Recruit() {
  const f = useCurrentFrame();
  const c = copy.recruit;
  const at = (t: number) => sec(t - CUES.recruit);
  const ctaAt = at(RECRUIT.cta);
  const up = progress(f, ctaAt - 4, 8);
  const place = [
    { x: 80, y: 430, r: -5 },
    { x: 520, y: 470, r: 4 },
    { x: 140, y: 640, r: 3 },
    { x: 470, y: 690, r: -4 },
  ];
  return (
    <Stage>
      <Lines f={f} at={0} lines={c.caption} accent={color.accent} size={96} style={{ position: "absolute", left: 72, right: 72, top: 90 }} />
      {c.who.map((who, k) => {
        const s = at(RECRUIT.cards[k]!);
        if (f < s) return null;
        const d = progress(f, s, 6, ease.spring);
        const open = k === c.who.length - 1;
        const p = place[k]!;
        return (
          <Note
            key={who}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              padding: "28px 40px",
              fontSize: 60,
              fontWeight: 900,
              border: open ? `4px dashed ${color.accent}` : `3px solid ${color.ink}`,
              color: open ? color.accent : color.ink,
              transform: `rotate(${p.r}deg) scale(${1.25 - 0.25 * d})`,
              opacity: d,
            }}
          >
            {who}
          </Note>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: -240, height: 400 + 240, background: color.ink, transform: `translateY(${(1 - up) * 100}%)`, padding: "80px 72px" }}>
        <div style={{ fontFamily: monoFamily, fontSize: 28, fontWeight: 600, letterSpacing: 3, color: color.signal }}>{c.tag}</div>
        <div style={{ marginTop: 10, fontSize: 84, fontWeight: 900, letterSpacing: -2, color: color.paper }}>{c.cta}</div>
      </div>
    </Stage>
  );
}

/** 0:44–0:48 · The two names; the Nova Star falls into its lockup. */
export function Shot8End() {
  const f = useCurrentFrame();
  const c = copy.end;
  const marks = sec(END.marks - CUES.end);
  const fall = starFall(f - marks, BEAT);
  const word = progress(f, marks + BEAT + 4, 8);
  const tail = progress(f, marks + 2 * BEAT, 8);
  return (
    <Stage>
      <div style={{ position: "absolute", left: 0, right: 0, top: 270, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Slam f={f} at={0} tilt={-2} flash={color.accent} style={{ position: "relative", border: `3px solid ${color.ink}`, padding: "16px 48px 26px", fontSize: 136, fontWeight: 900, letterSpacing: -4 }}>
          {c.name}
        </Slam>
        <div style={{ marginTop: 34, fontSize: 32, fontWeight: 700, color: color.muted, border: `3px dashed ${color.lineStrong}`, padding: "8px 24px", opacity: progress(f, 6, 6) }}>{c.logoNote}</div>
        <div style={{ marginTop: 40, fontSize: 56, color: color.muted, opacity: f >= marks ? 1 : 0 }}>{c.with}</div>
      </div>
      {/* The logo is still being designed: three robots at work on it. */}
      {[
        { x: 326, y: 492, flip: false },
        { x: 646, y: 492, flip: true },
        { x: 840, y: 134, flip: true },
      ].map((r, k) => (
        <Robot key={k} f={f} hits={hammerTimes(k).map((t) => sec(t - CUES.end))} x={r.x} y={r.y} flip={r.flip} appear={4 + k * 3} />
      ))}
      <div style={{ position: "absolute", left: 0, right: 0, top: 730, display: "flex", justifyContent: "center", opacity: f >= marks ? 1 : 0 }}>
        <Lockup
          height={88}
          reach={fall.reach}
          starStyle={{ transform: `translateY(${-fall.drop * 500}px) scale(${fall.scaleX}, ${fall.scaleY}) rotate(${fall.spin}deg)` }}
          wordmarkStyle={{ opacity: word, transform: `translateX(${(1 - word) * -40}px)` }}
        />
      </div>
      <Lines f={f} at={marks + 2 * BEAT} lines={[c.caption]} accent={color.accent} size={96} style={{ position: "absolute", left: 72, right: 72, top: 960, textAlign: "center" }} />
      <div style={{ position: "absolute", left: 72, right: 72, top: 1190, textAlign: "center", opacity: tail }}>
        <div style={{ fontFamily: monoFamily, fontSize: 28, color: color.muted }}>{c.repo}</div>
        <div style={{ marginTop: 14, fontSize: 32, color: color.muted }}>{c.disclaimer}</div>
      </div>
    </Stage>
  );
}
