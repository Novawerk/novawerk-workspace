import type { CSSProperties, ReactNode } from "react";

import { Lockup, Rich } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { color } from "../theme";
import { Avatar, Btn, Caret, Cursor, Icon, Shell, Window, drop, fade, land, pop, settle, typed, useShot } from "./parts";

// The first five shots: the mess, the welcome, what GitHub is, three words, getting in.

const border = `3px solid ${color.ink}`;

function Tag({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "inline-block", padding: "4px 14px", fontSize: 26, fontWeight: 800, whiteSpace: "nowrap", color: color.accent, border: `3px solid ${color.accent}`, background: color.paper, ...style }}>{children}</div>;
}

// --- 1 · the hook: asks in chat, files in mail, three "final" versions ----------------------------

const SPOTS = [
  { x: 60, y: 112, r: -4 }, { x: 330, y: 256, r: 3 }, { x: 90, y: 400, r: -2 }, // chats
  { x: 420, y: 545, r: 4 }, { x: 110, y: 668, r: -3 }, // mails
  { x: 150, y: 795, r: -2 }, { x: 235, y: 878, r: 1.5 }, { x: 320, y: 961, r: -1 }, // files
];

export function Shot1Hook() {
  const { f, at, t, c, lang } = useShot("hook");
  const pile = [
    ...c.hook.chats.map((text, i) => ({ text, icon: "chat" as const, at: t.HOOK.chats[i]!, size: lang === "en" ? 40 : 44, mono: false })),
    ...c.hook.mails.map((text, i) => ({ text, icon: "mail" as const, at: t.HOOK.mails[i]!, size: 40, mono: false })),
    ...c.hook.files.map((text, i) => ({ text, icon: "file" as const, at: t.HOOK.files[i]!, size: 34, mono: true })),
  ];
  const ask = at(t.HOOK.ask);
  return (
    <Shell shot="hook">
      {pile.map((n, i) => {
        const a = at(n.at);
        const d = land(f, a);
        const spot = SPOTS[i]!;
        return (
          <div key={n.text} style={{ position: "absolute", left: spot.x, top: spot.y, display: "flex", alignItems: "center", gap: 16, padding: "22px 30px", background: color.paper, border, fontSize: n.size, fontWeight: 800, fontFamily: n.mono ? monoFamily : undefined, whiteSpace: "nowrap", opacity: fade(f, a, 3), transform: `translateY(${(1 - d) * -50}px) rotate(${spot.r + (1 - d) * 8}deg)` }}>
            <Icon name={n.icon} size={n.size + 4} />
            {n.text}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 64, top: 1082, padding: "22px 36px", background: color.ink, color: color.paper, fontSize: lang === "en" ? 64 : 80, fontWeight: 900, letterSpacing: -2, whiteSpace: "nowrap", opacity: fade(f, ask, 3), transform: `rotate(-1.5deg) scale(${0.9 + 0.1 * land(f, ask, 9)})`, transformOrigin: "0 50%" }}>
        <Rich text={c.hook.caption} accent={color.signal} />
      </div>
    </Shell>
  );
}

// --- 2 · the welcome: the series, and today's subject -----------------------------------------------

export function Shot2Welcome() {
  const { f, at, t, c } = useShot("welcome");
  const number = at(t.WELCOME.number);
  const line = fade(f, at(t.when("welcome", 1, 0)), 8);
  const today = at(t.WELCOME.today);
  return (
    <Shell shot="welcome">
      <div style={{ position: "absolute", left: 0, right: 0, top: 330, display: "flex", justifyContent: "center", ...settle(fade(f, 4, 8), 20) }}>
        <Lockup height={96} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 440, textAlign: "center", fontSize: 300, fontWeight: 800, letterSpacing: -12, lineHeight: 1.1, color: color.accent, ...pop(f, number) }}>{c.number}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 810, textAlign: "center", fontSize: 46, fontWeight: 700, color: color.muted, ...settle(line, 14) }}>{c.welcome.line}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 930, display: "flex", justifyContent: "center" }}>
        <div style={{ padding: "22px 44px", background: color.ink, color: color.paper, fontSize: 84, fontWeight: 900, letterSpacing: -2, whiteSpace: "nowrap", opacity: fade(f, today, 3), transform: `rotate(-1.5deg) scale(${0.9 + 0.1 * land(f, today, 9)})` }}>
          <Rich text={c.welcome.today} accent={color.signal} />
        </div>
      </div>
    </Shell>
  );
}

// --- 3 · what it is: a website; a shared folder, a board, a history --------------------------------

export function Shot3What() {
  const { f, at, t, c } = useShot("what");
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
    <Shell shot="what" title={c.what.title} titleAt={4}>
      {f >= landAt ? (
        <div style={{ position: "absolute", left: mix(240, 64), top: mix(600, 338) + (1 - drop) * -140, width: mix(600, 232), height: mix(230, 66), background: color.ink, color: color.paper, display: "flex", alignItems: "center", justifyContent: "center", fontSize: mix(130, 40), fontWeight: 800, letterSpacing: mix(-4, -1), opacity: fade(f, landAt, 3) }}>
          {c.github}
        </div>
      ) : null}
      {f >= win + 12 ? <Tag style={{ position: "absolute", left: 316, top: 349, fontSize: 30, ...settle(fade(f, win + 12, 6), 10) }}>{c.what.noInstall}</Tag> : null}

      {f >= win + 2 ? (
        <Window style={{ top: 420, height: 790, ...settle(fade(f, win + 2, 7), 24) }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 946, height: 724 }}>
            {/* the shared folder */}
            {f >= filesAt - 2 ? (
              <div style={{ position: "absolute", left: 0, top: 0, width: 380, height: 478, borderRight: border }}>
                <Tag style={{ position: "absolute", left: 28, top: 24 }}>{c.what.tags[0]}</Tag>
                {c.what.files.map((name, i) => (
                  <div key={name} style={{ position: "absolute", left: 28, top: 98 + i * 88, display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700, opacity: fade(f, filesAt + 3 + i * 4, 4) }}>
                    <Icon name={i < 2 ? "folder" : "file"} size={46} />
                    {name}
                  </div>
                ))}
              </div>
            ) : null}

            {/* the board */}
            {f >= boardAt - 2 ? (
              <div style={{ position: "absolute", left: 383, top: 0, width: 563, height: 478 }}>
                <Tag style={{ position: "absolute", left: 28, top: 24 }}>{c.what.tags[1]}</Tag>
                {c.what.board.map((m, i) => (
                  <div key={m.text} style={{ position: "absolute", left: 28, right: 28, top: 104 + i * 128, display: "flex", flexDirection: i === 0 ? "row" : "row-reverse", alignItems: "center", gap: 14, opacity: fade(f, boardAt + 3 + i * 12, 4) }}>
                    <Avatar who={m.who} />
                    <div style={{ padding: "16px 20px", border, fontSize: 29, fontWeight: 700, whiteSpace: "nowrap" }}>{m.text}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* the history */}
            {f >= historyAt - 2 ? (
              <div style={{ position: "absolute", left: 0, top: 478, width: 946, height: 246, borderTop: border }}>
                <Tag style={{ position: "absolute", left: 28, top: 22 }}>{c.what.tags[2]}</Tag>
                <div style={{ position: "absolute", left: 49, top: 110, width: 3, height: 78, background: color.ink }} />
                {c.what.history.map((h, i) => (
                  <div key={h.text} style={{ position: "absolute", left: 40, right: 32, top: 90 + i * 72, display: "flex", alignItems: "center", gap: 18, fontSize: 31, fontWeight: 700, opacity: fade(f, historyAt + 3 + i * 9, 4) }}>
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
    </Shell>
  );
}

// --- 4 · three words -----------------------------------------------------------------------------

const WORD_ICONS = ["folder", "issue", "pr"] as const;

export function Shot4Words() {
  const { f, at, t, c, lang } = useShot("words");
  return (
    <Shell shot="words" title={c.words.title}>
      {c.words.cards.map((card, i) => {
        const a = at(t.WORDS.cards[i]!);
        const next = i < 2 ? at(t.WORDS.cards[i + 1]!) : 1e9;
        const on = f >= a;
        const active = on && f < next;
        const g = fade(f, at(t.WORDS.gloss[i]!), 7);
        const top = 296 + i * 292;
        return (
          <div key={card.term}>
            {on ? null : (
              <div style={{ position: "absolute", left: 64, top, width: 952, height: 262, border: `3px dashed ${color.lineStrong}` }}>
                <span style={{ position: "absolute", left: 36, top: 30, fontFamily: monoFamily, fontSize: 40, fontWeight: 600, color: color.lineStrong }}>{i + 1}</span>
              </div>
            )}
            {on ? (
              <div style={{ position: "absolute", left: 64, top, width: 952, height: 262, background: color.paper, border: `3px solid ${active ? color.accent : color.ink}`, boxShadow: active ? `0 0 0 3px ${color.accent}` : undefined, ...drop(f, a, 40, i % 2 ? 2 : -2) }}>
                <div style={{ position: "absolute", left: 34, top: 52, width: 152, height: 152, background: active ? color.accent : color.ink, color: color.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={WORD_ICONS[i]!} size={96} stroke={2} />
                </div>
                <div style={{ position: "absolute", left: 220, top: 40, display: "flex", alignItems: "baseline", gap: 22, whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2 }}>{card.term}</span>
                  {card.aka ? <span style={{ fontSize: 44, fontWeight: 800, color: color.muted, opacity: fade(f, a + 14, 6) }}>{card.aka}</span> : null}
                </div>
                <div style={{ position: "absolute", left: 222, top: 148, fontSize: lang === "en" ? 44 : 46, fontWeight: 800, whiteSpace: "nowrap", ...settle(g, 12) }}>
                  <Rich text={card.gloss} accent={color.accent} />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </Shell>
  );
}

// --- 5 · getting in: an account, your username, the invitation -------------------------------------

export function Shot5Start() {
  const { f, at, t, c, lang } = useShot("start");
  const steps = t.START.steps.map(at);
  const accept = at(t.START.accept);
  const typing = steps[0]! + 12;
  const name = typed(c.handle, f, typing, 16);
  const pictures = [
    <div key={0} style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 330, height: 66, border, display: "flex", alignItems: "center", padding: "0 18px", fontFamily: monoFamily, fontSize: 30, fontWeight: 600, color: name ? color.ink : color.lineStrong }}>
        {name || c.username}
        <Caret f={f} on={f >= typing && name.length < c.handle.length} />
      </div>
      <Btn primary>{c.signUp}</Btn>
      <Tag>{c.start.free}</Tag>
    </div>,
    <div key={1} style={{ display: "flex", alignItems: "center", gap: 14, opacity: fade(f, steps[1]! + 6, 5) }}>
      <Avatar who={c.me} />
      <div style={{ padding: "14px 22px", border, fontSize: 32, fontWeight: 700, whiteSpace: "nowrap" }}>{c.start.tell}</div>
    </div>,
    <div key={2} style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <Icon name="mail" size={84} stroke={1.8} />
      <div>
        <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 10, whiteSpace: "nowrap" }}>{c.start.invite}</div>
        {f < accept + 4 ? (
          <Btn primary hot={f >= accept - 12} style={{ padding: "9px 20px" }}>
            {c.accept}
          </Btn>
        ) : (
          <Btn style={{ padding: "9px 20px", background: color.ink, color: color.paper }}>
            <Icon name="check" size={30} stroke={3} />
            {c.start.joined}
          </Btn>
        )}
      </div>
    </div>,
  ];
  return (
    <Shell shot="start" title={c.start.title}>
      {c.start.steps.map((label, i) => {
        const top = 296 + i * 292;
        return (
          <div key={label} style={{ position: "absolute", left: 64, top, width: 952, height: 262, background: color.paper, border, ...drop(f, steps[i]!) }}>
            <span style={{ position: "absolute", left: 38, top: 62, fontFamily: monoFamily, fontSize: 124, fontWeight: 600, lineHeight: 1, color: color.accent }}>{i + 1}</span>
            <div style={{ position: "absolute", left: 160, top: 30, fontSize: lang === "en" ? 42 : 46, fontWeight: 800, whiteSpace: "nowrap" }}>{label}</div>
            <div style={{ position: "absolute", left: 160, top: 116, height: 116, display: "flex", alignItems: "center" }}>{pictures[i]}</div>
          </div>
        );
      })}
      <Cursor f={f} path={[[accept - 24, 760, 1230], [accept - 5, 588, 1094]]} clicks={[accept]} />
    </Shell>
  );
}
