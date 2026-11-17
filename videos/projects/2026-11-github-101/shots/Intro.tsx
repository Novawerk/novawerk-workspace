import type { CSSProperties, ReactNode } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

import { Rich } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { copy } from "../copy";
import { HOOK, START, WHAT, WORDS, color, when } from "../theme";
import { Avatar, Btn, Caret, Cursor, Icon, Shell, Window, fade, frameIn, framesOf, land, typed } from "./parts";

// The first four shots: the mess, what GitHub is, three words, getting in.

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const border = `3px solid ${color.ink}`;

function Tag({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "inline-block", padding: "4px 14px", fontSize: 26, fontWeight: 800, color: color.accent, border: `3px solid ${color.accent}`, background: color.paper, ...style }}>{children}</div>;
}

// --- 1 · the hook: asks in chat, files in mail, three "final" versions ----------------------------

const F1 = frameIn("hook");
export const HOOK_FRAMES = framesOf("hook");

const PILE = [
  ...copy.hook.chats.map((text, i) => ({ text, icon: "chat" as const, at: HOOK.chats[i]!, size: 44, mono: false, ...[{ x: 60, y: 112, r: -4 }, { x: 330, y: 256, r: 3 }, { x: 90, y: 400, r: -2 }][i]! })),
  ...copy.hook.mails.map((text, i) => ({ text, icon: "mail" as const, at: HOOK.mails[i]!, size: 40, mono: false, ...[{ x: 420, y: 545, r: 4 }, { x: 110, y: 668, r: -3 }][i]! })),
  ...copy.hook.files.map((text, i) => ({ text, icon: "file" as const, at: HOOK.files[i]!, size: 34, mono: true, ...[{ x: 150, y: 795, r: -2 }, { x: 235, y: 878, r: 1.5 }, { x: 320, y: 961, r: -1 }][i]! })),
];

export function Shot1Hook() {
  const f = useCurrentFrame();
  const ask = F1(HOOK.ask);
  const p = land(f, ask, 9);
  return (
    <Shell shot="hook">
      {PILE.map((n) => {
        const at = F1(n.at);
        const d = land(f, at);
        return (
          <div
            key={n.text}
            style={{ position: "absolute", left: n.x, top: n.y, display: "flex", alignItems: "center", gap: 16, padding: "22px 30px", background: color.paper, border, fontSize: n.size, fontWeight: 800, fontFamily: n.mono ? monoFamily : undefined, whiteSpace: "nowrap", opacity: fade(f, at, 3), transform: `translateY(${(1 - d) * -50}px) rotate(${n.r + (1 - d) * 8}deg)` }}
          >
            <Icon name={n.icon} size={n.size + 4} />
            {n.text}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 64, top: 1082, padding: "22px 36px", background: color.ink, color: color.paper, fontSize: 80, fontWeight: 900, letterSpacing: -2, whiteSpace: "nowrap", opacity: fade(f, ask, 3), transform: `rotate(-1.5deg) scale(${0.9 + 0.1 * p})`, transformOrigin: "0 50%" }}>
        <Rich text={copy.hook.caption} accent={color.signal} />
      </div>
    </Shell>
  );
}

// --- 2 · what it is: one place; a website; a shared folder, a board, a history ---------------------

const F2 = frameIn("what");
export const WHAT_FRAMES = framesOf("what");

const SCATTER = [[130, 420], [620, 400], [380, 560], [120, 760], [680, 700], [300, 930], [640, 960], [430, 1090]] as const;

export function Shot2What() {
  const f = useCurrentFrame();
  const c = copy.what;
  const gather = F2(WHAT.gather);
  const landAt = F2(WHAT.land);
  const win = F2(WHAT.window);
  const filesAt = F2(WHAT.files);
  const boardAt = F2(WHAT.board);
  const historyAt = F2(WHAT.history);
  const noInstall = F2(when("what2", 0, 1));

  // the pile from the hook, pulled into one point just before the box lands
  const pull = interpolate(f, [gather + 30, landAt - 2], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  // the box, then the chip it becomes above the window
  const drop = land(f, landAt, 9);
  const chip = interpolate(f, [win, win + 10], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  const mix = (a: number, b: number) => a + (b - a) * chip;

  return (
    <Shell shot="what" title={c.title} titleAt={F2(when("what1", 1, 0)) - 4}>
      {pull < 1
        ? SCATTER.map(([x, y], i) => (
            <div key={i} style={{ position: "absolute", left: x + (410 - x) * pull, top: y + (670 - y) * pull, width: 260, height: 104, background: color.paper, border, padding: "24px 26px", opacity: 1 - pull * pull, transform: `rotate(${(i % 2 ? 3 : -3) * (1 - pull)}deg) scale(${1 - 0.6 * pull})` }}>
              <div style={{ height: 12, width: 150 + (i % 3) * 20, background: color.lineStrong }} />
              <div style={{ height: 12, width: 90 + (i % 2) * 40, background: color.line, marginTop: 16 }} />
            </div>
          ))
        : null}

      {f >= landAt ? (
        <div style={{ position: "absolute", left: mix(240, 64), top: mix(600, 338) + (1 - drop) * -140, width: mix(600, 232), height: mix(230, 66), background: color.ink, color: color.paper, display: "flex", alignItems: "center", justifyContent: "center", fontSize: mix(130, 40), fontWeight: 800, letterSpacing: mix(-4, -1), opacity: fade(f, landAt, 3) }}>
          {c.name}
        </div>
      ) : null}

      {f >= win + 2 ? (
        <Window style={{ top: 420, height: 790, opacity: fade(f, win + 2, 7), transform: `translateY(${(1 - fade(f, win + 2, 7)) * 24}px)` }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 946, height: 724 }}>
            {/* before anything is in it: it is just a page in the browser */}
            <div style={{ position: "absolute", left: 0, right: 0, top: 290, textAlign: "center", fontSize: 60, fontWeight: 900, color: color.accent, opacity: Math.min(fade(f, noInstall, 6), 1 - fade(f, filesAt - 8, 6)) }}>{c.noInstall}</div>

            {/* the shared folder */}
            <div style={{ position: "absolute", left: 0, top: 0, width: 380, height: 478, borderRight: border, opacity: fade(f, filesAt - 2, 5) }}>
              <Tag style={{ position: "absolute", left: 28, top: 24 }}>{c.tags[0]}</Tag>
              {c.files.map((name, i) => {
                const d = land(f, filesAt + 3 + i * 4);
                return (
                  <div key={name} style={{ position: "absolute", left: 28, top: 98 + i * 88, display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700, opacity: fade(f, filesAt + 3 + i * 4, 3), transform: `translateX(${(1 - d) * -24}px)` }}>
                    <Icon name={i < 2 ? "folder" : "file"} size={46} />
                    {name}
                  </div>
                );
              })}
            </div>

            {/* the board */}
            <div style={{ position: "absolute", left: 383, top: 0, width: 563, height: 478, opacity: fade(f, boardAt - 2, 5) }}>
              <Tag style={{ position: "absolute", left: 28, top: 24 }}>{c.tags[1]}</Tag>
              {c.board.map((m, i) => {
                const at = boardAt + 3 + i * 12;
                const d = land(f, at);
                const mine = i === 0;
                return (
                  <div key={m.text} style={{ position: "absolute", left: 28, right: 28, top: 104 + i * 128, display: "flex", flexDirection: mine ? "row" : "row-reverse", alignItems: "center", gap: 14, opacity: fade(f, at, 3), transform: `translateY(${(1 - d) * 20}px)` }}>
                    <Avatar who={m.who} />
                    <div style={{ padding: "16px 22px", border, fontSize: 31, fontWeight: 700, whiteSpace: "nowrap" }}>{m.text}</div>
                  </div>
                );
              })}
            </div>

            {/* the history */}
            <div style={{ position: "absolute", left: 0, top: 478, width: 946, height: 246, borderTop: border, opacity: fade(f, historyAt - 2, 5) }}>
              <Tag style={{ position: "absolute", left: 28, top: 22 }}>{c.tags[2]}</Tag>
              <div style={{ position: "absolute", left: 49, top: 110, width: 3, height: 78, background: color.ink }} />
              {c.history.map((h, i) => {
                const at = historyAt + 3 + i * 9;
                return (
                  <div key={h.text} style={{ position: "absolute", left: 40, right: 32, top: 90 + i * 72, display: "flex", alignItems: "center", gap: 18, fontSize: 31, fontWeight: 700, opacity: fade(f, at, 4) }}>
                    <div style={{ width: 21, height: 21, borderRadius: 11, background: color.accent, border }} />
                    <Avatar who={h.who} size={46} />
                    {h.text}
                    <span style={{ marginLeft: "auto", fontFamily: monoFamily, fontSize: 26, fontWeight: 600, color: color.muted }}>{h.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Window>
      ) : null}
    </Shell>
  );
}

// --- 3 · three words -----------------------------------------------------------------------------

const F3 = frameIn("words");
export const WORDS_FRAMES = framesOf("words");
const WORD_ICONS = ["folder", "issue", "pr"] as const;

export function Shot3Words() {
  const f = useCurrentFrame();
  return (
    <Shell shot="words" title={copy.words.title}>
      {copy.words.cards.map((card, i) => {
        const at = F3(WORDS.cards[i]!);
        const next = i < 2 ? F3(WORDS.cards[i + 1]!) : 1e9;
        const on = f >= at;
        const active = on && f < next;
        const d = land(f, at, 9);
        const g = fade(f, F3(WORDS.gloss[i]!), 7);
        const top = 296 + i * 292;
        return (
          <div key={card.term}>
            <div style={{ position: "absolute", left: 64, top, width: 952, height: 262, border: `3px dashed ${color.lineStrong}`, opacity: on ? 0 : 1 }}>
              <span style={{ position: "absolute", left: 36, top: 30, fontFamily: monoFamily, fontSize: 40, fontWeight: 600, color: color.lineStrong }}>{i + 1}</span>
            </div>
            {on ? (
              <div style={{ position: "absolute", left: 64, top, width: 952, height: 262, background: color.paper, border: `3px solid ${active ? color.accent : color.ink}`, boxShadow: active ? `0 0 0 3px ${color.accent}` : undefined, opacity: fade(f, at, 3), transform: `translateY(${(1 - d) * -40}px) rotate(${(1 - d) * (i % 2 ? 2 : -2)}deg)` }}>
                <div style={{ position: "absolute", left: 34, top: 52, width: 152, height: 152, background: active ? color.accent : color.ink, color: color.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={WORD_ICONS[i]!} size={96} stroke={2} />
                </div>
                <div style={{ position: "absolute", left: 220, top: 40, display: "flex", alignItems: "baseline", gap: 22, whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2 }}>{card.term}</span>
                  {card.zh ? <span style={{ fontSize: 44, fontWeight: 800, color: color.muted, opacity: fade(f, at + 14, 6) }}>{card.zh}</span> : null}
                </div>
                <div style={{ position: "absolute", left: 222, top: 148, fontSize: 46, fontWeight: 800, whiteSpace: "nowrap", opacity: g, transform: `translateY(${(1 - g) * 12}px)` }}>
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

// --- 4 · getting in: an account, your username, the invitation -------------------------------------

const F4 = frameIn("start");
export const START_FRAMES = framesOf("start");

export function Shot4Start() {
  const f = useCurrentFrame();
  const c = copy.start;
  const at = START.steps.map(F4);
  const accept = F4(START.accept);
  const typing = at[0]! + 12;
  const name = typed(c.handle, f, typing, 16);
  const pictures = [
    <div key={0} style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 330, height: 66, border, display: "flex", alignItems: "center", padding: "0 18px", fontFamily: monoFamily, fontSize: 30, fontWeight: 600, color: name ? color.ink : color.lineStrong }}>
        {name || c.username}
        <Caret f={f} on={f >= typing && name.length < c.handle.length} />
      </div>
      <Btn primary>{c.signUp}</Btn>
      <Tag>{c.free}</Tag>
    </div>,
    <div key={1} style={{ display: "flex", alignItems: "center", gap: 14, opacity: fade(f, at[1]! + 6, 5) }}>
      <Avatar who={copy.me} />
      <div style={{ padding: "14px 22px", border, fontSize: 32, fontWeight: 700, whiteSpace: "nowrap" }}>{c.tell}</div>
    </div>,
    <div key={2} style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <Icon name="mail" size={84} stroke={1.8} />
      <div>
        <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 10, whiteSpace: "nowrap" }}>{c.invite}</div>
        {f < accept + 4 ? (
          <Btn primary hot={f >= accept - 12} style={{ padding: "9px 20px" }}>
            {c.accept}
          </Btn>
        ) : (
          <Btn style={{ padding: "9px 20px", background: color.ink, color: color.paper }}>
            <Icon name="check" size={30} stroke={3} />
            {c.joined}
          </Btn>
        )}
      </div>
    </div>,
  ];
  return (
    <Shell shot="start" title={c.title}>
      {c.steps.map((label, i) => {
        const d = land(f, at[i]!, 9);
        const top = 296 + i * 292;
        return (
          <div key={label} style={{ position: "absolute", left: 64, top, width: 952, height: 262, background: color.paper, border, opacity: fade(f, at[i]!, 3), transform: `translateY(${(1 - d) * -40}px)` }}>
            <span style={{ position: "absolute", left: 38, top: 62, fontFamily: monoFamily, fontSize: 124, fontWeight: 600, lineHeight: 1, color: color.accent }}>{i + 1}</span>
            <div style={{ position: "absolute", left: 160, top: 30, fontSize: 46, fontWeight: 800, whiteSpace: "nowrap" }}>{label}</div>
            <div style={{ position: "absolute", left: 160, top: 116, height: 116, display: "flex", alignItems: "center" }}>{pictures[i]}</div>
          </div>
        );
      })}
      <Cursor f={f} path={[[accept - 24, 760, 1230], [accept - 5, 588, 1094]]} clicks={[accept]} />
    </Shell>
  );
}
