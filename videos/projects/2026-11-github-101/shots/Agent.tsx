import { color } from "../theme";
import { CHEER, DISMISS, GROOVE, TALK } from "./moves";
import { Bot, Comment, Icon, Pill, Shell, Beaver, Ticket, drop, land, pop, typedOver, useShot } from "./parts";

// The verse about the agent: you don't click around GitHub, you tell your coding agent, here a
// robot. One line and it holds up an issue, one more and it holds up a pull request; someone looks
// at it, then it is merged. The robot holds the card up from behind: the card is drawn over its
// hands and antenna.

export function Shot5Agent() {
  const { f, at, t, c, now, lang } = useShot("agent");
  const A = t.AGENT;
  const old = at(A.old);
  const issue = at(A.issue);
  const pr = at(A.pr);
  const page = at(A.page);
  const merge = at(A.merge);
  const merged = f >= merge;
  const second = now >= A.type2[0] - 0.05;
  const said = second ? typedOver(c.pr.message, now, A.type2) : typedOver(c.issue.message, now, A.type1);
  const typing = second ? now < A.send2 : now < A.send1;
  return (
    <Shell shot="agent">
      {/* the old way, crossed out, until you start talking */}
      {f >= old && now < A.type1[0] ? (
        <div style={{ position: "absolute", left: 64, top: 560, display: "flex", alignItems: "center", gap: 20, padding: "24px 36px", border: `3px dashed ${color.lineStrong}`, color: color.muted, fontSize: 54, fontWeight: 800, whiteSpace: "nowrap", ...drop(f, old, 40, -2) }}>
          <Icon name="pointer" size={58} stroke={1.8} />
          <span style={{ textDecoration: "line-through" }}>{c.agent.old}</span>
        </div>
      ) : null}
      {/* what you say: typed while the line about it is sung */}
      {now >= A.type1[0] && f < page ? (
        <div style={{ position: "absolute", left: 64, top: 560 }}>
          <div style={{ padding: "26px 30px", background: color.ink, color: color.paper, fontSize: lang === "en" ? 38 : 44, fontWeight: 700, whiteSpace: "nowrap", minWidth: 300, minHeight: 52 }}>
            {said}
            {typing && f % 16 < 10 ? <span style={{ display: "inline-block", width: 4, height: "1em", background: color.signal, verticalAlign: "-0.12em", marginLeft: 3 }} /> : null}
          </div>
          <div style={{ marginLeft: 220, width: 0, height: 0, borderLeft: "18px solid transparent", borderRight: "18px solid transparent", borderTop: `24px solid ${color.ink}` }} />
        </div>
      ) : null}
      {/* someone looks at the pull request */}
      <div style={{ position: "absolute", left: 36, top: 0 }}>
        <Comment f={f} at={at(A.review)} who={c.pr.review.who} text={c.pr.review.text} top={580} tick />
      </div>
      <Bot shot="agent" x={756} height={380} up={A.issue - 0.1} />
      {/* what the agent hands back, held over its head */}
      {f >= issue && f < pr ? (
        <Ticket icon="issue" number={c.issueNo} name={c.issue.name} state={<Pill icon="issue">{c.open}</Pill>} style={{ position: "absolute", left: 500, top: 800, width: 512, ...drop(f, issue, 50, 3) }} />
      ) : null}
      {f >= pr ? (
        <Ticket
          icon={merged ? "merge" : "pr"}
          number={c.prNo}
          name={c.pr.name}
          state={
            <div style={merged ? pop(f, merge) : undefined}>
              {merged ? (
                <Pill icon="merge" solid>
                  {c.merged}
                </Pill>
              ) : (
                <Pill icon="pr">
                  {c.open}
                </Pill>
              )}
            </div>
          }
          style={{ position: "absolute", left: 500, top: 800, width: 512, boxShadow: merged ? `0 0 0 ${4 * land(f, merge, 9)}px ${color.accent}` : undefined, ...drop(f, pr, 50, -3) }}
        />
      ) : null}
      <Beaver shot="agent" x={310} height={420} steps={[{ from: 0, move: GROOVE }, { from: A.old - 0.1, move: DISMISS }, { from: A.type1[0] - 0.1, move: TALK }, { from: A.page, move: GROOVE }, { from: A.merge, move: CHEER }]} />
    </Shell>
  );
}
