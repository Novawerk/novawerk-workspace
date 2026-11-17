import { Lockup, Rich, starFall } from "../../../kit/brand";
import { STAR_FALL, color, sec } from "../theme";
import { ALL_GOOD, FINAL, GROOVE, HANDS_UP, NO_NO, STEP } from "./moves";
import { Bot, Icon, Shell, Beaver, fade, land, pop, settle, useShot } from "./parts";

// The last two shots: two things to remember, one at a time, and the close.

const HABIT_ICONS = ["lock", "history"] as const;

export function Shot6Habits() {
  const { f, at, t, c, lang } = useShot("habits");
  const notes = t.HABITS.notes.map(at);
  const i = f >= notes[1]! ? 1 : 0;
  return (
    <Shell shot="habits">
      {f >= notes[i]! ? (
        <div key={i}>
          <div style={{ position: "absolute", left: 64, top: 390, width: 340, height: 340, background: color.ink, color: color.paper, display: "flex", alignItems: "center", justifyContent: "center", opacity: fade(f, notes[i]!, 3), transform: `rotate(${[-4, 3][i]! + (1 - land(f, notes[i]!, 9)) * 10}deg) scale(${0.8 + 0.2 * land(f, notes[i]!, 9)})` }}>
            <Icon name={HABIT_ICONS[i]!} size={224} stroke={1.9} />
          </div>
          <div style={{ position: "absolute", left: 64, top: 780, fontSize: lang === "en" ? 84 : 112, fontWeight: 900, letterSpacing: -3, whiteSpace: "nowrap", ...settle(fade(f, notes[i]! + 4, 6), 18) }}>
            <Rich text={c.habits[i]!} accent={color.accent} />
          </div>
        </div>
      ) : null}
      <Beaver shot="habits" x={800} height={430} steps={[{ from: 0, move: NO_NO, per: 1 }, { from: t.HABITS.notes[1]! - 0.1, move: ALL_GOOD }]} />
    </Shell>
  );
}

const SPIN = 360 / (14 * 30); // the site's 14-second turn, per frame

export function Shot7Close() {
  const { f, at, t, c, lang } = useShot("close");
  const landed = at(t.CLOSE.land);
  const start = landed - sec(STAR_FALL);
  const fall = starFall(f - start, sec(STAR_FALL));
  const word = fade(f, landed + 5, 8);
  return (
    <Shell shot="close" dark lyric={false}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 230, display: "flex", justifyContent: "center", opacity: f >= start ? 1 : 0 }}>
        <Lockup
          height={96}
          tone="dark"
          reach={fall.reach}
          starStyle={{ transform: `translateY(${-fall.drop * 600}px) scale(${fall.scaleX}, ${fall.scaleY}) rotate(${fall.spin + f * SPIN}deg)` }}
          wordmarkStyle={{ opacity: word, transform: `translateX(${(1 - word) * -40}px)` }}
        />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 320, textAlign: "center", fontSize: 260, fontWeight: 800, letterSpacing: -10, lineHeight: 1.1, color: color.signal, ...pop(f, at(t.CLOSE.number)) }}>{c.number}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", fontSize: lang === "en" ? 52 : 64, fontWeight: 900, letterSpacing: -1, ...settle(fade(f, at(t.CLOSE.line), 8), 18) }}>
        <Rich text={c.close} accent={color.signal} />
      </div>
      <Beaver shot="close" dark x={350} height={420} steps={[{ from: 0, move: GROOVE }, { from: t.CLOSE.number - 0.15, move: HANDS_UP }, { from: t.CLOSE.line - 0.1, move: STEP }, { from: t.when("close", 1, 1) - 0.1, move: FINAL }]} />
      <Bot shot="close" dark x={770} height={290} up={t.CLOSE.line} />
    </Shell>
  );
}
