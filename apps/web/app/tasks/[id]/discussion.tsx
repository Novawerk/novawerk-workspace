"use client";

import { postInput, type PublicPost, type PublicTaskDetail } from "@nw/contracts";
import { useId, useState } from "react";

import { Avatar, Markdown, Note, Person } from "@/components/board/bits";
import { formatDate } from "@/components/board/labels";
import { buttonSmallInk, field, textLink } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api } from "@/lib/contrib-api";
import { useMe, useToast } from "@/lib/session";

import { isMe } from "./task-view";

/** Questions, updates and decisions: posts and one level of replies. */
export function Discussion({
  task,
  signedIn,
  composerRef,
  onAskSignIn,
  onPosted,
}: {
  task: PublicTaskDetail;
  signedIn: boolean;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  onAskSignIn: () => void;
  onPosted: () => Promise<void>;
}) {
  const count = task.posts.reduce((n, p) => n + 1 + p.replies.length, 0);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  return (
    <section aria-labelledby="discussion" className="mt-8 border-t border-line pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="discussion" className="text-lg font-semibold tracking-tight">
          Discussion <span className="font-mono font-normal text-muted">{count}</span>
        </h2>
        <span className="text-[13px] text-muted">Questions, updates and decisions live here.</span>
      </div>

      <div className="mt-1.5">
        {task.posts.length === 0 ? <p className="py-3 text-sm text-muted">No posts yet. Ask a question before you propose.</p> : null}
        {task.posts.map((post) => (
          <Post
            key={post.id}
            post={post}
            taskId={task.id}
            locked={task.threadLocked}
            signedIn={signedIn}
            replying={replyTo === post.id}
            onReply={() => (signedIn ? setReplyTo(replyTo === post.id ? null : post.id) : onAskSignIn())}
            onPosted={async () => {
              setReplyTo(null);
              await onPosted();
            }}
          />
        ))}
      </div>

      {task.threadLocked ? (
        <Note className="mt-3">This thread is locked. A maintainer closed it for new posts.</Note>
      ) : signedIn ? (
        <Composer taskId={task.id} textareaRef={composerRef} onPosted={onPosted} />
      ) : (
        <Note className="mt-3">
          <button type="button" className={textLink} onClick={onAskSignIn}>
            Sign in
          </button>{" "}
          to post or propose.
        </Note>
      )}
    </section>
  );
}

function Post({
  post,
  taskId,
  reply = false,
  locked,
  signedIn,
  replying = false,
  onReply,
  onPosted,
}: {
  post: PublicPost;
  taskId: string;
  reply?: boolean;
  locked: boolean;
  signedIn: boolean;
  replying?: boolean;
  onReply?: () => void;
  onPosted: () => Promise<void>;
}) {
  const me = useMe();
  const toast = useToast();
  const [reported, setReported] = useState(false);
  const mine = isMe(post.author, me?.handle);

  const report = async () => {
    const res = await api(`/contrib/posts/${post.id}/report`, { method: "POST", body: {} });
    if (!res.ok) return toast(res.error);
    setReported(true);
    toast("Reported. A maintainer will look at it.");
  };

  const author = post.author;
  const face =
    author?.kind === "contributor" ? (
      <Avatar name={author.name ?? author.handle} url={author.avatarUrl} size={reply ? "xs" : "sm"} />
    ) : author?.kind === "member" ? (
      <Avatar name={author.name} accent="ink" size={reply ? "xs" : "sm"} />
    ) : (
      <span aria-hidden="true" className={`${reply ? "size-[22px]" : "size-8"} inline-block border border-line bg-subtle`} />
    );

  return (
    <article className={`grid gap-3 ${reply ? "grid-cols-[22px_minmax(0,1fr)] py-2.5" : "grid-cols-[32px_minmax(0,1fr)] border-t border-line py-4 first:border-t-0"}`}>
      <div>{face}</div>
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          {post.hidden ? <span>Hidden</span> : <Person person={author} />}
          {post.viaAgent ? (
            <span className="border border-dashed border-line-strong px-1.5 font-mono text-[11px]" title="Posted with a token">
              via agent · {post.viaAgent}
            </span>
          ) : null}
          <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
        </div>
        {post.hidden || post.body === null ? (
          <p className="text-sm text-muted italic">Hidden by Novawerk: off-topic or spam.</p>
        ) : (
          <Markdown className="text-[15px]">{post.body}</Markdown>
        )}
        {!reply && !post.hidden ? (
          <div className="flex gap-3.5 text-[13px]">
            {!locked ? (
              <button type="button" className={`${textLink} text-muted`} onClick={onReply} aria-expanded={replying}>
                Reply
              </button>
            ) : null}
            {signedIn && !mine ? (
              <button type="button" className={`${textLink} text-muted`} onClick={report} disabled={reported}>
                {reported ? "Reported" : "Report"}
              </button>
            ) : null}
          </div>
        ) : null}
        {post.replies.length > 0 || replying ? (
          <div className="mt-1 grid border-l border-line pl-3.5">
            {post.replies.map((r) => (
              <Post key={r.id} post={r} taskId={taskId} reply locked={locked} signedIn={signedIn} onPosted={onPosted} />
            ))}
            {replying ? <Composer taskId={taskId} replyTo={post.id} onPosted={onPosted} compact /> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Composer({
  taskId,
  replyTo,
  textareaRef,
  onPosted,
  compact = false,
}: {
  taskId: string;
  replyTo?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onPosted: () => Promise<void>;
  compact?: boolean;
}) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = postInput.safeParse({ body, ...(replyTo ? { replyTo } : {}) });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Write something first");
    setBusy(true);
    setError(null);
    const res = await api(`/contrib/tasks/${taskId}/posts`, { method: "POST", body: parsed.data });
    setBusy(false);
    if (!res.ok) return setError(res.issues.body?.[0] ?? res.error);
    track("post_sent", { reply: !!replyTo });
    setBody("");
    toast(replyTo ? "Reply posted." : "Posted.");
    await onPosted();
  };

  return (
    <form onSubmit={send} noValidate className={`grid gap-2 ${compact ? "py-2" : "mt-2"}`}>
      <label htmlFor={id} className="sr-only">
        {replyTo ? "Your reply" : "New post"}
      </label>
      <textarea
        id={id}
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={replyTo ? "Write a reply. Markdown works." : "Ask a question or share an update. Markdown works."}
        className={`${field} ${compact ? "min-h-16" : "min-h-[84px]"} resize-y`}
        aria-invalid={error ? true : undefined}
        autoFocus={compact}
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted">Be kind. Show your work.</span>
        <button type="submit" disabled={busy} className={buttonSmallInk}>
          {busy ? "Posting…" : replyTo ? "Reply" : "Post"}
        </button>
      </div>
    </form>
  );
}
