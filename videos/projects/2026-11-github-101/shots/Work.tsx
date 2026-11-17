import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";

import { monoFamily } from "../../../kit/fonts";
import { copy } from "../copy";
import { EDIT, ISSUE, color, when } from "../theme";
import { Avatar, Btn, Caret, Cursor, Icon, Pill, SOFT, Screen, Shell, Veil, Window, fade, frameIn, framesOf, land, settle, typed, typingFrames } from "./parts";

// The two things a project owner does: open an issue and talk under it; change a document or add
// files, as a pull request. Screens are drawn from GitHub's real layout and labels (BRIEF.md).

const border = `3px solid ${color.ink}`;
const thin = `2px solid ${color.line}`;
const label: CSSProperties = { fontSize: 26, fontWeight: 700 };

function Field({ top, height = 70, focus = false, children, style }: { top: number; height?: number; focus?: boolean; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", left: 28, top, width: 890, height, border: `3px solid ${focus ? color.accent : color.ink}`, padding: "0 20px", display: "flex", alignItems: "center", fontSize: 32, fontWeight: 600, whiteSpace: "nowrap", ...style }}>
      {children}
    </div>
  );
}

function Crumb({ parts }: { parts: readonly string[] }) {
  return (
    <div style={{ fontSize: 31, fontWeight: 700, whiteSpace: "nowrap" }}>
      {parts.map((p, i) => (
        <span key={p}>
          {p}
          {i < parts.length - 1 ? <span style={{ fontFamily: monoFamily, color: color.muted }}> / </span> : null}
        </span>
      ))}
    </div>
  );
}

function Comment({ f, at, who, text, top, tick = false }: { f: number; at: number; who: string; text: string; top: number; tick?: boolean }) {
  const d = land(f, at);
  return (
    <div style={{ position: "absolute", left: 28, top, display: "flex", alignItems: "center", gap: 16, opacity: fade(f, at, 3), transform: `translateY(${(1 - d) * 22}px)` }}>
      <Avatar who={who} size={62} />
      <div style={{ padding: "18px 24px", border, fontSize: 32, fontWeight: 700, whiteSpace: "nowrap" }}>{text}</div>
      {tick ? <Icon name="done" size={50} stroke={2.4} style={{ color: color.accent }} /> : null}
    </div>
  );
}

// --- 5 · an issue: New issue → title, description, a screenshot → Create → replies → Closed ---------

const F5 = frameIn("issue");
export const ISSUE_FRAMES = framesOf("issue");

export function Shot5Issue() {
  const f = useCurrentFrame();
  const c = copy.issue;
  const newHot = F5(when("issue1", 1, 0));
  const newClick = F5(ISSUE.newClick);
  const titleAt = F5(ISSUE.title);
  const descAt = F5(ISSUE.desc);
  const desc2At = descAt + typingFrames(c.typedDesc[0]) + 6;
  const paste = F5(ISSUE.paste);
  const createClick = F5(ISSUE.createClick);
  const closeAt = F5(ISSUE.close);
  const title = typed(c.typedTitle, f, titleAt);
  const closed = f >= closeAt;
  const pop = land(f, closeAt, 9);

  return (
    <Shell shot="issue" title={c.title}>
      <Window tab={1} style={{ top: 250, height: 950 }}>
        {/* the list */}
        <Screen f={f} to={newClick + 3}>
          <div style={{ position: "absolute", left: 28, top: 30, fontSize: 40, fontWeight: 800 }}>{copy.tabs[1]}</div>
          <Btn primary hot={f >= newHot} style={{ position: "absolute", right: 28, top: 26 }}>
            {c.newIssue}
          </Btn>
          {c.rows.map((row, i) => (
            <div key={row} style={{ position: "absolute", left: 28, top: 130 + i * 98, width: 890, height: 98, borderTop: thin, display: "flex", alignItems: "center", gap: 18, fontSize: 33, fontWeight: 700 }}>
              <Icon name="issue" size={42} style={{ color: color.accent }} />
              {row}
              <span style={{ marginLeft: "auto", fontFamily: monoFamily, fontSize: 26, fontWeight: 600, color: color.muted }}>#{12 - i}</span>
            </div>
          ))}
        </Screen>

        {/* the form */}
        <Screen f={f} from={newClick + 3} to={createClick + 5}>
          <div style={{ position: "absolute", left: 28, top: 24, fontSize: 38, fontWeight: 800 }}>{c.heading}</div>
          <div style={{ position: "absolute", left: 28, top: 98, ...label }}>{c.addTitle}</div>
          <Field top={140} focus={f < descAt}>
            {title}
            <Caret f={f} on={f >= titleAt - 6 && f < descAt} />
          </Field>
          <div style={{ position: "absolute", left: 28, top: 238, ...label }}>{c.addDesc}</div>
          <Field top={280} height={330} focus={f >= descAt} style={{ display: "block", padding: "18px 20px", lineHeight: 1.65, fontSize: 31 }}>
            <div>
              {typed(c.typedDesc[0], f, descAt)}
              <Caret f={f} on={f >= descAt && f < desc2At} />
            </div>
            <div>
              {typed(c.typedDesc[1], f, desc2At)}
              <Caret f={f} on={f >= desc2At} />
            </div>
            {f >= paste ? (
              <div style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 14, padding: "12px 20px 12px 14px", border, background: SOFT, fontFamily: monoFamily, fontSize: 27, fontWeight: 600, transform: `scale(${0.8 + 0.2 * land(f, paste)})`, transformOrigin: "0 50%" }}>
                <Icon name="image" size={64} stroke={1.8} />
                {c.shot}
              </div>
            ) : null}
          </Field>
          <div style={{ position: "absolute", right: 28, top: 640, display: "flex", gap: 14 }}>
            <Btn>{c.cancel}</Btn>
            <Btn primary hot={f >= createClick - 14}>
              {c.create}
            </Btn>
          </div>
        </Screen>

        {/* the issue: everything about it stays under it */}
        <Screen f={f} from={createClick + 5}>
          <div style={{ position: "absolute", left: 28, top: 26, fontSize: 40, fontWeight: 800, whiteSpace: "nowrap" }}>
            {c.typedTitle}
            <span style={{ fontFamily: monoFamily, fontWeight: 500, color: color.muted }}> #13</span>
          </div>
          <div style={{ position: "absolute", left: 28, top: 100, transform: `scale(${closed ? 0.85 + 0.15 * pop : 1})`, transformOrigin: "0 50%" }}>
            {closed ? (
              <Pill icon="done" solid>
                {c.closed}
              </Pill>
            ) : (
              <Pill icon="issue">{c.open}</Pill>
            )}
          </div>
          <div style={{ position: "absolute", left: 28, top: 186, width: 890, borderTop: thin }} />
          {c.comments.map((m, i) => (
            <Comment key={m.text} f={f} at={F5(ISSUE.comments[i]!)} who={m.who} text={m.text} top={218 + i * 112} />
          ))}
          <div style={{ position: "absolute", left: 28, top: 582, ...label, color: color.muted }}>{c.addComment}</div>
          <Field top={624} height={96} style={{ borderColor: color.lineStrong }} />
          <Btn primary style={{ position: "absolute", right: 28, top: 740 }}>
            {c.comment}
          </Btn>
        </Screen>
      </Window>
      <Cursor f={f} path={[[newClick - 30, 560, 1010], [newClick - 6, 930, 452]]} clicks={[newClick]} />
      <Cursor f={f} path={[[createClick - 26, 520, 930], [createClick - 5, 944, 1062]]} clicks={[createClick]} />
    </Shell>
  );
}

// --- 6 · your own change: the pencil, Commit changes; Add file; a pull request that gets merged -----

const F6 = frameIn("edit");
export const EDIT_FRAMES = framesOf("edit");

function Radio({ on, mark = false, children, top }: { on: boolean; mark?: boolean; children: ReactNode; top: number }) {
  return (
    <div style={{ position: "absolute", left: 28, top, width: 834, display: "flex", gap: 16, padding: "14px 16px", fontSize: 27, fontWeight: 600, lineHeight: 1.35, background: on && mark ? SOFT : undefined, border: `3px solid ${on && mark ? color.accent : "transparent"}` }}>
      <div style={{ width: 30, height: 30, marginTop: 3, borderRadius: 15, border, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? <div style={{ width: 14, height: 14, borderRadius: 7, background: color.accent }} /> : null}</div>
      <div>{children}</div>
    </div>
  );
}

/** GitHub's "Commit changes" box: a message, then where the change goes. */
function CommitBox({ message, caret, second, hot, style }: { message: ReactNode; caret?: ReactNode; second: boolean; hot?: boolean; style?: CSSProperties }) {
  const c = copy.edit;
  return (
    <div style={{ position: "absolute", left: 28, top: 68, width: 890, height: 556, background: color.paper, border, boxShadow: `12px 12px 0 ${color.ink}`, ...style }}>
      <div style={{ position: "absolute", left: 28, top: 22, fontSize: 36, fontWeight: 800 }}>{c.commit}</div>
      <div style={{ position: "absolute", left: 28, top: 84, ...label }}>{c.commitMessage}</div>
      <Field top={124} height={68} style={{ width: 834 }}>
        {message}
        {caret}
      </Field>
      <Radio top={216} on={!second}>
        {c.direct}
      </Radio>
      <Radio top={290} on={second} mark>
        {c.branch}
      </Radio>
      {second ? (
        <div style={{ position: "absolute", left: 92, top: 398, width: 420, height: 50, border, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", fontFamily: monoFamily, fontSize: 25, fontWeight: 600 }}>
          <Icon name="pr" size={28} />
          {c.branchName}
        </div>
      ) : null}
      <div style={{ position: "absolute", right: 28, top: 470, display: "flex", gap: 14 }}>
        <Btn>{copy.issue.cancel}</Btn>
        <Btn primary hot={hot}>
          {second ? c.propose : c.commit}
        </Btn>
      </div>
    </div>
  );
}

export function Shot6Edit() {
  const f = useCurrentFrame();
  const c = copy.edit;
  const pencilHot = F6(when("edit1", 0, 1));
  const pencilClick = F6(EDIT.pencilClick);
  const rewrite = F6(EDIT.rewrite);
  const commitHot = F6(when("edit1", 1, 0));
  const commitClick = F6(EDIT.commitClick);
  const messageAt = F6(EDIT.message);
  // the first box does not stay on the default: once the message is typed, the second option is clicked
  const pickFirst = F6(EDIT.pickFirst);
  const folder = F6(EDIT.folder);
  const addHot = F6(when("edit2", 0, 1));
  const addFile = F6(EDIT.addFile);
  const upload = F6(EDIT.upload);
  const drops = EDIT.drop.map(F6);
  const save = F6(EDIT.save);
  const pick = F6(EDIT.pick);
  const propose = F6(EDIT.propose);
  const prForm = F6(when("pr", 0, 1));
  const createClick = F6(EDIT.createClick);
  const review = F6(EDIT.review);
  const merge = F6(EDIT.merge);

  // line 5: the old words go, the new ones are typed
  const erased = [...c.before].slice(0, Math.max(0, [...c.before].length - Math.max(0, f - rewrite))).join("");
  const typeAt = rewrite + [...c.before].length + 3;
  const line5 = f < typeAt ? erased : typed(c.after, f, typeAt, 14);
  const source = [c.doc[0], `## ${c.doc[1]}`, c.doc[2], `## ${c.doc[3]}`];
  const merged = f >= merge;

  const editor = (
    <>
      <div style={{ position: "absolute", left: 28, top: 30 }}>
        <Crumb parts={c.path} />
      </div>
      <div style={{ position: "absolute", right: 28, top: 22, display: "flex", gap: 12 }}>
        <Btn style={{ fontSize: 24, padding: "10px 16px" }}>{c.cancelChanges}</Btn>
        <Btn primary hot={f >= commitHot && f < commitClick + 3} style={{ fontSize: 24, padding: "10px 16px" }}>
          {c.commitDots}
        </Btn>
      </div>
      <div style={{ position: "absolute", left: 28, top: 104, width: 890, height: 420, border, fontFamily: monoFamily, fontSize: 29, fontWeight: 500 }}>
        {[...source, line5].map((text, i) => (
          <div key={i} style={{ height: 66, display: "flex", alignItems: "center", background: i === 4 && f >= rewrite ? SOFT : undefined, marginTop: i ? 0 : 20 }}>
            <span style={{ width: 70, textAlign: "right", color: color.lineStrong, marginRight: 24 }}>{i + 1}</span>
            <span style={{ whiteSpace: "nowrap" }}>{text}</span>
            {i === 4 ? <Caret f={f} on={f >= rewrite && f < commitHot} /> : null}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <Shell shot="edit" title={c.title}>
      <Window tab={f >= createClick + 4 ? 2 : 0} style={{ top: 330, height: 790 }}>
        {/* the document, with a pencil */}
        <Screen f={f} to={pencilClick + 3}>
          <div style={{ position: "absolute", left: 28, top: 30 }}>
            <Crumb parts={c.path} />
          </div>
          <div style={{ position: "absolute", left: 28, top: 104, width: 890, height: 500, border }}>
            <div style={{ height: 70, borderBottom: border, display: "flex", alignItems: "center", padding: "0 14px 0 24px", fontSize: 26, fontWeight: 700, color: color.muted }}>
              {c.preview}
              <div style={{ marginLeft: "auto", width: 50, height: 50, display: "flex", alignItems: "center", justifyContent: "center", color: color.ink, border, boxShadow: f >= pencilHot ? `0 0 0 7px ${SOFT}, 0 0 0 10px ${color.accent}` : undefined }}>
                <Icon name="pencil" size={32} />
              </div>
            </div>
            <div style={{ padding: "26px 32px" }}>
              <div style={{ fontSize: 46, fontWeight: 900, paddingBottom: 14, borderBottom: thin }}>{c.doc[0].slice(2)}</div>
              <div style={{ fontSize: 34, fontWeight: 800, marginTop: 28 }}>{c.doc[1]}</div>
              <div style={{ fontSize: 30, fontWeight: 500, marginTop: 10 }}>{c.doc[2]}</div>
              <div style={{ fontSize: 34, fontWeight: 800, marginTop: 28 }}>{c.doc[3]}</div>
              <div style={{ fontSize: 30, fontWeight: 500, marginTop: 10, color: color.muted }}>{c.before}</div>
            </div>
          </div>
        </Screen>

        {/* the editor, then the commit box over it */}
        <Screen f={f} from={pencilClick + 3} to={folder}>
          {editor}
          {f >= commitClick + 3 ? <Veil /> : null}
          {f >= commitClick + 3 ? (
            <CommitBox
              message={typed(c.message, f, messageAt, 13)}
              caret={<Caret f={f} on={f >= messageAt - 6 && f < pickFirst} />}
              second={f >= pickFirst}
              hot={f >= pickFirst + 8}
              style={settle(fade(f, commitClick + 3, 6), 30)}
            />
          ) : null}
        </Screen>

        {/* adding files: Add file → Upload files → drag them in */}
        <Screen f={f} from={folder} to={upload + 3}>
          <div style={{ position: "absolute", left: 28, top: 30 }}>
            <Crumb parts={[c.path[0], ""]} />
          </div>
          <Btn hot={f >= addHot} style={{ position: "absolute", right: 28, top: 22 }}>
            {c.addFile}
            <Icon name="caret" size={26} stroke={3} />
          </Btn>
          <div style={{ position: "absolute", left: 28, top: 104, width: 890, border }}>
            {c.folder.map((name, i) => (
              <div key={name} style={{ height: 88, borderTop: i ? thin : undefined, display: "flex", alignItems: "center", gap: 18, padding: "0 24px", fontSize: 32, fontWeight: 700 }}>
                <Icon name="file" size={42} />
                {name}
              </div>
            ))}
          </div>
          {f >= addFile + 3 ? (
            <div style={{ position: "absolute", right: 28, top: 88, width: 330, background: color.paper, border, boxShadow: `8px 8px 0 ${color.ink}`, opacity: fade(f, addFile + 3, 4) }}>
              {c.menu.map((item, i) => (
                <div key={item} style={{ height: 70, display: "flex", alignItems: "center", gap: 14, padding: "0 20px", fontSize: 28, fontWeight: i ? 800 : 600, background: i ? SOFT : undefined, borderTop: i ? thin : undefined }}>
                  <Icon name={i ? "upload" : "file"} size={34} />
                  {item}
                </div>
              ))}
            </div>
          ) : null}
        </Screen>
        <Screen f={f} from={upload + 3} to={prForm}>
          <div>
            <div style={{ position: "absolute", left: 28, top: 30, width: 890, height: 330, border: `3px dashed ${color.ink}`, background: f >= drops[0]! - 6 ? SOFT : undefined, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, textAlign: "center" }}>
              <Icon name="upload" size={92} stroke={1.8} />
              <div style={{ fontSize: 31, fontWeight: 800, width: 620, lineHeight: 1.35 }}>{c.drag}</div>
            </div>
            {c.uploads.map((name, i) => {
              const d = land(f, drops[i]!, 9);
              return (
                <div key={name} style={{ position: "absolute", left: 28, top: 392 + i * 104, width: 890, height: 88, border, background: color.paper, display: "flex", alignItems: "center", gap: 18, padding: "0 24px", fontFamily: monoFamily, fontSize: 30, fontWeight: 600, opacity: fade(f, drops[i]!, 3), transform: `translate(${(1 - d) * 260}px, ${(1 - d) * 240}px) rotate(${(1 - d) * 8}deg)` }}>
                  <Icon name="file" size={42} />
                  {name}
                  <Icon name="check" size={40} stroke={3} style={{ marginLeft: "auto", color: color.accent, opacity: fade(f, drops[i]! + 9, 4) }} />
                </div>
              );
            })}
          </div>
        </Screen>

        {/* saving the upload: the second option makes it a pull request */}
        <Screen f={f} from={save} to={prForm}>
          <Veil />
          <CommitBox message={c.uploadMessage} second={f >= pick} hot={f >= pick + 8} style={settle(fade(f, save, 6), 30)} />
        </Screen>
        <Screen f={f} from={prForm} to={createClick + 4}>
          <div style={{ position: "absolute", left: 28, top: 26, fontSize: 38, fontWeight: 800 }}>{c.openPr}</div>
          <div style={{ position: "absolute", left: 28, top: 100, ...label }}>{copy.issue.addTitle}</div>
          <Field top={140}>{c.uploadMessage}</Field>
          <div style={{ position: "absolute", left: 28, top: 238, ...label }}>{copy.issue.addDesc}</div>
          <Field top={280} height={170} style={{ borderColor: color.lineStrong }} />
          <Btn primary hot style={{ position: "absolute", right: 28, top: 482 }}>
            {c.createPr}
          </Btn>
        </Screen>

        {/* the pull request: someone looks, then it is merged */}
        <Screen f={f} from={createClick + 4}>
          <div style={{ position: "absolute", left: 28, top: 26, fontSize: 40, fontWeight: 800, whiteSpace: "nowrap" }}>
            {c.uploadMessage}
            <span style={{ fontFamily: monoFamily, fontWeight: 500, color: color.muted }}> #14</span>
          </div>
          <div style={{ position: "absolute", left: 28, top: 100, transform: `scale(${merged ? 0.85 + 0.15 * land(f, merge, 9) : 1})`, transformOrigin: "0 50%" }}>
            {merged ? (
              <Pill icon="merge" solid>
                {c.merged}
              </Pill>
            ) : (
              <Pill icon="pr">{copy.issue.open}</Pill>
            )}
          </div>
          <div style={{ position: "absolute", left: 28, top: 190, width: 890, border, fontFamily: monoFamily, fontSize: 28, fontWeight: 500 }}>
            <div style={{ height: 62, borderBottom: border, display: "flex", alignItems: "center", padding: "0 22px", fontWeight: 600 }}>{c.filesChanged}</div>
            {c.uploads.map((name) => (
              <div key={name} style={{ height: 62, display: "flex", alignItems: "center", padding: "0 22px", background: SOFT }}>
                + {c.path[0]}/{name}
              </div>
            ))}
          </div>
          <Comment f={f} at={review} who={c.review.who} text={c.review.text} top={420} tick />
          {merged ? (
            <div style={{ position: "absolute", left: 28, top: 548, display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 800, opacity: fade(f, merge + 4, 5) }}>
              <Icon name="merge" size={50} style={{ color: color.accent }} />
              {c.into}
            </div>
          ) : null}
        </Screen>
      </Window>
      <Cursor f={f} path={[[pencilClick - 28, 600, 1040], [pencilClick - 5, 950, 606]]} clicks={[pencilClick]} />
      <Cursor f={f} path={[[commitClick - 26, 560, 1000], [commitClick - 5, 940, 500]]} clicks={[commitClick]} />
      <Cursor f={f} path={[[addFile - 22, 560, 1000], [addFile - 4, 950, 496], [addFile + 6, 950, 496], [upload - 4, 900, 640]]} clicks={[addFile, upload]} />
      <Cursor f={f} path={[[pickFirst - 16, 560, 1040], [pickFirst - 3, 160, 846]]} clicks={[pickFirst]} />
      <Cursor f={f} path={[[pick - 22, 600, 1080], [pick - 4, 160, 846], [pick + 8, 160, 846], [propose - 4, 930, 1036]]} clicks={[pick, propose]} />
      <Cursor f={f} path={[[createClick - 26, 520, 1100], [createClick - 5, 972, 972]]} clicks={[createClick]} />
    </Shell>
  );
}
