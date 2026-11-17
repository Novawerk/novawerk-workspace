// Every word on screen, in one place, in each language. **word** is highlighted in green. The sung
// words (and the subtitles) are in lyrics.ts. GitHub's own labels stay in English in both
// languages, as people will see them. Facts only from knowledge/ and novawerk.io — see
// videos/BRAND.md and BRIEF.md.

import { LYRICS, shown } from "./lyrics.ts";
import type { Lang } from "./lyrics.ts";

/**
 * GitHub's labels and the made-up repository: the same in both films. The repository is written as
 * a placeholder on purpose: a plain name could be a real account.
 */
const ui = {
  series: "NOVAWERK 101",
  repo: "your-team / your-project",
  github: "GitHub",
  open: "Open",
  merged: "Merged",
  issueNo: "#13",
  prNo: "#14",
  number: "101",
} as const;

const zh = {
  ...ui,
  demo: "示意",
  me: "你",
  today: "今天聊 **GitHub**",
  hook: {
    chats: ["能加个「常见问题」吗？", "上次说的那个改了吗", "是在哪个群里说的…"],
    mails: ["Re: Re: 转发：方案", "附件见上一封"],
    files: ["方案_最终版.docx", "方案_最终版2.docx", "方案_真的最终版.docx"],
  },
  what: {
    noInstall: "打开网页就能用",
    tags: ["共享文件夹", "留言板", "改动记录"],
    files: ["需求", "设计稿", "文案", "常见问题"],
    board: [
      { who: "你", text: "首页想加一个入口" },
      { who: "宁", text: "收到，这周做" },
    ],
    history: [
      { who: "宁", text: "改了 文案", day: "周二" },
      { who: "周", text: "传了 设计稿", day: "周三" },
    ],
  },
  words: {
    cards: [
      { term: "Repository", aka: "仓库", gloss: "项目的**文件夹**" },
      { term: "Issue", aka: "", gloss: "一件**要做的事**" },
      { term: "Pull request", aka: "PR", gloss: "改了点东西，**看过再放进去**" },
    ],
  },
  agent: { old: "自己点来点去" },
  issue: { message: "帮我开个 Issue：首页加个常见问题入口", name: "首页加「常见问题」入口" },
  pr: { message: "把收费那条改成不收费，提个 PR", name: "收费改成不收费", review: { who: "宁", text: "看过了，没问题" } },
  habits: ["**不放隐私**", "**每一版都在**"],
  close: "一起把想法**变成真的**",
  cover: { title: ["GitHub 是什么", "怎么用它**一起做事**"], chips: ["Repository", "Issue", "Pull request"] },
};

const en: typeof zh = {
  ...ui,
  demo: "sketch",
  me: "Me",
  today: "Today: **GitHub**",
  hook: {
    chats: ["Can we add an FAQ?", "Did that thing get fixed?", "Which chat was that in…"],
    mails: ["Re: Re: Fwd: the plan", "See attachment, last mail"],
    files: ["plan_final.docx", "plan_final2.docx", "plan_really_final.docx"],
  },
  what: {
    noInstall: "Opens in your browser",
    tags: ["Shared folder", "Message board", "History"],
    files: ["requests", "designs", "copy.md", "faq.md"],
    board: [
      { who: "Me", text: "FAQ on the home page?" },
      { who: "A", text: "On it, this week" },
    ],
    history: [
      { who: "A", text: "changed copy.md", day: "Tue" },
      { who: "J", text: "added designs", day: "Wed" },
    ],
  },
  words: {
    cards: [
      { term: "Repository", aka: "repo", gloss: "the project's **folder**" },
      { term: "Issue", aka: "", gloss: "one thing **to do**" },
      { term: "Pull request", aka: "PR", gloss: "a change, **looked at first**" },
    ],
  },
  agent: { old: "Clicking around" },
  issue: { message: "Open an issue: FAQ link on the home page", name: "FAQ link on home page" },
  pr: { message: "Make the FAQ say it's free, and open a PR", name: "FAQ: it's free", review: { who: "A", text: "Looked it over, all good" } },
  habits: ["**Nothing private**", "**It's all saved**"],
  close: "Let's turn ideas into **something real**",
  cover: { title: ["What GitHub is,", "and how we **use it**"], chips: ["Repository", "Issue", "Pull request"] },
};

export const copies: Record<Lang, typeof zh> = { zh, en };
export type Copy = typeof zh;

/** Every character either film puts on screen, for the font subset. */
export function allText(): string {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(copies);
  for (const segs of Object.values(LYRICS)) for (const seg of segs) for (const line of seg.lines) for (const p of line) strings.push(shown(p));
  return strings.join("");
}
