import { Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

import { Lockup, starFall } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { useCopy } from "../copy";
import { CLIENT, CUES, DURATION, FOUNDER, HOOK, PROBLEM, ROAD, STAR_FALL, SUPERVISOR, VOICE, sec } from "../theme";
import { Glass, Headline, Label, Night, Phone, glow, gradient, rise } from "./glow";
import { CLIENT_LEVEL, COUNSELOR_LEVEL } from "./voiceData";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const chipText = { fontSize: 38, fontWeight: 700, padding: "18px 30px", whiteSpace: "nowrap" } as const;

// 0:00–0:03 · The hook: the home screen rises in a phone, two dates in glass, the headline.
export const HOOK_FRAMES = sec(CUES.problem - CUES.hook);

export function Shot1Hook() {
  const f = useCurrentFrame();
  const copy = useCopy();
  const c = copy.hook;
  const up = rise(f, sec(HOOK.phone), 30);
  const turn = interpolate(f, [0, HOOK_FRAMES], [-24, -14], clamp);
  return (
    <Night f={f}>
      <Phone src="screen1.png" width={430} turn={turn} lift={(1 - up) * 600} bob={Math.sin(f / 14) * 8} style={{ left: 560, top: 90 }} />
      {c.chips.map((chip, k) => (
        <Glass key={chip} f={f} at={sec(HOOK.chips[k]!)} style={{ left: 60, top: 280 + k * 140, ...chipText }}>
          {chip}
        </Glass>
      ))}
      <Headline f={f} at={sec(HOOK.caption)} lines={c.caption} size={c.captionSize} style={{ position: "absolute", left: 72, right: 40, top: 1110 }} />
    </Night>
  );
}

// 0:03–0:08 · The problem: the headline, two glass cards.
export const PROBLEM_FRAMES = sec(CUES.client - CUES.problem);

export function Shot2Problem() {
  const f = useCurrentFrame();
  const copy = useCopy();
  const c = copy.problem;
  const at = (t: number) => sec(t - CUES.problem);
  return (
    <Night f={f + 200} hazeAt={[0.3, 0.3]}>
      <Label f={f} at={0} style={{ position: "absolute", left: 72, top: 110 }}>
        {c.label}
      </Label>
      <Headline f={f} at={at(PROBLEM.caption)} lines={c.caption} size={120} style={{ position: "absolute", left: 72, right: 72, top: 170 }} />
      {c.cards.map((card, k) => (
        <Glass key={card.title} f={f} at={at(PROBLEM.cards[k]!)} radius={36} style={{ left: 72, right: 72, top: 640 + k * 300, padding: "40px 44px", display: "flex", gap: 36, alignItems: "center" }}>
          <div style={{ flexShrink: 0, width: 110, height: 110, borderRadius: 30, background: gradient, color: glow.night, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64, fontWeight: 800 }}>{card.icon}</div>
          <div>
            <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1.5 }}>{card.title}</div>
            <div style={{ fontSize: 34, fontWeight: 500, color: glow.dim, marginTop: 6 }}>{card.sub}</div>
          </div>
        </Glass>
      ))}
    </Night>
  );
}

// 0:08–0:15 · The AI client: the case brief behind, the session in front, two chips.
export const CLIENT_FRAMES = sec(CUES.voice - CUES.client);

export function Shot3Client() {
  const f = useCurrentFrame();
  const copy = useCopy();
  const c = copy.client;
  const at = (t: number) => sec(t - CUES.client);
  const back = rise(f, at(CLIENT.back), 26);
  const front = rise(f, at(CLIENT.front), 26);
  const drift = interpolate(f, [0, CLIENT_FRAMES], [0, 1], clamp);
  return (
    <Night f={f + 400} hazeAt={[0.6, 0.45]}>
      <Label f={f} at={0} style={{ position: "absolute", left: 72, top: 70 }}>
        {c.label}
      </Label>
      <Headline f={f} at={2} lines={c.caption} size={96} style={{ position: "absolute", left: 72, right: 72, top: 120 }} />
      <div style={{ opacity: 0.55 * back }}>
        <Phone src="screen2.png" width={360} turn={22 - 6 * drift} lift={(1 - back) * 300 + 40} bob={Math.sin(f / 16 + 1) * 6} style={{ left: 110, top: 400 }} />
      </div>
      <div style={{ opacity: Math.min(1, front * 1.4) }}>
        <Phone src="screen3.png" width={430} turn={-18 + 8 * drift} lift={(1 - front) * 400} bob={Math.sin(f / 14) * 8} style={{ left: 520, top: 380 }} />
      </div>
      {c.chips.map((chip, k) => (
        <Glass key={chip} f={f} at={at(CLIENT.chips[k]!)} style={{ left: 60 + k * 30, top: 1180 + k * 120, ...chipText, fontSize: 34 }}>
          {chip}
        </Glass>
      ))}
    </Night>
  );
}

// 0:15–0:25 · By voice: one exchange from a real call with the AI client. No phone here: the app's
// call page shows no words while you talk, so the picture is the sound itself, with the two call
// states the app shows and what is said as captions.
export const VOICE_FRAMES = sec(CUES.supervisor - CUES.voice);
const ORB = { x: 540, y: 800, r: 130 } as const;
const level = (xs: readonly number[], f: number) => ((xs[f - 1] ?? 0) + 2 * (xs[f] ?? 0) + (xs[f + 1] ?? 0)) / 4;
const lately = (xs: readonly number[], f: number) => Math.max(0, ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (xs[f - k] ?? 0) * (1 - k / 8)));

/** A line that lights up as it is spoken: word by word where the timings match, evenly otherwise. */
function Spoken({ text, line, t }: { text: string; line: { at: number; end: number; words: readonly number[] }; t: number }) {
  const words = text.split(" ");
  const lit = (p: number) => ({ color: `rgba(255,255,255,${0.3 + 0.7 * p})` });
  if (words.length === line.words.length) {
    return (
      <>
        {words.map((w, i) => (
          <span key={i} style={lit(interpolate(t, [line.words[i]!, line.words[i]! + 0.12], [0, 1], clamp))}>
            {w}{" "}
          </span>
        ))}
      </>
    );
  }
  const chars = [...text];
  const said = interpolate(t, [line.at, line.end], [0, chars.length], clamp);
  return (
    <>
      {chars.map((ch, i) => (
        <span key={i} style={lit(Math.min(1, Math.max(0, said - i)))}>
          {ch}
        </span>
      ))}
    </>
  );
}

export function Shot3bVoice() {
  const f = useCurrentFrame();
  const copy = useCopy();
  const c = copy.voice;
  const t = f / 30;
  const you = level(COUNSELOR_LEVEL, f);
  const them = level(CLIENT_LEVEL, f);
  const first = VOICE.client[0]!;
  const last = VOICE.client[VOICE.client.length - 1]!;
  const speaking = t >= first.at - 0.05 && t < last.end + 0.15;
  const awake = interpolate(t, [first.at - 0.3, first.at + 0.2], [0, 1], clamp);
  const orbIn = rise(f, 4, 24);
  const k = VOICE.client.findIndex((l, i) => t >= l.at - 0.1 && t < (VOICE.client[i + 1]?.at ?? l.end + 0.6) - 0.1);
  const lineIn = k >= 0 ? rise(f, sec(VOICE.client[k]!.at - 0.1), 8) : 0;
  const ring = lately(CLIENT_LEVEL, f);
  const noteIn = rise(f, 20, 16);
  return (
    <Night f={f + 500} hazeAt={[0.5, 0.56]}>
      <Audio src={staticFile("voice-call.mp3")} volume={1.5} />
      <Label f={f} at={0} style={{ position: "absolute", left: 72, top: 70 }}>
        {c.label}
      </Label>
      <Headline f={f} at={2} lines={c.caption} size={96} style={{ position: "absolute", left: 72, right: 72, top: 120 }} />
      <Glass f={f} at={10} style={{ right: 60, top: 48, display: "flex", alignItems: "center", gap: 12, fontSize: 28, fontWeight: 700, padding: "12px 24px", whiteSpace: "nowrap" }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={glow.mint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill={glow.mint} />
          <path d="M15.5 9a4 4 0 0 1 0 6" />
          <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
        </svg>
        {c.sound}
      </Glass>

      {/* You: the counselor's line, lighting up as it is spoken */}
      <Glass f={f} at={8} radius={36} style={{ left: 72, right: 72, top: 290, padding: "28px 36px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: monoFamily, fontSize: 24, fontWeight: 600, letterSpacing: 3, color: glow.lilac }}>{c.you}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 44 }}>
            {[0.6, 1, 0.75, 0.95, 0.55].map((w, i) => (
              <div key={i} style={{ width: 7, borderRadius: 4, background: glow.mint, opacity: 0.45 + 0.55 * you, height: 8 + 36 * you * w * (0.6 + 0.4 * Math.sin(f * 0.9 + i * 1.7)) }} />
            ))}
          </div>
        </div>
        <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.25, letterSpacing: -0.5, marginTop: 12 }}>
          <Spoken text={c.counselor} line={VOICE.counselor} t={t} />
        </div>
      </Glass>

      {/* The AI client: an orb that moves with the real audio */}
      {[0, 1, 2].map((i) => {
        const p = (f / 48 + i / 3) % 1;
        const r = ORB.r + 10 + p * 150;
        return <div key={i} style={{ position: "absolute", left: ORB.x - r, top: ORB.y - r, width: 2 * r, height: 2 * r, borderRadius: r, border: `2px solid ${glow.lilac}`, opacity: (1 - p) * 0.55 * ring * orbIn }} />;
      })}
      <div
        style={{
          position: "absolute",
          left: ORB.x - ORB.r,
          top: ORB.y - ORB.r,
          width: 2 * ORB.r,
          height: 2 * ORB.r,
          borderRadius: ORB.r,
          background: `radial-gradient(circle at 34% 28%, #ffffff 0%, ${glow.lilac} 26%, ${glow.haze} 58%, ${glow.mint} 105%)`,
          boxShadow: `0 0 ${50 + 150 * them}px rgba(183,156,240,${0.45 + 0.4 * them}), 0 0 ${20 + 70 * them}px rgba(143,240,180,${0.25 + 0.35 * them})`,
          opacity: orbIn * (0.5 + 0.5 * awake),
          transform: `scale(${(0.9 + 0.1 * awake) * (1 + 0.16 * them + 0.015 * Math.sin(f / 9))})`,
        }}
      />
      <Glass f={f} at={14} style={{ left: 0, right: 0, margin: "0 auto", width: "fit-content", top: 990, display: "flex", alignItems: "center", gap: 14, fontFamily: monoFamily, fontSize: 26, fontWeight: 600, letterSpacing: 1, padding: "12px 26px", whiteSpace: "nowrap" }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: speaking ? glow.mint : glow.lilac, boxShadow: `0 0 16px ${speaking ? glow.mint : glow.lilac}` }} />
        {c.states[speaking ? 1 : 0]}
      </Glass>
      {k >= 0 ? (
        <div style={{ position: "absolute", left: 72, right: 72, top: 1090, textAlign: "center", textWrap: "balance", fontSize: 66, fontWeight: 800, lineHeight: 1.14, letterSpacing: -1.5, opacity: lineIn, transform: `translateY(${(1 - lineIn) * 14}px)`, filter: `blur(${(1 - lineIn) * 6}px)` }}>
          <Spoken text={c.lines[k]!} line={VOICE.client[k]!} t={t} />
        </div>
      ) : null}
      <div style={{ position: "absolute", left: 90, right: 90, top: 1306, textAlign: "center", textWrap: "balance", fontSize: 26, fontWeight: 500, lineHeight: 1.4, color: glow.dim, opacity: noteIn }}>{c.note}</div>
    </Night>
  );
}

// 0:25–0:31 · The AI supervisor: the report on the phone, two callouts.
export const SUPERVISOR_FRAMES = sec(CUES.road - CUES.supervisor);

export function Shot4Supervisor() {
  const f = useCurrentFrame();
  const copy = useCopy();
  const c = copy.supervisor;
  const at = (t: number) => sec(t - CUES.supervisor);
  const up = rise(f, at(SUPERVISOR.phone), 26);
  const turn = interpolate(f, [0, SUPERVISOR_FRAMES], [-20, -10], clamp);
  return (
    <Night f={f + 600} hazeAt={[0.7, 0.55]}>
      <Label f={f} at={0} style={{ position: "absolute", left: 72, top: 70 }}>
        {c.label}
      </Label>
      <Headline f={f} at={2} lines={c.caption} size={96} style={{ position: "absolute", left: 72, right: 72, top: 120 }} />
      <div style={{ opacity: Math.min(1, up * 1.4) }}>
        <Phone src="screen4.png" width={430} turn={turn} lift={(1 - up) * 400} bob={Math.sin(f / 14) * 8} style={{ left: 580, top: 380 }} />
      </div>
      {c.callouts.map((co, k) => (
        <Glass key={co.title} f={f} at={at(SUPERVISOR.callouts[k]!)} radius={30} style={{ left: 50, width: 540, top: 560 + k * 330, padding: "30px 34px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: k === 0 ? glow.mint : glow.lilac, boxShadow: `0 0 24px ${k === 0 ? glow.mint : glow.lilac}` }} />
            <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1 }}>{co.title}</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 500, color: glow.dim, marginTop: 10, lineHeight: 1.3 }}>{co.sub}</div>
        </Glass>
      ))}
    </Night>
  );
}

// 0:31–0:38 · Six weeks, for real: a glowing timeline, the real App Store listing, the handover.
export const ROAD_FRAMES = sec(CUES.founder - CUES.road);

export function Shot5Road() {
  const f = useCurrentFrame();
  const copy = useCopy();
  const c = copy.road;
  const at = (t: number) => sec(t - CUES.road);
  const stops = ROAD.stops.map(at);
  const line = interpolate(f, [stops[0]!, stops[3]!], [0, 1], clamp);
  const listing = rise(f, at(ROAD.listing), 22);
  const handover = rise(f, at(ROAD.handover), 14);
  const TOP = 420, GAP = 120, X = 110;
  return (
    <Night f={f + 800} hazeAt={[0.25, 0.35]}>
      <Headline f={f} at={0} lines={c.caption} size={120} style={{ position: "absolute", left: 72, right: 72, top: 80 }} />
      <div style={{ position: "absolute", left: X - 2, top: TOP + 30, width: 4, height: GAP * 3 * line, background: gradient.replace("90deg", "180deg"), boxShadow: `0 0 18px ${glow.lilac}` }} />
      {c.stops.map((s, k) => {
        if (f < stops[k]!) return null;
        const p = rise(f, stops[k]!, 12);
        const last = k === 3;
        return (
          <div key={s.date} style={{ position: "absolute", left: X - 16, top: TOP + k * GAP + 14, display: "flex", alignItems: "center", gap: 36, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: last ? glow.mint : glow.lilac, boxShadow: `0 0 ${last ? 40 : 20}px ${last ? glow.mint : glow.lilac}` }} />
            <span style={{ fontFamily: monoFamily, fontSize: 30, color: glow.dim, width: 150 }}>{s.date}</span>
            <span style={{ fontSize: last ? 60 : 52, fontWeight: 800, letterSpacing: -1.5, ...(last ? { background: gradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" } : {}) }}>{s.label}</span>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 72, right: 72, top: 930, borderRadius: 28, overflow: "hidden", border: `1.5px solid ${glow.glassLine}`, boxShadow: `0 30px 90px rgba(0,0,0,0.5), 0 0 60px rgba(143,240,180,${0.25 * listing})`, opacity: listing, transform: `translateY(${(1 - listing) * 60}px) scale(${0.96 + 0.04 * listing})` }}>
        <Img src={staticFile("appstore-header.png")} style={{ width: "100%", display: "block" }} />
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 1320, fontSize: 40, fontWeight: 700, color: glow.dim, opacity: handover, transform: `translateY(${(1 - handover) * 16}px)` }}>{c.handover}</div>
    </Night>
  );
}

// 0:38–1:14.5 · The founder, in his own words: his clip in a glowing frame, subtitles below.
export const FOUNDER_FRAMES = sec(CUES.end - CUES.founder);
const BOX = { x: 165, y: 80, w: 750, h: 1000 } as const;

export function Shot6Founder() {
  const f = useCurrentFrame();
  const copy = useCopy();
  const c = copy.founder;
  const clipAt = sec(FOUNDER.clip - CUES.founder);
  const inn = rise(f, 0, 20);
  const t = (f - clipAt) / 30;
  const k = FOUNDER.lines.findIndex(([a, b]) => t >= a && t < b + 0.35);
  const lineIn = k >= 0 ? rise(f, clipAt + sec(FOUNDER.lines[k]![0]), 8) : 0;
  return (
    <Night f={f + 1000} hazeAt={[0.5, 0.3]}>
      <div style={{ position: "absolute", left: BOX.x, top: BOX.y, width: BOX.w, height: BOX.h, borderRadius: 44, overflow: "hidden", border: `1.5px solid ${glow.glassLine}`, background: glow.deep, boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 90px rgba(183,156,240,0.35)`, opacity: inn, transform: `scale(${0.94 + 0.06 * inn})`, filter: `blur(${(1 - inn) * 10}px)` }}>
        <Sequence from={clipAt} layout="none">
          <OffthreadVideo src={staticFile("founder.mp4")} volume={1.7} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%" }} />
        </Sequence>
        <div style={{ position: "absolute", right: 20, bottom: 18, fontFamily: monoFamily, fontSize: 18, fontWeight: 600, letterSpacing: 2, color: "rgba(255,255,255,0.9)", background: "rgba(14,10,24,0.55)", borderRadius: 14, padding: "6px 14px" }}>{c.lang}</div>
      </div>
      <Glass f={f} at={8} style={{ left: 120, top: 40, ...chipText, fontSize: 32, padding: "14px 26px" }}>
        {c.tag}
      </Glass>
      {k >= 0 ? (
        <div style={{ position: "absolute", left: 80, right: 80, top: 1120, textAlign: "center", fontSize: 52, fontWeight: 700, lineHeight: 1.28, letterSpacing: -0.5, opacity: lineIn, transform: `translateY(${(1 - lineIn) * 14}px)`, filter: `blur(${(1 - lineIn) * 6}px)` }}>{c.lines[k]}</div>
      ) : null}
    </Night>
  );
}

// 1:14.5–1:19.5 · The close: PSYGYM ×, the star falls into the lockup, No demos. We ship., the address.
export const END_FRAMES = sec(DURATION - CUES.end);
const SPIN = 360 / (14 * 30);

export function Shot7End() {
  const f = useCurrentFrame();
  const copy = useCopy();
  const c = copy.end;
  const fallAt = sec(0.5);
  const fall = starFall(f - fallAt, sec(STAR_FALL));
  const word = rise(f, fallAt + sec(STAR_FALL) + 4, 12);
  const withIn = rise(f, 0, 14);
  const foot = rise(f, 60, 16);
  return (
    <Night f={f + 1200} hazeAt={[0.5, 0.3]}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 210, textAlign: "center", fontSize: 60, fontWeight: 800, letterSpacing: -1, color: glow.dim, opacity: withIn }}>{c.with}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 320, display: "flex", justifyContent: "center" }}>
        <Lockup
          height={110}
          tone="dark"
          reach={fall.reach}
          starStyle={{ transform: `translateY(${-fall.drop * 700}px) scale(${fall.scaleX}, ${fall.scaleY}) rotate(${fall.spin + f * SPIN}deg)`, filter: `drop-shadow(0 0 24px ${glow.lilac})` }}
          wordmarkStyle={{ opacity: word, transform: `translateX(${(1 - word) * -40}px)` }}
        />
      </div>
      <Headline f={f} at={fallAt + sec(STAR_FALL) + 6} lines={c.caption} size={132} style={{ position: "absolute", left: 72, right: 72, top: 560, textAlign: "center" }} />
      <Glass f={f} at={42} style={{ left: 0, right: 0, margin: "0 auto", width: "fit-content", top: 960, fontSize: 76, fontWeight: 800, letterSpacing: -2, padding: "22px 60px 28px" }}>
        {c.pill}
      </Glass>
      <div style={{ position: "absolute", left: 120, right: 120, top: 1220, textAlign: "center", fontSize: 32, fontWeight: 600, lineHeight: 1.35, color: glow.dim, opacity: foot }}>{c.footer}</div>
    </Night>
  );
}
