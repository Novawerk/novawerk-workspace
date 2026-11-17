import type { CSSProperties, ReactNode } from "react";

import { Lockup, Note, Rich } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { LYRICS, shown } from "../lyrics";
import { color } from "../theme";
import { CHEER, FLINCH, GROOVE, HANDS_UP, POINT, ROOF, SEARCH, SHRUG, STEP, ALL_GOOD } from "./moves";
import { Avatar, Icon, Shell, Beaver, Window, fade, land, pop, settle, useShot } from "./parts";

// The first four shots: the series title, the mess, what GitHub is, three words.

const border = `3px solid ${color.ink}`;

function Tag({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "inline-block", padding: "4px 14px", fontSize: 26, fontWeight: 800, whiteSpace: "nowrap", color: color.accent, border: `3px solid ${color.accent}`, background: color.paper, ...style }}>{children}</div>;
}

// --- 1 · the title: the series, and today's subject (the song opens on its name) -------------------

export function Shot1Title() {
  const { f, at, t, c } = useShot("title");
  const today = at(t.TITLE.today);
  return (
    <Shell shot="title" lyric={false}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 170, display: "flex", justifyContent: "center", ...settle(fade(f, 3, 7), 20) }}>
        <Lockup height={84} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 250, textAlign: "center", fontSize: 300, fontWeight: 800, letterSpacing: -12, lineHeight: 1.1, color: color.accent, ...pop(f, at(t.TITLE.number)) }}>{c.number}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 620, display: "flex", justifyContent: "center" }}>
        <div style={{ padding: "22px 44px", background: color.ink, color: color.paper, fontSize: 84, fontWeight: 900, letterSpacing: -2, whiteSpace: "nowrap", opacity: fade(f, today, 3), transform: `rotate(-1.5deg) scale(${0.9 + 0.1 * land(f, today, 9)})` }}>
          <Rich text={c.today} accent={color.signal} />
        </div>
      </div>
      <Beaver shot="title" x={540} height={480} steps={[{ from: 0, move: GROOVE }, { from: t.TITLE.number - 0.2, move: CHEER }, { from: t.TITLE.today, move: STEP }]} />
    </Shell>
  );
}

// --- 2 · the mess: asks in chat, files in mail, three "final" versions; where is the latest? --------

const SPOTS = [
  { x: 60, y: 350, r: -4 }, { x: 380, y: 468, r: 3 }, { x: 110, y: 586, r: -2 }, // chats
  { x: 400, y: 704, r: 4 }, { x: 64, y: 812, r: -3 }, // mails
  { x: 64, y: 950, r: -2 }, { x: 110, y: 1046, r: 1.5 }, { x: 156, y: 1142, r: -1 }, // files
];

/** English lines are longer: the second chat starts further left, and the file names stack tighter, clear of the beaver's paw. */
const EN_X: Record<number, number> = { 1: 300, 5: 40, 6: 60, 7: 80 };

export function Shot2Hook() {
  const { f, at, t, c, lang } = useShot("hook");
  const pile = [
    ...c.hook.chats.map((text, i) => ({ text, icon: "chat" as const, at: t.HOOK.chats[i]!, size: lang === "en" ? 40 : 44, mono: false })),
    ...c.hook.mails.map((text, i) => ({ text, icon: "mail" as const, at: t.HOOK.mails[i]!, size: 38, mono: false })),
    ...c.hook.files.map((text, i) => ({ text, icon: "file" as const, at: t.HOOK.files[i]!, size: 30, mono: true })),
  ];
  const ask = at(t.HOOK.ask);
  return (
    <Shell shot="hook">
      {pile.map((n, i) => {
        const a = at(n.at);
        const d = land(f, a);
        const spot = SPOTS[i]!;
        return (
          <div key={n.text} style={{ position: "absolute", left: lang === "en" ? (EN_X[i] ?? spot.x) : spot.x, top: spot.y, display: "flex", alignItems: "center", gap: 16, padding: "22px 30px", background: color.paper, border, fontSize: n.size, fontWeight: 800, fontFamily: n.mono ? monoFamily : undefined, whiteSpace: "nowrap", opacity: fade(f, a, 3), transform: `translateY(${(1 - d) * -50}px) rotate(${spot.r + (1 - d) * 8}deg)` }}>
            <Icon name={n.icon} size={n.size + 4} />
            {n.text}
          </div>
        );
      })}
      <Beaver shot="hook" x={lang === "en" ? 834 : 810} height={420} steps={[{ from: 0, move: SEARCH }, { from: t.HOOK.files[0]! - 0.15, move: FLINCH }, { from: t.HOOK.ask - 0.1, move: SHRUG }]} />
      <div style={{ position: "absolute", left: 950, top: 690, fontSize: 170, fontWeight: 900, lineHeight: 1, color: color.accent, opacity: fade(f, ask, 3), transform: `rotate(${10 + (1 - land(f, ask, 9)) * 20}deg) scale(${0.6 + 0.4 * land(f, ask, 9)})` }}>?</div>
    </Shell>
  );
}

// --- 3 · what it is: a website; a shared folder, a board, a history --------------------------------

export function Shot3What() {
  const { f, at, t, c, lang } = useShot("what");
  const landAt = at(t.WHAT.land);
  const win = at(t.WHAT.window);
  const filesAt = at(t.WHAT.files);
  const boardAt = at(t.WHAT.board);
  const historyAt = at(t.WHAT.history);
  // the box, then the chip it becomes above the window
  const drop = land(f, landAt, 9);
  const chip = fade(f, win, 10);
  const mix = (a: number, b: number) => a + (b - a) * chip;

  return (
    <Shell shot="what">
      {f >= landAt ? (
        <div style={{ position: "absolute", left: mix(240, 64), top: mix(600, 338) + (1 - drop) * -140, width: mix(600, 232), height: mix(230, 66), background: color.ink, color: color.paper, display: "flex", alignItems: "center", justifyContent: "center", fontSize: mix(130, 40), fontWeight: 800, letterSpacing: mix(-4, -1), opacity: fade(f, landAt, 3) }}>
          {c.github}
        </div>
      ) : null}
      {f >= win + 12 ? <Tag style={{ position: "absolute", left: 316, top: 349, fontSize: 30, ...settle(fade(f, win + 12, 6), 10) }}>{c.what.noInstall}</Tag> : null}

      {f >= win + 2 ? (
        <Window style={{ top: 420, height: 740, ...settle(fade(f, win + 2, 7), 24) }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 946, height: 674 }}>
            {/* the shared folder */}
            {f >= filesAt - 2 ? (
              <div style={{ position: "absolute", left: 0, top: 0, width: 380, height: 440, borderRight: border }}>
                <Tag style={{ position: "absolute", left: 28, top: 24 }}>{c.what.tags[0]}</Tag>
                {c.what.files.map((name, i) => (
                  <div key={name} style={{ position: "absolute", left: 28, top: 98 + i * 82, display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700, opacity: fade(f, filesAt + 3 + i * 4, 4) }}>
                    <Icon name={i < 2 ? "folder" : "file"} size={46} />
                    {name}
                  </div>
                ))}
              </div>
            ) : null}

            {/* the board */}
            {f >= boardAt - 2 ? (
              <div style={{ position: "absolute", left: 383, top: 0, width: 563, height: 440 }}>
                <Tag style={{ position: "absolute", left: 28, top: 24 }}>{c.what.tags[1]}</Tag>
                {c.what.board.map((m, i) => (
                  <div key={m.text} style={{ position: "absolute", left: 28, right: 28, top: 104 + i * 128, display: "flex", flexDirection: i === 0 ? "row" : "row-reverse", alignItems: "center", gap: 14, opacity: fade(f, boardAt + 3 + i * 12, 4) }}>
                    <Avatar who={m.who} />
                    <div style={{ padding: "16px 20px", border, fontSize: 29, fontWeight: 700, whiteSpace: "nowrap" }}>{m.text}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* the history: its right end stays clear, the beaver stands in front of it */}
            {f >= historyAt - 2 ? (
              <div style={{ position: "absolute", left: 0, top: 440, width: 946, height: 234, borderTop: border }}>
                <Tag style={{ position: "absolute", left: 28, top: 20 }}>{c.what.tags[2]}</Tag>
                <div style={{ position: "absolute", left: 49, top: 106, width: 3, height: 76, background: color.ink }} />
                {c.what.history.map((h, i) => (
                  <div key={h.text} style={{ position: "absolute", left: 40, width: lang === "en" ? 452 : 430, top: 86 + i * 70, display: "flex", alignItems: "center", gap: 18, fontSize: 31, fontWeight: 700, whiteSpace: "nowrap", opacity: fade(f, historyAt + 3 + i * 9, 4) }}>
                    <div style={{ width: 21, height: 21, borderRadius: 11, background: color.accent, border }} />
                    <Avatar who={h.who} size={46} />
                    {h.text}
                    <span style={{ marginLeft: "auto", fontFamily: monoFamily, fontSize: 26, fontWeight: 600, color: color.muted }}>{h.day}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Window>
      ) : null}
      <Beaver shot="what" x={840} height={380} steps={[{ from: 0, move: GROOVE }, { from: t.WHAT.window, move: POINT }, { from: t.when("what", 3, 0) - 0.1, move: ALL_GOOD }]} />
    </Shell>
  );
}

// --- 4 · the chorus: three words, one at a time -----------------------------------------------------

const WORD_ICONS = ["folder", "issue", "pr"] as const;

export function Shot4Words() {
  const { f, at, t, c, lang, now } = useShot("words");
  const zh = lang === "zh";
  const cards = t.WORDS.cards.map(at);
  const i = cards.filter((a) => f >= a).length - 1; // the word being sung, −1 before the first
  const three = at(t.when("words", 0, 0));
  const sung = LYRICS[lang].find((s) => s.id === "words")!.lines;
  return (
    <Shell shot="words" dark lyric={[0]}>
      {i < 0 ? (
        <div style={{ position: "absolute", left: 80, top: 360, fontSize: 560, fontWeight: 900, lineHeight: 1, letterSpacing: -20, color: color.signal, ...pop(f, three) }}>3</div>
      ) : (
        <div key={i}>
          {/* the word, and what the song says about it */}
          <div style={{ position: "absolute", left: 64, top: 112, display: "flex", alignItems: "center", gap: 28, ...pop(f, cards[i]!) }}>
            <div style={{ width: 132, height: 132, flexShrink: 0, background: color.signal, color: color.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={WORD_ICONS[i]!} size={88} stroke={2.2} />
            </div>
            <span style={{ fontSize: i === 2 ? 112 : 128, fontWeight: 900, letterSpacing: -4, whiteSpace: "nowrap", color: color.signal }}>{c.words.cards[i]!.term}</span>
          </div>
          <div style={{ position: "absolute", left: 64, top: 280, ...pop(f, cards[i]!) }}>
            <span style={{ fontSize: zh ? 68 : 50, fontWeight: 900, letterSpacing: -1, whiteSpace: "nowrap", color: now >= t.WORDS.gloss[i]! - 0.04 ? color.paper : color.muted }}>{shown(sung[i + 1]![1]!)}</span>
          </div>
          {/* in plain words, on a note the dancer points at */}
          <Note style={{ position: "absolute", left: 64, top: 500, width: 500, padding: "36px 40px", fontSize: zh ? 58 : 48, lineHeight: 1.3, whiteSpace: "normal", color: color.ink, opacity: fade(f, cards[i]! + 4, 3), transform: `translateY(${(1 - land(f, cards[i]! + 4, 9)) * -40}px) rotate(${[-3, 2, -2][i]}deg)` }}>
            {c.words.cards[i]!.aka ? <div style={{ fontFamily: monoFamily, fontSize: 34, fontWeight: 600, color: color.muted, marginBottom: 12 }}>= {c.words.cards[i]!.aka}</div> : null}
            {/* one clause a line */}
            {c.words.cards[i]!.gloss.split(/(?<=[，,]) ?/).map((part) => (
              <div key={part}>
                <Rich text={part} accent={color.accent} />
              </div>
            ))}
          </Note>
        </div>
      )}
      <Beaver shot="words" dark x={730} height={500} bounce={16} steps={[{ from: 0, move: STEP }, { from: t.WORDS.cards[0]! - 0.1, move: POINT }, { from: t.WORDS.gloss[0]!, move: HANDS_UP }, { from: t.WORDS.cards[1]! - 0.1, move: POINT }, { from: t.WORDS.gloss[1]!, move: ROOF }, { from: t.WORDS.cards[2]! - 0.1, move: POINT }, { from: t.WORDS.gloss[2]!, move: HANDS_UP }]} />
    </Shell>
  );
}
