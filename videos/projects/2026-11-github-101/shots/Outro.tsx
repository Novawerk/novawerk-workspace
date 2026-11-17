import { Lockup, Rich, starFall } from "../../../kit/brand";
import { STAR_FALL, color, sec } from "../theme";
import { Icon, Shell, fade, land, pop, settle, useShot } from "./parts";

// The last two shots: three habits, and the close.

const HABIT_ICONS = ["issue", "pr", "lock"] as const;

export function Shot9Habits() {
  const { f, at, t, c, lang } = useShot("habits");
  const h = c.habits;
  const subs = [1e9, at(t.HABITS.subs[0]!), at(t.HABITS.subs[1]!)];
  return (
    <Shell shot="habits" title={h.title}>
      {h.notes.map((text, i) => {
        const a = at(t.HABITS.notes[i]!);
        const d = land(f, a, 9);
        const tilt = [-1.5, 1.2, -0.8][i]!;
        return (
          <div key={text} style={{ position: "absolute", left: 64, top: 300 + i * 292, width: 952, height: 256, background: color.paper, border: `3px solid ${color.ink}`, display: "flex", alignItems: "center", gap: 34, padding: "0 36px", opacity: fade(f, a, 3), transform: `translateY(${(1 - d) * -50}px) rotate(${tilt + (1 - d) * 6}deg)` }}>
            <div style={{ width: 132, height: 132, flexShrink: 0, background: color.ink, color: color.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={HABIT_ICONS[i]!} size={84} stroke={2} />
            </div>
            <div>
              <div style={{ fontSize: lang === "en" ? 52 : 66, fontWeight: 900, letterSpacing: lang === "en" ? -1 : -2, whiteSpace: "nowrap" }}>
                <Rich text={text} accent={color.accent} />
              </div>
              {h.subs[i] ? <div style={{ fontSize: 36, fontWeight: 700, color: color.muted, marginTop: 8, opacity: fade(f, subs[i]!, 6) }}>{h.subs[i]}</div> : null}
            </div>
          </div>
        );
      })}
    </Shell>
  );
}

const SPIN = 360 / (14 * 30); // the site's 14-second turn, per frame

export function Shot10Close() {
  const { f, at, t, c, lang } = useShot("close");
  const landed = at(t.CLOSE.land);
  const start = landed - sec(STAR_FALL);
  const fall = starFall(f - start, sec(STAR_FALL));
  const word = fade(f, landed + 5, 8);
  const bye = at(t.CLOSE.bye);
  return (
    <Shell shot="close" dark subtitles={false}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 380, display: "flex", justifyContent: "center", opacity: f >= start ? 1 : 0 }}>
        <Lockup
          height={104}
          tone="dark"
          reach={fall.reach}
          starStyle={{ transform: `translateY(${-fall.drop * 700}px) scale(${fall.scaleX}, ${fall.scaleY}) rotate(${fall.spin + f * SPIN}deg)` }}
          wordmarkStyle={{ opacity: word, transform: `translateX(${(1 - word) * -40}px)` }}
        />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 500, textAlign: "center", fontSize: 300, fontWeight: 800, letterSpacing: -12, lineHeight: 1.1, color: color.signal, ...pop(f, landed + 12) }}>{c.number}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 900, textAlign: "center", fontSize: lang === "en" ? 54 : 66, fontWeight: 900, letterSpacing: -1, ...settle(fade(f, at(t.CLOSE.line), 8), 18) }}>
        <Rich text={c.close.line} accent={color.signal} />
      </div>
      {f >= bye ? <div style={{ position: "absolute", left: 0, right: 0, top: 1030, textAlign: "center", fontSize: 44, fontWeight: 700, color: color.lineStrong, ...settle(fade(f, bye, 8), 12) }}>{c.close.bye}</div> : null}
    </Shell>
  );
}
