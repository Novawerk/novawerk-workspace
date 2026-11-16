import { createContext, useContext } from "react";

// Every word on screen, in one place, in each language. **word** is set in the lilac-to-mint
// gradient. Facts: the project-psygym-workspace README (2026-11-15), the App Store listing,
// Haodong's post (2026-11-15) and the founder's own words. See BRIEF.md and ../../BRAND.md.
//
// en is the main film, for LinkedIn: it shows novawerk.ai (redirects to novawerk.io), as the 2026-10 English promo does.
// zh goes to 小红书: no web address anywhere, nobody asked to visit anything, nothing that reads as
// recruiting. The founder's subtitles there are his own Chinese words.

export type Lang = "en" | "zh";

const en = {
  hook: {
    chips: ["Oct 5 · Pitch", "Nov 15 · App Store"],
    caption: ["Six weeks.", "**Pitch to App Store.**"],
    captionSize: 100,
  },
  problem: {
    label: "THE PROBLEM",
    caption: ["New counselors", "need **practice**."],
    cards: [
      { icon: "?", title: "Nobody to practise with", sub: "You can't learn on real people." },
      { icon: "€", title: "Supervision is scarce", sub: "Long waits, and it costs a lot." },
    ],
  },
  client: {
    label: "01 · AI CLIENT",
    caption: ["Hold a session", "with an **AI client**."],
    chips: ["By voice or by text", "Every client is fictional"],
  },
  voice: {
    label: "01 · AI CLIENT · BY VOICE",
    caption: ["Practise **out loud**."],
    sound: "Sound on",
    you: "YOU · COUNSELOR",
    // The app's own two call states (strings.xml: voice_listening_you, voice_client_speaking).
    states: ["Listening to you", "The client is speaking"],
    // What is said in public/voice-call.mp3, word for word (timeline.ts VOICE).
    counselor: "Yes, I can hear you fine. So, what brings you here today?",
    lines: ["Honestly, I've just been really tired lately,", "like tired in my head, you know?"],
    note: "The AI client's answer is a real recording from PSYGYM's voice agent. The counselor's line is scripted, in a synthetic voice.",
  },
  supervisor: {
    label: "02 · AI SUPERVISOR",
    caption: ["Then a **supervisor**", "quotes you back."],
    callouts: [
      { title: "What went well", sub: "Your own words, and why they worked." },
      { title: "What to improve", sub: "What to try next time." },
    ],
  },
  road: {
    caption: ["Six weeks.", "**For real.**"],
    stops: [
      { date: "Oct 5", label: "Pitch" },
      { date: "Oct 10", label: "Kickoff" },
      { date: "Oct 17", label: "First demo" },
      { date: "Nov 15", label: "On the App Store" },
    ],
    handover: "Now handed over to its founding team.",
  },
  founder: {
    tag: "Founder · PSYGYM",
    lang: "In Chinese · English subtitles",
    // The founder's words, translated. One line per pause in the clip (timeline.ts FOUNDER.lines).
    lines: [
      "Hi, I founded PSYGYM, a project in the Novawerk community.",
      "Working with Novawerk was a real pleasure, in communication and in everything else.",
      "The people at Novawerk are professional, and they communicate efficiently.",
      "They helped us a lot, on the technical side and with where we go next.",
      "I hope Novawerk keeps growing, and that we work together again.",
      "Let's build more projects that make the world a little better.",
    ],
  },
  end: {
    with: "PSYGYM  ×",
    caption: ["No demos.", "**We ship.**"],
    pill: "novawerk.ai",
    footer: "PSYGYM is a practice tool for counselors, not therapy. Open source, MIT.",
  },
  cover: {
    tag: "PSYGYM × NOVAWERK",
    title: ["Six weeks.", "**Pitch to**", "**App Store.**"],
  },
};

export type Copy = typeof en;

const zh: Copy = {
  hook: {
    chips: ["10.05 · 提案", "11.15 · 上架 App Store"],
    caption: ["六周，", "**从提案到上架。**"],
    captionSize: 112,
  },
  problem: {
    label: "问题",
    caption: ["新手咨询师", "最缺**练习**。"],
    cards: [
      { icon: "?", title: "没人陪你练", sub: "总不能拿真来访者练手。" },
      { icon: "€", title: "督导难约", sub: "排队久，费用也高。" },
    ],
  },
  client: {
    label: "01 · AI 来访者",
    caption: ["和 **AI 来访者**", "做一次会谈。"],
    chips: ["语音、文字都可以", "所有来访者都是虚构的"],
  },
  voice: {
    label: "01 · AI 来访者 · 语音",
    caption: ["直接**开口**练。"],
    sound: "打开声音",
    you: "你 · 咨询师",
    states: ["在听你说", "来访者在说话"],
    // The recording is in English; these are its subtitles.
    counselor: "听得很清楚。那今天为什么想来聊聊？",
    lines: ["说实话，我最近真的很累，", "是脑子里的那种累，你懂吗？"],
    note: "来访者的回答是聆镜语音 Agent 的真实录音（英文）。咨询师这句是写好的台词，由合成声音朗读。",
  },
  supervisor: {
    label: "02 · AI 督导",
    caption: ["再由 **AI 督导**", "引用原话点评。"],
    callouts: [
      { title: "做得好的", sub: "你说的哪句话，好在哪里。" },
      { title: "可以改进的", sub: "下次可以怎么做。" },
    ],
  },
  road: {
    caption: ["六周，", "**做成真的。**"],
    stops: [
      { date: "10.05", label: "提案" },
      { date: "10.10", label: "立项" },
      { date: "10.17", label: "首次演示" },
      { date: "11.15", label: "上架 App Store" },
    ],
    handover: "现在已经交给创始团队继续运营。",
  },
  founder: {
    tag: "聆镜 PSYGYM 创始人",
    lang: "原声",
    // His own words, as he says them, one line per pause.
    lines: [
      "哈喽，我是 Novawerk 社群中聆镜项目的创始人。",
      "在整个合作过程中，聆镜和 Novawerk 不管是沟通也好、还是其他方面的协作也好，都非常愉快。",
      "Novawerk 的成员很专业，沟通也很高效，",
      "在技术层面和未来的发展层面，都给了我们非常大的帮助。",
      "希望 Novawerk 可以越做越好，希望我们在未来可以有更多的合作，",
      "一起做出更多可以让世界变得更好一点的项目。",
    ],
  },
  end: {
    with: "聆镜 PSYGYM  ×",
    caption: ["不做 demo，", "**只做真的。**"],
    pill: "代码开源 · MIT",
    footer: "聆镜 PSYGYM 是给咨询师的练习工具，不是心理治疗。",
  },
  cover: {
    tag: "聆镜 PSYGYM × NOVAWERK",
    title: ["六周，", "**从提案**", "**到上架。**"],
  },
};

export const copies: Record<Lang, Copy> = { en, zh };

/** The copy for the composition being rendered (Root wraps the zh shots in zh). */
export const CopyContext = createContext<Copy>(en);
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
