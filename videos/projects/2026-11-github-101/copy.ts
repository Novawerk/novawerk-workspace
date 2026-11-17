// Every word on screen, in one place, in each language. **word** is highlighted in green. The spoken
// words (and the subtitles) are in narration.ts. GitHub's own labels stay in English in both
// languages, as people will see them. Facts only from knowledge/ and novawerk.io — see
// videos/BRAND.md and BRIEF.md.

import { NARRATION, shown } from "./narration.ts";
import type { Lang } from "./narration.ts";

/**
 * GitHub's labels and the made-up repository: the same in both films. The repository and the username
 * are written as placeholders on purpose: a plain name could be a real account, and a repository
 * under our own name next to "invited" reads as an invitation to join Novawerk.
 */
const ui = {
  series: "NOVAWERK 101",
  repo: "your-team / your-project",
  tabs: ["Code", "Issues", "Pull requests"],
  github: "GitHub",
  username: "Username",
  handle: "<your-name>",
  signUp: "Sign up",
  accept: "Accept invitation",
  open: "Open",
  closed: "Closed",
  merged: "Merged",
  issueNo: "#13",
  prNo: "#14",
  filesChanged: "Files changed",
  agents: ["Claude Code", "Codex"],
  number: "101",
} as const;

const zh = {
  ...ui,
  demo: "示意",
  me: "你",
  hook: {
    chats: ["能加个「常见问题」吗？", "上次说的那个改了吗", "是在哪个群里说的…"],
    mails: ["Re: Re: 转发：方案", "附件见上一封"],
    files: ["方案_最终版.docx", "方案_最终版2.docx", "方案_真的最终版.docx"],
    caption: "最新版，在**谁**那儿？",
  },
  welcome: { line: "跟我们一起做项目，先懂这些", today: "今天聊 **GitHub**" },
  what: {
    title: ["一个项目，", "**一个地方**"],
    noInstall: "不用装软件",
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
    title: ["只要认识**三个词**"],
    cards: [
      { term: "Repository", aka: "仓库", gloss: "项目的**文件夹**" },
      { term: "Issue", aka: "", gloss: "一件**要做的事**" },
      { term: "Pull request", aka: "PR", gloss: "改了点东西，**看过再放进去**" },
    ],
  },
  start: {
    title: ["三步，**开始**"],
    steps: ["注册账号", "把用户名发给伙伴", "在邮件里接受邀请"],
    free: "免费",
    tell: "我的用户名：<your-name>",
    invite: "邀请你协作：your-team / your-project",
    joined: "已接受",
  },
  agent: {
    title: ["有了 agent，", "**说人话就行**"],
    panel: "你的 coding agent",
    placeholder: "想让它做什么？",
    old: "自己点来点去",
    now: "跟它说一句",
    connectAsk: "先连上你的 GitHub 账号，我一步步告诉你怎么弄。",
    connect: "连接 GitHub",
    connected: "已连上",
  },
  issue: {
    title: ["提需求，", "**说一句就行**"],
    message: ["帮我开个 Issue：首页加一个常见问题的入口，", "因为大家老在问同样的事。"],
    tags: ["想要什么", "为什么"],
    reply: "开好了，在这儿：",
    name: "首页加一个「常见问题」入口",
    comments: [
      { who: "宁", text: "收到，这周做" },
      { who: "你", text: "入口放在页面底部就行" },
      { who: "宁", text: "做好了，你看看" },
    ],
  },
  pr: {
    title: ["改东西，", "**也是一句话**"],
    message: ["把常见问题里收费那条，改成不收费，", "再把这两个文件放进去，", "提个 PR，让大家先看看。"],
    files: ["活动流程.pdf", "封面图.png"],
    reply: "改好了，提了一个 PR：",
    name: "收费改成不收费，加两份材料",
    count: "3 个文件",
    changed: ["docs/常见问题", "docs/活动流程.pdf", "docs/封面图.png"],
    review: { who: "宁", text: "看过了，没问题" },
    into: "已合并进 main",
  },
  habits: {
    title: ["记住**三件事**"],
    notes: ["一件事，**一条 Issue**", "改东西，**都提 PR**", "公开仓库，**不放隐私**"],
    subs: ["", "改错了也找得回来", "个人信息、密码，都别放"],
  },
  close: { line: "一起把想法做成**真的东西**", bye: "下次见" },
  cover: { title: ["GitHub 是什么", "怎么用它**一起做事**"], chips: ["Repository", "Issue", "Pull request"] },
};

const en: typeof zh = {
  ...ui,
  demo: "sketch",
  me: "Me",
  hook: {
    chats: ["Can we add an FAQ?", "Did that thing get fixed?", "Which chat was that in…"],
    mails: ["Re: Re: Fwd: the plan", "See attachment, last mail"],
    files: ["plan_final.docx", "plan_final2.docx", "plan_really_final.docx"],
    caption: "Where's the **latest** one?",
  },
  welcome: { line: "The basics of working with us", today: "Today: **GitHub**" },
  what: {
    title: ["One project,", "**one place**"],
    noInstall: "Nothing to install",
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
    title: ["Just **three words**"],
    cards: [
      { term: "Repository", aka: "repo", gloss: "the project's **folder**" },
      { term: "Issue", aka: "", gloss: "one thing **to do**" },
      { term: "Pull request", aka: "PR", gloss: "a change, **looked at first**" },
    ],
  },
  start: {
    title: ["Three steps **in**"],
    steps: ["Make an account", "Tell your partner your username", "Accept the invite in your email"],
    free: "free",
    tell: "My username: <your-name>",
    invite: "Invited to your-team / your-project",
    joined: "Accepted",
  },
  agent: {
    title: ["With an agent,", "**just say it**"],
    panel: "Your coding agent",
    placeholder: "What should it do?",
    old: "Clicking around",
    now: "Just tell it",
    connectAsk: "First, connect your GitHub account. I'll walk you through it.",
    connect: "Connect GitHub",
    connected: "Connected",
  },
  issue: {
    title: ["Need something?", "**Say one line**"],
    message: ["Open an issue: add an FAQ link to the home page, ", "because people keep asking the same things."],
    tags: ["what you want", "why"],
    reply: "Done. Here it is:",
    name: "Add an FAQ link to the home page",
    comments: [
      { who: "A", text: "On it, this week" },
      { who: "Me", text: "The footer is fine for it" },
      { who: "A", text: "Done, take a look" },
    ],
  },
  pr: {
    title: ["Want a change?", "**Same thing**"],
    message: ["Change the pricing answer in the FAQ to: it's free, ", "add these two files, ", "and open a PR, so people can look first."],
    files: ["event-plan.pdf", "cover.png"],
    reply: "Changed. I opened a PR:",
    name: "Pricing answer, two new files",
    count: "3 files",
    changed: ["docs/faq.md", "docs/event-plan.pdf", "docs/cover.png"],
    review: { who: "A", text: "Looked through it, all good" },
    into: "Merged into main",
  },
  habits: {
    title: ["Remember **three things**"],
    notes: ["One thing, **one issue**", "Changes **go through a PR**", "Public repo, **nothing private**"],
    subs: ["", "every version is saved", "no personal data, no passwords"],
  },
  close: { line: "Let's turn ideas into **something real**", bye: "See you next time" },
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
  for (const segs of Object.values(NARRATION)) for (const seg of segs) for (const line of seg.lines) for (const p of line) strings.push(shown(p));
  return strings.join("");
}
