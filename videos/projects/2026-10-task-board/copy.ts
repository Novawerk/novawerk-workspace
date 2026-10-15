// Every word on screen, in one place. **word** is highlighted in green.
// Facts only: BRIEF.md and the live board (api.novawerk.io/public/tasks, re-checked 2026-10-15:
// 18 open tasks; NW-3 the only merged block). No URLs anywhere (小红书).

export const copy = {
  // 1 · Hook D (the founder's lines; 「经过谨慎的讨论」 lives in the post title)
  d: {
    formTitle: "成员申请",
    line1: ["我们不再接受", "成员申请了"],
    line2: ["因为，", "**你已经是了。**"],
    stamp: "已关闭",
    stampSub: "CLOSED",
    // Each real open task once, untruncated.
    rows: [
      ["NW-9", "A finance agent", "XL"],
      ["NW-13", "A grants agent", "XL"],
      ["NW-11", "Sponsor discovery with real web search", "L"],
      ["NW-7", "A new tower each season in the builders scene", "L"],
      ["NW-15", "Evals for our agents", "L"],
      ["NW-14", "A translation agent", "L"],
      ["NW-5", "A newsletter archive at /newsletter", "M"],
      ["NW-8", "CONTRIBUTING in Chinese", "S"],
    ],
  },
  // 2 · Why (the founder's words, 2026-10-15)
  why: {
    plan1: "方案一：我们带着做",
    plan1Caption: ["我们不想用自己的想法，", "去规定大家怎么贡献。"],
    plan2: ["方案二：", "每人每周固定投入时间"],
    days: ["一", "二", "三", "四", "五", "六", "日"],
    plan2Caption: ["我们也不想让参与", "变得沉重。"],
  },
  // 3 · The idea: all 18 open tasks sort themselves into their areas (real ids and areas).
  idea: {
    caption: ["所以，我们做了一个", "**真正开放的社区**"],
    sub: "谁想做什么就做什么，我们来**整理和分发**需求。",
    // The 18 open tasks on the board (2026-10-15): id → title.
    titles: {
      "NW-20": "Show suggestion screenshots in the admin",
      "NW-19": "Real 404s for missing tasks and profiles",
      "NW-18": "Remove the dead join-mode code",
      "NW-16": "A partner pipeline board in the admin",
      "NW-15": "Evals for our agents",
      "NW-14": "A translation agent",
      "NW-13": "A grants agent",
      "NW-12": "Follow-ups for sponsor outreach",
      "NW-11": "Sponsor discovery with real web search",
      "NW-10": "Receipts in, ledger drafts out",
      "NW-9": "A finance agent",
      "NW-8": "CONTRIBUTING in Chinese",
      "NW-7": "A new tower each season in the builders scene",
      "NW-6": "Steadier idempotency for batched reply notices",
      "NW-5": "A newsletter archive at /newsletter",
      "NW-4": "Task board numbers in the admin metrics",
      "NW-2": "Sign one-click notice links with their own secret",
      "NW-1": "One max length for handles",
    },
    columns: [
      ["agents", ["NW-15", "NW-14", "NW-13", "NW-12", "NW-11", "NW-9"]],
      ["web", ["NW-19", "NW-18", "NW-7", "NW-5"]],
      ["admin", ["NW-20", "NW-16", "NW-10", "NW-4"]],
      ["api", ["NW-6", "NW-2", "NW-1"]],
      ["docs", ["NW-8"]],
    ],
  },
  // 3 · Trial run on our own site
  trial: {
    caption: ["先拿我们自己的官网，", "**试跑**一次。"],
    eyebrow: "Contribute",
    hero: ["Help build an", "AI-native", "community."],
    buttons: ["Find a task", "Set up your agent"],
    tasksCaption: ["任务板上现在有", "**18 个**开放任务"],
    tasksSub: "小到 1 Werk，大到 20 Werk",
    tasks: [
      ["NW-9", "A finance agent", "XL · 20 Werk"],
      ["NW-13", "A grants agent", "XL · 20 Werk"],
      ["NW-11", "Sponsor discovery with real web search", "L · 8 Werk"],
      ["NW-7", "A new tower each season in the builders scene", "L · 8 Werk"],
      ["NW-8", "CONTRIBUTING in Chinese", "S · 1 Werk"],
    ],
    flowCaption: ["挑一个，说说你的做法", "然后提一个 **PR**"],
    steps: ["用 GitHub 登录", "提一个方案", "成员选中一个", "提 PR，描述里写", "合并"],
    prLine: "Task: NW-11",
    werk: "+8 Werk",
    thanks: "合并后得到 Werk：**致谢**，不是钱",
    agentCaption: ["你的**编程 Agent**", "也能来"],
    agentSub: "它起草方案，提案由你确认才算数",
    waiting: "待你确认",
  },
  // 4 · The tower
  tower: {
    first: ["每合并一个任务，", "塔上多**一块砖**"],
    nw3: ["第一块砖：", "**NW-3**"],
    nw3Title: "Give the notices workflow room for a backlog",
    next: ["Novawerk 需要", "**你的帮助！**"],
    end: "Novawerk 任务板 · 代码开源 · MIT",
    brick: "NW-3",
  },
  illustration: "示意",
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
  return strings.join("");
}
