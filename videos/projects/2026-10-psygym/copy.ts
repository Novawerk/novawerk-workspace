// Every word on screen, in one place. **word** is highlighted.
// 小红书: no URLs, e-mail addresses, QR codes or any pointer off the platform (../../BRAND.md).
// Facts: records/operations/minutes/2026-10-10-psygym-kickoff.md, the project-psygym-workspace
// README and docs/, and what the founders confirmed (PLAN.md). 聆镜 agreed to show their pitch
// and their team.

export const copy = {
  hook: {
    caption: ["看我们如何用**六周**", "把一个想法变成现实"],
    pitchTitle: "心理咨询师助手工具",
    pitchLabel: "PITCH",
    stamp: "10.05 · 提案",
    goal: "圣诞前 · 上线",
  },
  pitch: {
    caption: ["聆镜团队在官网", "提交了一份**提案**"],
    // The /submit chat, drawn. The header and panel labels are the site's own.
    header: "Submit a project",
    intro: "Tell us about your idea. We draft the pitch with you.",
    message: "我们想做一个帮心理咨询师成长的 AI 工具",
    panel: "Your pitch",
    fields: [
      { label: "Project name", value: "心理咨询师助手工具" },
      { label: "Product", value: "AI 来访者陪新手练习 · AI 督导找出错误、给改进方向" },
      { label: "Team", value: "心理学博士 · 金融学博士" },
    ],
  },
  email: {
    caption: ["5 天后，我们回信", "**一起做**"],
    from: "Novawerk",
    to: "聆镜团队",
    subject: "我们想和你一起做 心理咨询师助手工具",
    // apps/api/src/admin/pitch-emails.ts, acceptedEmail (zh)
    body: ["好消息：我们想和你一起把 心理咨询师助手工具 做出来。", "它现在是 Novawerk 的一个项目了，你是它的许愿人。"],
    stamp: "立项",
    stampDate: "10.10",
  },
  why: {
    name: "聆镜 PSYGYM",
    was: "心理咨询师助手工具",
    painA: { caption: ["想练习，", "却找不到**来访者**"], tag: "PAIN 01" },
    painB: { caption: ["想要督导，", "**排队**又贵"], tag: "PAIN 02", door: "督导", price: "¥¥¥" },
    solve: ["所以，聆镜 PSYGYM", "做**两件事**"],
    answers: [
      { tag: "01 · AI CLIENT", title: "AI 来访者", sub: "随时陪你练一场", me: "今天想从哪里聊起？", client: "最近就是……什么都不想做。" },
      { tag: "02 · AI SUPERVISOR", title: "AI 督导", sub: "引用你的原话，告诉你怎么改", quote: "你可以试试每天早点睡……", instead: "可以换成：", insteadText: "起不来的那些早上，你在想什么？" },
    ],
  },
  plan: {
    captions: [
      { at: 0.15, lines: ["现在，我们正在", "把它**设计**出来"] },
    ],
    // The design canvas: the team's 17 screens by name (claude.ai/artifact/UkqiioLoNiSB618ks8dPvg),
    // its row titles, who's on it, two comments.
    frames: [
      "O1 欢迎", "O2 先说清楚", "O3 准备开始", "H1 首页", "C1 病例库", "C2 病例简介",
      "S1 会谈", "R1 督导报告", "S2 结束会谈", "S1 来访者结束了会谈", "S1 出错状态", "X1 需要帮助？",
      "P1 设置", "P2 关于", "P3 隐私说明", "M1 练习记录", "M3 技能进度",
    ],
    newFrame: "新页面",
    rows: ["① 引导 · ② 选病例", "③ 会谈 · ④ 督导报告和求助", "⑤ 设置 · ⑥ 练习记录"],
    cursors: ["产品", "设计", "开发"],
    comments: ["来访者的气泡再柔和一点", "报告先说做得好的"],
  },
  road: {
    caption: ["六周", "把它做出来"],
    stops: [
      { date: "10.05", label: "提案" },
      { date: "10.10", label: "立项" },
      { date: "10.18", label: "首次演示" },
      { date: "圣诞前", label: "上线应用商店" },
    ],
    scope: "第一版：CBT · 两个病例 · 中英双语",
  },
  // Who it's for — the people who'll use it, not people we're looking for: on 小红书 nothing may
  // read as recruiting, and nothing points off the platform (../../BRAND.md).
  recruit: {
    caption: ["它是给", "**咨询师**练手的"],
    who: ["新手咨询师", "心理学学生", "督导老师", "想多练几场的你"],
    tag: "PRACTICE ONLY",
    cta: "练习工具，不是心理治疗",
  },
  end: {
    name: "聆镜 PSYGYM",
    logoNote: "标志设计中",
    with: "×",
    caption: "一起把它**做出来**",
    repo: "代码开源 · MIT",
    disclaimer: "练习工具，不是心理治疗。",
  },
  cover: {
    title: ["六周，把一个", "想法变成**现实**"],
    tag: "聆镜 PSYGYM · 立项",
  },
} as const;

/** All Chinese characters the video uses, for the font subset. */
export function allText(): string {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(copy);
  return strings.join("");
}
