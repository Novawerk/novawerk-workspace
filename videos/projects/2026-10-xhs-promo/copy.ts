import { createContext, useContext } from "react";

// Every word on screen, in one place, in each language. **word** is highlighted in green.
// Facts only from knowledge/ and novawerk.io — see videos/BRAND.md. The English is written for
// English readers, not translated line by line; a few layout numbers differ because the lines do.
//
// The Chinese version goes to 小红书, which limits notes that show a web address or send people
// off the platform. So zh shows no URL anywhere (the address bar, subtitles, the end card) and asks
// nobody to visit anything; en (LinkedIn, Instagram) keeps novawerk.io.

export type Lang = "zh" | "en";

const zh = {
  lang: "zh" as Lang,
  hook: {
    caption: ["想法一直", "躺在**备忘录**里？"],
    // Ideas behind our projects, then ones the community is kicking around
    // (knowledge/projects/overview.md, "Incubation").
    pile: [
      "柏林哪家中餐靠谱？",
      "一个不卖我数据的经期 App",
      "提醒我爸按时量血压",
      "攀岩线路可视化",
      "德国华人的故事",
      "AI 帮我看车",
      "找个不挤的地方办公",
      "附近哪儿鸡胸肉最便宜",
    ],
    spread: 430, // how far right a note may land, px
    pileSize: 50,
  },
  intro: {
    caption: ["一个给早期想法的", "**开放工作坊**"],
    sub: "非营利 · 我们帮想法迈出第一步",
    // novawerk.io, the home page hero, as shipped (apps/web/app/page.tsx). No address on 小红书.
    site: {
      url: "",
      eyebrow: "An open workshop for early ideas.",
      headline: "We help ideas take their first step.",
      buttons: ["Submit a project", "Join Novawerk"],
    },
  },
  pitch: {
    captions: [
      { at: 0, lines: ["有想法？", "**说出来**就行"] },
      { at: 2.5, lines: ["AI 陪你把它写成", "一份 **pitch**"] },
    ],
    sub: "说中文也可以",
    // The /submit chat, drawn: its header and panel labels are the site's own.
    header: "Submit a project",
    intro: "Tell us about your idea. We draft the pitch with you.",
    message: "我想做个 App，提醒我爸按时量血压，还能把记录发给医生",
    reply: "好主意。你爸现在是怎么记血压的？",
    panel: "Your pitch",
    total: 8,
    fields: [
      { label: "Project name", value: "Blood pressure reminder" },
      { label: "Product", value: "Reminds Dad to measure, logs it, shares it with his doctor." },
      { label: "User journey", value: "Reminder → measure → saved → the doctor sees the trend." },
      { label: "References and what's new", value: "Other apps only log. This one reminds, and shares." },
      { label: "Team", value: "You, plus a developer and a designer from Novawerk." },
    ],
  },
  team: {
    ask: ["一个人", "做不完？"],
    // Who builds with you — the team as the founders describe it (no company names).
    crewCaption: ["和你搭档的", "是**这些人**"],
    crew: [
      { tag: "AI", title: "资深 AI 工程师" },
      { tag: "PRODUCT", title: "亲切的产品经理" },
      { tag: "FOUNDER", title: "曾经的创业者" },
      // The headliner: lands last, biggest, in green, with the robot parade.
      { tag: "24 / 7", title: "不眠不休的 Agent" },
    ],
    crewSize: 84,
    headlinerSize: 104,
    roleSize: 40,
    // One word a beat, with a pause each, before the Agent lands.
    aside: ["当然，", "还有"],
    partners: "还有一起做的伙伴",
    roles: ["设计", "开发", "研究", "产品", "运营", "宣传"],
    close: "和你一起，把想法做成**真的产品**",
  },
  real: {
    caption: ["不做 demo，", "做**真的**东西"],
    steps: [
      { n: "01", label: "验证" },
      { n: "02", label: "拆解" },
      { n: "03", label: "协作" },
      { n: "04", label: "真正交付" },
    ],
    // The portfolio on novawerk.io (title, tagline, year); both are launched.
    projects: [
      { title: "YIMA", tagline: "Privacy-first period calendar.", status: "Launched", year: "2026", line: "YIMA · 注重隐私的经期日历 · **已上线**" },
      { title: "Berlin Chinese Food Map", tagline: "A community-curated guide to eating well in Berlin.", status: "Launched", year: "2026", line: "柏林中餐地图 · 社区一起维护 · **已上线**" },
    ],
    lineSize: 52,
    stepSize: [64, 84],
  },
  next: {
    lead: "我们的新项目即将开始",
    leadSize: 76,
    label: "NEXT PROJECT",
    name: "聆镜 PSYGYM",
    sub: "AI 陪新手心理咨询师练习，代码开源",
  },
  cover: {
    title: ["想法别再", "躺在**备忘录**里"],
    size: 150,
    tag: "和你一起，把想法做成真的产品",
  },
  cta: {
    caption: ["下一个", "可以是**你的想法**"],
    // The end card's black block: the address in English, who we are on 小红书.
    pill: "非营利 · 开放工作坊",
  },
};

export type Copy = typeof zh;

const en: Copy = {
  lang: "en",
  hook: {
    caption: ["Ideas stuck", "in your **notes**?"],
    pile: [
      "Good Chinese food in Berlin?",
      "A private period app",
      "Remind Dad: blood pressure",
      "Bouldering route visualizer",
      "Stories of Chinese in Germany",
      "AI that helps me buy a car",
      "A quiet place to work",
      "Cheapest chicken breast nearby",
    ],
    spread: 60,
    pileSize: 42,
  },
  intro: {
    caption: ["An open workshop", "for **early ideas**"],
    sub: "Non-profit · Open by default",
    site: { ...zh.intro.site, url: "novawerk.io" },
  },
  pitch: {
    captions: [
      { at: 0, lines: ["Got an idea?", "Just **say it**"] },
      { at: 2.5, lines: ["AI helps you write", "the **pitch**"] },
    ],
    sub: "novawerk.io/submit · in any language",
    header: zh.pitch.header,
    intro: zh.pitch.intro,
    message: "An app that reminds Dad to check his blood pressure",
    reply: "Good one. How does he keep track today?",
    panel: zh.pitch.panel,
    total: zh.pitch.total,
    fields: zh.pitch.fields,
  },
  team: {
    ask: ["Too big", "to build alone?"],
    crewCaption: ["You build it", "**with us**"],
    crew: [
      { tag: "AI", title: "Senior AI engineer" },
      { tag: "PRODUCT", title: "A friendly PM" },
      { tag: "FOUNDER", title: "A former founder" },
      { tag: "24 / 7", title: "Tireless AI agents" },
    ],
    crewSize: 78,
    headlinerSize: 92,
    roleSize: 28,
    aside: ["And,", "of course,"],
    partners: "Plus everyone building with us",
    roles: ["Design", "Dev", "Research", "Product", "Ops", "Comms"],
    close: "Let's make it **real**.",
  },
  real: {
    caption: ["No demos.", "We **ship**."],
    steps: [
      { n: "01", label: "Validate" },
      { n: "02", label: "Break down" },
      { n: "03", label: "Collaborate" },
      { n: "04", label: "Ship for real" },
    ],
    projects: [
      { ...zh.real.projects[0]!, line: "YIMA · privacy-first · **Live**" },
      { ...zh.real.projects[1]!, line: "Berlin Chinese Food Map · **Live**" },
    ],
    lineSize: 48,
    stepSize: [54, 66],
  },
  next: {
    lead: "Our next project starts soon",
    leadSize: 60,
    label: "NEXT PROJECT · OPEN SOURCE",
    name: "PSYGYM",
    sub: "AI practice for new counsellors",
  },
  cover: {
    title: ["Ideas stuck", "in your **notes**?"],
    size: 112,
    tag: "We build them with you, for real",
  },
  cta: {
    caption: ["Your idea", "could be **next**"],
    pill: "novawerk.io",
  },
};

export const copies: Record<Lang, Copy> = { zh, en };

/** The copy for the composition being rendered (Root wraps each language's shots). */
export const CopyContext = createContext<Copy>(zh);
export const useCopy = () => useContext(CopyContext);

/** Every character the video puts on screen, in both languages, for the font subset. */
export function allText(): string {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(copies);
  return strings.join("");
}
