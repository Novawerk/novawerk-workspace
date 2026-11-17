// Every word on screen, in one place. **word** is highlighted in green. The spoken words (and the
// subtitles) are in narration.ts. GitHub's own labels stay in English, as people will see them.
// Facts only from knowledge/ and novawerk.io — see videos/BRAND.md and BRIEF.md.

import { NARRATION, shown } from "./narration";

export const copy = {
  series: "NOVAWERK 101",
  me: "你",
  demo: "示意",
  repo: "novawerk / demo",
  tabs: ["Code", "Issues", "Pull requests"],
  hook: {
    chats: ["能加个「常见问题」吗？", "上次说的那个改了吗", "是在哪个群里说的…"],
    mails: ["Re: Re: 转发：方案", "附件见上一封"],
    files: ["方案_最终版.docx", "方案_最终版2.docx", "方案_真的最终版.docx"],
    caption: "最新版，在**谁**那儿？",
  },
  what: {
    title: ["一个项目，", "**一个地方**"],
    name: "GitHub",
    noInstall: "不用装软件",
    tags: ["共享文件夹", "留言板", "改动记录"],
    files: ["需求", "设计稿", "文案.md", "常见问题.md"],
    board: [
      { who: "你", text: "首页想加一个入口" },
      { who: "宁", text: "收到，这周做" },
    ],
    history: [
      { who: "宁", text: "改了 文案.md", day: "周二" },
      { who: "周", text: "传了 设计稿", day: "周三" },
    ],
  },
  words: {
    title: ["先认**三个词**"],
    cards: [
      { term: "Repository", zh: "仓库", gloss: "项目的**文件夹**" },
      { term: "Issue", zh: "", gloss: "一件**要做的事**" },
      { term: "Pull request", zh: "", gloss: "一次改动，**看过再放进去**" },
    ],
  },
  start: {
    title: ["三步，**开始**"],
    steps: ["注册账号", "告诉伙伴你的用户名", "在邮件里接受邀请"],
    free: "免费",
    username: "Username",
    handle: "your-name",
    signUp: "Sign up",
    tell: "我的用户名：your-name",
    invite: "邀请你加入 novawerk / demo",
    accept: "Accept invitation",
    joined: "已加入",
  },
  issue: {
    title: ["有事，**开一条 Issue**"],
    newIssue: "New issue",
    rows: ["手机上按钮太小", "加载有点慢", "文案里有个错字", "搜索找不到内容", "想要深色模式"],
    heading: "Create new issue",
    addTitle: "Add a title",
    addDesc: "Add a description",
    typedTitle: "首页加一个「常见问题」入口",
    typedDesc: ["想要：首页能直接点进常见问题", "为什么：大家总在问同样的事"],
    shot: "截图.png",
    cancel: "Cancel",
    create: "Create",
    open: "Open",
    closed: "Closed",
    comments: [
      { who: "宁", text: "收到，这周做" },
      { who: "你", text: "入口放在页面底部就行" },
      { who: "宁", text: "做好了，你看看" },
    ],
    addComment: "Add a comment",
    comment: "Comment",
  },
  edit: {
    title: ["文档和材料，", "**自己放进来**"],
    path: ["docs", "常见问题.md"],
    preview: "Preview",
    doc: ["# 常见问题", "怎么注册？", "点右上角的「注册」。", "要收费吗？"],
    before: "（待补充）",
    after: "不收费，注册就能用。",
    cancelChanges: "Cancel changes",
    commitDots: "Commit changes...",
    commit: "Commit changes",
    commitMessage: "Commit message",
    message: "补上收费问题的回答",
    direct: "Commit directly to the main branch.",
    branch: "Create a new branch for this commit and start a pull request.",
    branchName: "your-name-patch-1",
    propose: "Propose changes",
    addFile: "Add file",
    menu: ["Create new file", "Upload files"],
    folder: ["需求.md", "文案.md", "常见问题.md"],
    drag: "Drag files here to add them to your repository",
    uploads: ["活动流程.pdf", "封面图.png"],
    uploadMessage: "上传活动流程和封面图",
    filesChanged: "Files changed",
    openPr: "Open a pull request",
    createPr: "Create pull request",
    review: { who: "宁", text: "看过了，没问题" },
    merged: "Merged",
    into: "已合并进 main",
  },
  habits: {
    title: ["记住**三件事**"],
    notes: ["一件事，**一条**", "改错了，**找得回来**", "公开仓库，**不放隐私**"],
    private: "个人信息、密码，都别放",
  },
  close: {
    number: "101",
    line: "一起把想法做成**真的东西**",
  },
  cover: {
    kicker: "NOVAWERK 101",
    title: ["GitHub 是什么", "怎么用它**一起做事**"],
    chips: ["Repository", "Issue", "Pull request"],
  },
} as const;

/** Every character the video puts on screen, for the font subset. */
export function allText(): string {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(copy);
  for (const seg of NARRATION) for (const line of seg.lines) for (const p of line) strings.push(shown(p));
  return strings.join("");
}
