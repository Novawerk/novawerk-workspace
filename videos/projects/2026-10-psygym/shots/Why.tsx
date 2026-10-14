import { useCurrentFrame } from "remotion";

import { Note, Rich } from "../../../kit/brand";
import { Lines } from "./parts";
import { Stage, progress } from "../../../kit/motion";
import { copy } from "../copy";
import { monoFamily } from "../../../kit/fonts";
import { BEAT, CUES, WHY, color, ease, sec } from "../theme";

// 0:15–0:26 · Why, and what we do about it. One shot, four beats:
//   15.0  the working title is struck out and the name slams in (ink)
//   16.5  pain one: a counselor waits across from an empty chair; the clock races (ink)
//   19.0  pain two: a queue at the supervisor's door; the price tag swings (ink)
//   21.5  on white, the answer: two cards slam in, each with a tiny demo. Shot 5 morphs them
//         into frames on the design canvas, so their rects are shared (ANSWER_RECTS).

export const ANSWER_RECTS = [
  { x: 72, y: 370, w: 936, h: 430 },
  { x: 72, y: 850, w: 936, h: 430 },
] as const;

const at = (t: number) => sec(t - CUES.why);

export function Shot4Why() {
  const f = useCurrentFrame();
  if (f < at(WHY.painA)) return <Name f={f} />;
  if (f < at(WHY.painB)) return <PainPractice f={f - at(WHY.painA)} />;
  if (f < at(WHY.solve)) return <PainSupervision f={f - at(WHY.painB)} />;
  return <Answers f={f - at(WHY.solve)} />;
}

function Name({ f }: { f: number }) {
  const c = copy.why;
  const nameAt = at(WHY.name);
  const strike = progress(f, nameAt - 10, 8);
  const d = progress(f, nameAt, 6, ease.spring);
  return (
    <Stage bg={color.ink} fg={color.paper}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 470, textAlign: "center", fontSize: 52, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>
        <span style={{ position: "relative" }}>
          {c.was}
          <span style={{ position: "absolute", left: -6, top: "52%", height: 6, width: `calc(${strike * 100}% + 12px)`, background: color.signal }} />
        </span>
      </div>
      {f >= nameAt ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 590, display: "flex", justifyContent: "center" }}>
          <Note style={{ border: "none", background: f - nameAt < 2 ? color.signal : color.paper, padding: "20px 52px 30px", fontSize: 136, fontWeight: 900, letterSpacing: -4, transform: `rotate(-2deg) scale(${1.5 - 0.5 * d})`, opacity: Math.min(1, d * 1.5) }}>
            {c.name}
          </Note>
        </div>
      ) : null}
    </Stage>
  );
}

const W = color.paper;
const S = 7; // line weight of the drawings

/** A seated person in line art, facing right. */
function Person({ x, y, bob = 0 }: { x: number; y: number; bob?: number }) {
  return (
    <g transform={`translate(${x} ${y + bob})`} fill="none" stroke={W} strokeWidth={S} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={0} cy={-150} r={34} />
      <path d="M -10 -110 L -20 -20 L 50 -20 L 60 60" />
      <path d="M -6 -90 L 50 -60" />
    </g>
  );
}

/** A chair in line art; `flip` faces it left. */
function Chair({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`} fill="none" stroke={W} strokeWidth={S} strokeLinecap="round" strokeLinejoin="round">
      <path d="M -50 -160 L -40 0 L 70 0" />
      <path d="M -40 0 L -40 80 M 60 0 L 60 80" />
    </g>
  );
}

function SceneFrame({ f, tag, caption, children }: { f: number; tag: string; caption: readonly string[]; children: React.ReactNode }) {
  const inn = progress(f, 0, 10);
  return (
    <Stage bg={color.ink} fg={color.paper}>
      <div style={{ position: "absolute", left: 72, top: 70, fontFamily: monoFamily, fontSize: 26, fontWeight: 600, letterSpacing: 3, color: color.signal }}>{tag}</div>
      <Lines f={f} at={2} lines={caption} accent={color.signal} size={100} style={{ position: "absolute", left: 72, right: 72, top: 120 }} />
      <svg width={1080} height={1440} style={{ position: "absolute", inset: 0, opacity: inn, transform: `translateY(${(1 - inn) * 40}px)` }}>
        {children}
      </svg>
    </Stage>
  );
}

/** No one to practise with: the counselor waits, the other chair stays empty, the clock races. */
function PainPractice({ f }: { f: number }) {
  const c = copy.why.painA;
  const minute = f * 24; // a full turn every 15 frames: time flying by
  const hour = f * 2;
  const q = Math.sin((f / BEAT) * Math.PI) * 10;
  const ghost = 0.25 + 0.2 * Math.sin(f / 4);
  return (
    <SceneFrame f={f} tag={c.tag} caption={c.caption}>
      {/* the clock */}
      <g transform="translate(540 520)" fill="none" stroke={W} strokeWidth={S} strokeLinecap="round">
        <circle r={70} />
        <line x1={0} y1={0} x2={0} y2={-48} transform={`rotate(${minute})`} />
        <line x1={0} y1={0} x2={0} y2={-30} transform={`rotate(${hour})`} strokeWidth={S + 2} />
      </g>
      {/* the counselor, waiting */}
      <Chair x={270} y={1000} />
      <Person x={290} y={1000} bob={Math.sin(f / 6) * 3} />
      {/* the empty chair across, an outline that isn't there, a question */}
      <Chair x={790} y={1000} flip />
      <g opacity={ghost} fill="none" stroke={W} strokeWidth={S - 2} strokeDasharray="14 12" strokeLinecap="round">
        <circle cx={770} cy={850} r={34} />
        <path d="M 780 890 L 790 980 L 720 980" />
      </g>
      <g transform={`translate(800 ${700 + q})`}>
        <rect x={-46} y={-60} width={92} height={92} rx={18} fill={color.signal} />
        <text x={0} y={8} textAnchor="middle" fontSize={64} fontWeight={900} fill={color.ink}>
          ?
        </text>
      </g>
    </SceneFrame>
  );
}

/** Supervision: a queue at the door that barely moves, and a price tag swinging on it. */
function PainSupervision({ f }: { f: number }) {
  const c = copy.why.painB;
  const swing = Math.sin(f / 7) * 12;
  const shuffle = (f % BEAT) / BEAT; // the queue inches forward each beat, then waits
  return (
    <SceneFrame f={f} tag={c.tag} caption={c.caption}>
      {/* the door */}
      <g fill="none" stroke={W} strokeWidth={S} strokeLinejoin="round">
        <rect x={800} y={600} width={200} height={420} rx={6} />
        <circle cx={830} cy={820} r={8} fill={W} />
      </g>
      <rect x={830} y={640} width={140} height={70} rx={8} fill={W} />
      <text x={900} y={690} textAnchor="middle" fontSize={44} fontWeight={900} fill={color.ink}>
        {c.door}
      </text>
      {/* the price tag, swinging from the door */}
      <g transform={`translate(1000 760) rotate(${swing})`}>
        <line x1={0} y1={0} x2={0} y2={60} stroke={W} strokeWidth={4} />
        <path d="M -60 60 L 60 60 L 60 150 L -60 150 Z" fill={color.signal} />
        <text x={0} y={122} textAnchor="middle" fontSize={44} fontWeight={900} fill={color.ink}>
          {c.price}
        </text>
      </g>
      {/* the queue */}
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const x = 690 - k * 115 + 10 * Math.min(1, shuffle * 3);
        const bob = Math.abs(Math.sin((f + k * 5) / 5)) * -8;
        return (
          <g key={k} transform={`translate(${x} ${1020 + bob})`} fill="none" stroke={W} strokeWidth={S} strokeLinecap="round" strokeLinejoin="round">
            <circle cx={0} cy={-210} r={30} />
            <path d="M 0 -175 L 0 -80 M 0 -80 L -24 0 M 0 -80 L 24 0 M -30 -140 L 30 -140" />
          </g>
        );
      })}
      <line x1={60} y1={1024} x2={1020} y2={1024} stroke="rgba(255,255,255,0.3)" strokeWidth={4} />
    </SceneFrame>
  );
}

/** The answer, on white: two cards slam in, each with a tiny demo. */
function Answers({ f }: { f: number }) {
  const c = copy.why;
  const cards = WHY.cards.map((t) => sec(t - WHY.solve));
  return (
    <Stage>
      <Lines f={f} at={2} lines={c.solve} accent={color.accent} size={96} style={{ position: "absolute", left: 72, right: 72, top: 90 }} />
      {c.answers.map((a, k) => {
        const s = cards[k]!;
        if (f < s) return null;
        const d = progress(f, s, 6, ease.spring);
        const r = ANSWER_RECTS[k]!;
        const local = f - s;
        return (
          <Note
            key={a.title}
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              boxSizing: "border-box",
              padding: "28px 40px",
              whiteSpace: "normal",
              background: local < 2 ? color.signal : color.paper,
              transform: `rotate(${k ? 1.2 : -1.2}deg) scale(${1.4 - 0.4 * d})`,
              opacity: Math.min(1, d * 1.5),
            }}
          >
            <div style={{ fontFamily: monoFamily, fontSize: 24, fontWeight: 600, letterSpacing: 3, color: color.accent }}>{a.tag}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 4 }}>
              <span style={{ fontSize: 84, fontWeight: 900, letterSpacing: -2 }}>{a.title}</span>
              <span style={{ fontSize: 36, fontWeight: 700, color: color.muted }}>{a.sub}</span>
            </div>
            {"me" in a ? <ChatDemo f={local} me={a.me} client={a.client} /> : <FeedbackDemo f={local} quote={a.quote} instead={a.instead} insteadText={a.insteadText} />}
          </Note>
        );
      })}
    </Stage>
  );
}

const pop = (f: number, at: number) => progress(f, at, 6, ease.spring);

function ChatDemo({ f, me, client }: { f: number; me: string; client: string }) {
  const a = pop(f, 8), b = pop(f, 22);
  return (
    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14, fontSize: 34, fontWeight: 600 }}>
      <div style={{ alignSelf: "flex-end", background: color.ink, color: color.paper, padding: "14px 22px", borderRadius: "20px 20px 4px 20px", opacity: Math.min(1, a), transform: `scale(${0.85 + 0.15 * a})`, transformOrigin: "100% 100%" }}>{me}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, opacity: Math.min(1, b), transform: `scale(${0.85 + 0.15 * b})`, transformOrigin: "0 100%" }}>
        <RobotHead />
        <div style={{ background: color.subtle, border: `2px solid ${color.line}`, padding: "14px 22px", borderRadius: "20px 20px 20px 4px" }}>{client}</div>
      </div>
    </div>
  );
}

function FeedbackDemo({ f, quote, instead, insteadText }: { f: number; quote: string; instead: string; insteadText: string }) {
  const a = pop(f, 8), b = pop(f, 24);
  return (
    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: color.subtle, padding: "14px 22px", fontSize: 34, fontWeight: 600, opacity: Math.min(1, a), transform: `translateX(${(1 - a) * -40}px)` }}>
        <span style={{ fontSize: 24, color: color.muted, marginRight: 14 }}>你说</span>「{quote}」
      </div>
      <div style={{ background: color.accent, color: color.paper, padding: "14px 22px", fontSize: 34, fontWeight: 700, opacity: Math.min(1, b), transform: `translateX(${(1 - b) * 60}px)` }}>
        <span style={{ fontSize: 24, opacity: 0.8, marginRight: 14 }}>{instead}</span>
        <Rich text={`「${insteadText}」`} accent={color.signal} />
      </div>
    </div>
  );
}

/** The AI client's face: the same little robot as at the end. */
function RobotHead() {
  return (
    <svg width={64} height={70} viewBox="0 0 64 70" style={{ flexShrink: 0 }}>
      <line x1={32} y1={6} x2={32} y2={18} stroke={color.ink} strokeWidth={4} strokeLinecap="round" />
      <circle cx={32} cy={6} r={5} fill={color.accent} />
      <rect x={6} y={18} width={52} height={44} rx={11} fill={color.paper} stroke={color.ink} strokeWidth={4} />
      <circle cx={23} cy={38} r={5} fill={color.ink} />
      <circle cx={41} cy={38} r={5} fill={color.ink} />
      <path d="M24 50 Q32 55 40 50" fill="none" stroke={color.ink} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}
