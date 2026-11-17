import type { ReactNode } from "react";

import { Note } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { color } from "../theme";
import { AgentPanel, Answer, Btn, Caret, Comment, Cursor, Icon, Pill, SOFT, Said, Shell, Ticket, Window, Working, fade, land, settle, typedOver, useShot } from "./parts";

// The middle of the film: you don't click around GitHub, you tell your coding agent. What you say is
// typed as the voice says it; what the agent hands back is the issue or the pull request on GitHub.

const border = `3px solid ${color.ink}`;
const thin = `2px solid ${color.line}`;
const muted = { color: color.lineStrong } as const;

// --- 6 · a coding agent: talk to it; the first time, connect it to your account ---------------------

export function Shot6Agent() {
  const { f, at, t, c, lang } = useShot("agent");
  const a = c.agent;
  const panel = at(t.AGENT.panel);
  const names = t.AGENT.names.map(at);
  const swap = at(t.AGENT.swap);
  const talk = at(t.AGENT.talk);
  const connect = at(t.AGENT.connect);
  const click = at(t.AGENT.connectClick);
  const choice = (on: boolean, from: number, icon: ReactNode, label: string, left: number) =>
    f < from ? null : (
      <div style={{ position: "absolute", left, top: 930, width: 460, height: 236, background: on ? SOFT : color.paper, border: `3px ${on ? "solid" : "dashed"} ${on ? color.accent : color.lineStrong}`, color: on ? color.ink : color.muted, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, fontSize: lang === "en" ? 38 : 42, fontWeight: 800, ...settle(fade(f, from, 6), 20) }}>
        {icon}
        <span style={{ textDecoration: on ? undefined : "line-through" }}>{label}</span>
      </div>
    );
  return (
    <Shell shot="agent" title={a.title}>
      {f >= panel ? (
        <AgentPanel repo={f >= click + 4} style={{ top: 330, height: 560, ...settle(fade(f, panel, 7), 24) }} input={<span style={muted}>{a.placeholder}</span>}>
          {f < connect
            ? c.agents.map((name, i) => (
                <Note key={name} style={{ position: "absolute", left: [48, 430][i], top: [56, 150][i], fontSize: 52, padding: "18px 32px", opacity: fade(f, names[i]!, 3), transform: `translateY(${(1 - land(f, names[i]!)) * -40}px) rotate(${[-3, 2][i]}deg)` }}>
                  {name}
                </Note>
              ))
            : null}
          <Answer f={f} at={connect} top={36}>
            <div style={{ height: 92 }}>{a.connectAsk}</div>
            {f < click + 4 ? (
              <Btn primary hot={f >= click - 14}>
                {a.connect}
              </Btn>
            ) : (
              <Btn style={{ background: color.ink, color: color.paper }}>
                <Icon name="check" size={30} stroke={3} />
                {a.connected}
              </Btn>
            )}
          </Answer>
        </AgentPanel>
      ) : null}
      {choice(false, swap, <Icon name="pointer" size={84} stroke={1.8} />, a.old, 64)}
      {choice(true, talk, <Icon name="chat" size={84} stroke={1.8} style={{ color: color.accent }} />, a.now, 556)}
      <Cursor f={f} path={[[click - 26, 640, 800], [click - 5, 330, 558]]} clicks={[click]} />
    </Shell>
  );
}

// --- 7 · an issue: say what you want and why; the agent opens it; the talk stays under it ------------

export function Shot7Issue() {
  const { f, at, t, c, lang, now } = useShot("issue");
  const i = c.issue;
  const windows = t.ISSUE.typing;
  const send = at(t.ISSUE.send);
  const reply = at(t.ISSUE.reply);
  const tags = at(t.ISSUE.tags);
  const page = at(t.ISSUE.page);
  const closeAt = at(t.ISSUE.close);
  const closed = f >= closeAt;
  const typing = i.message.map((part, k) => typedOver(part, now, windows[k]!)).join("");
  const tagTop = lang === "en" ? 216 : 172;
  return (
    <Shell shot="issue" title={i.title}>
      {f < page ? (
        <AgentPanel
          style={{ top: 330, height: 870 }}
          input={
            f < send ? (
              <>
                {typing || <span style={muted}>{c.agent.placeholder}</span>}
                <Caret f={f} on={now >= windows[0]![0] - 0.3} />
              </>
            ) : (
              <span style={muted}>{c.agent.placeholder}</span>
            )
          }
        >
          <Said f={f} at={send} top={30}>
            {i.message.map((part, k) => (
              <span key={part} style={{ borderBottom: f >= tags + k * 6 ? `5px solid ${color.signal}` : undefined }}>
                {part}
              </span>
            ))}
          </Said>
          {i.tags.map((tag, k) =>
            f < tags + k * 6 ? null : (
              <div key={tag} style={{ position: "absolute", right: [250, 24][k], top: tagTop, padding: "4px 14px", fontSize: 26, fontWeight: 800, whiteSpace: "nowrap", color: color.accent, border: `3px solid ${color.accent}`, ...settle(fade(f, tags + k * 6, 5), 10) }}>
                {k + 1} · {tag}
              </div>
            ),
          )}
          <Working f={f} from={send + 8} to={reply} top={tagTop + 76} />
          <Answer f={f} at={reply} top={tagTop + 76}>
            {i.reply}
            <Ticket icon="issue" number={c.issueNo} name={i.name} state={<Pill icon="issue" small>{c.open}</Pill>} />
          </Answer>
        </AgentPanel>
      ) : (
        <Window tab={1} style={{ top: 330, height: 720, ...settle(fade(f, page, 7), 24) }}>
          <div style={{ position: "absolute", left: 28, top: 26, fontSize: 40, fontWeight: 800, whiteSpace: "nowrap" }}>
            {i.name}
            <span style={{ fontFamily: monoFamily, fontWeight: 500, color: color.muted }}> {c.issueNo}</span>
          </div>
          <div style={{ position: "absolute", left: 28, top: 100, transform: closed ? `scale(${0.85 + 0.15 * land(f, closeAt, 9)})` : undefined, transformOrigin: "0 50%" }}>
            {closed ? (
              <Pill icon="done" solid>
                {c.closed}
              </Pill>
            ) : (
              <Pill icon="issue">{c.open}</Pill>
            )}
          </div>
          <div style={{ position: "absolute", left: 28, top: 186, width: 890, borderTop: thin }} />
          {i.comments.map((m, k) => (
            <Comment key={m.text} f={f} at={at(t.ISSUE.comments[k]!)} who={m.who} text={m.text} top={218 + k * 112} />
          ))}
        </Window>
      )}
    </Shell>
  );
}

// --- 8 · a change: the same one line, two files attached; a pull request someone looks at ------------

export function Shot8Pr() {
  const { f, at, t, c, now, lang } = useShot("pr");
  const answerTop = lang === "en" ? 304 : 270; // under what you said: three lines in English, two in Chinese
  const p = c.pr;
  const windows = t.PR.typing;
  const files = t.PR.files.map(at);
  const send = at(t.PR.send);
  const reply = at(t.PR.reply);
  const page = at(t.PR.page);
  const review = at(t.PR.review);
  const merge = at(t.PR.merge);
  const merged = f >= merge;
  const typing = p.message.map((part, k) => typedOver(part, now, windows[k]!)).join("");
  const chips = (dark: boolean) => (
    <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
      {p.files.map((name, k) =>
        f < files[k]! ? null : (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px 8px 12px", border: `3px solid ${dark ? color.paper : color.ink}`, fontFamily: monoFamily, fontSize: 25, fontWeight: 600, whiteSpace: "nowrap", ...settle(fade(f, files[k]!, 5), -18) }}>
            <Icon name="file" size={30} />
            {name}
          </div>
        ),
      )}
    </div>
  );
  return (
    <Shell shot="pr" title={p.title}>
      {f < page ? (
        <AgentPanel
          style={{ top: 330, height: 870 }}
          input={
            f < send ? (
              <>
                {f >= files[0]! ? chips(false) : null}
                {typing || <span style={muted}>{c.agent.placeholder}</span>}
                <Caret f={f} on={now >= windows[0]![0] - 0.3} />
              </>
            ) : (
              <span style={muted}>{c.agent.placeholder}</span>
            )
          }
        >
          <Said f={f} at={send} top={30}>
            {chips(true)}
            {p.message.join("")}
          </Said>
          <Working f={f} from={send + 8} to={reply} top={answerTop} />
          <Answer f={f} at={reply} top={answerTop}>
            {p.reply}
            <Ticket icon="pr" number={c.prNo} name={p.name} state={<Pill icon="pr" small>{c.open}</Pill>} extra={p.count} />
          </Answer>
        </AgentPanel>
      ) : (
        <Window tab={2} style={{ top: 330, height: 810, ...settle(fade(f, page, 7), 24) }}>
          <div style={{ position: "absolute", left: 28, top: 26, fontSize: 40, fontWeight: 800, whiteSpace: "nowrap" }}>
            {p.name}
            <span style={{ fontFamily: monoFamily, fontWeight: 500, color: color.muted }}> {c.prNo}</span>
          </div>
          <div style={{ position: "absolute", left: 28, top: 100, transform: merged ? `scale(${0.85 + 0.15 * land(f, merge, 9)})` : undefined, transformOrigin: "0 50%" }}>
            {merged ? (
              <Pill icon="merge" solid>
                {c.merged}
              </Pill>
            ) : (
              <Pill icon="pr">{c.open}</Pill>
            )}
          </div>
          <div style={{ position: "absolute", left: 28, top: 190, width: 890, border, fontFamily: monoFamily, fontSize: 28, fontWeight: 500 }}>
            <div style={{ height: 62, borderBottom: border, display: "flex", alignItems: "center", padding: "0 22px", fontWeight: 600 }}>{c.filesChanged}</div>
            {p.changed.map((path, k) => (
              <div key={path} style={{ height: 62, display: "flex", alignItems: "center", padding: "0 22px", background: k ? SOFT : undefined }}>
                {k ? "+" : "~"} {path}
              </div>
            ))}
          </div>
          <Comment f={f} at={review} who={p.review.who} text={p.review.text} top={470} tick />
          {merged ? (
            <div style={{ position: "absolute", left: 28, top: 590, display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 800, ...settle(fade(f, merge + 4, 6), 14) }}>
              <Icon name="merge" size={50} style={{ color: color.accent }} />
              {p.into}
            </div>
          ) : null}
        </Window>
      )}
    </Shell>
  );
}
