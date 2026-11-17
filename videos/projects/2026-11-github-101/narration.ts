// What the voice says, and the subtitles: the same words, in each language. No imports
// (scripts/tts.py reads it through Node, timeline.ts under plain Node).
//
// A segment is one request to the speech service and one clip (public/vo/<lang>/<id>.mp3). Its
// lines are the subtitle lines; each line is split into phrases, and every phrase gets a start time
// (voice.ts), so a picture event can wait for the exact word. The two languages have the same
// segments, lines and phrases, one for one: timeline.ts points at a phrase by its position.
// `say` is what the voice reads when it differs from what the subtitle shows.
//
// The register is someone talking, not reading (the founder, 2026-11-17: 「非常非常口语化」, like a
// podcast: "Welcome to Novawerk 101, basic stuff that gets you to work with Novawerk").

export type Phrase = string | { show: string; say: string };
export type Segment = { id: string; lines: readonly (readonly Phrase[])[] };
export type Lang = "zh" | "en";

export const NARRATION: Record<Lang, readonly Segment[]> = {
  zh: [
    { id: "hook", lines: [["需求在聊天记录里，", "文件在邮箱里，"], ["最新那一版，", "到底在谁电脑里？"]] },
    {
      id: "welcome",
      lines: [
        [{ show: "嗨，欢迎来到 Novawerk 101。", say: "嗨，欢迎来到 Novawerk 一零一。" }],
        ["这个系列就讲最基本的东西，", "看完你就能跟 Novawerk 一起做项目了。"],
        ["今天聊聊 GitHub，", "还有我们平时怎么用它。"],
      ],
    },
    {
      id: "what",
      lines: [["GitHub 说白了，", "就是一个网站。"], ["你可以把它当成项目的共享文件夹，", "再加一块留言板。"], ["谁、什么时候、改了什么，", "它全都记着。"]],
    },
    {
      id: "words",
      lines: [
        ["你只要认识三个词。"],
        ["Repository，仓库，", "就是这个项目的文件夹。"],
        ["Issue，", "就是一件要做的事：一个需求、一个问题都算。"],
        ["Pull request，简称 PR，", "意思是：我改了点东西，你们看一眼，没问题再放进去。"],
      ],
    },
    { id: "start", lines: [["怎么开始？", "先注册个账号，免费的。"], ["把用户名发给项目里的伙伴，"], ["再去邮箱里点一下接受邀请。", "完事。"]] },
    {
      id: "agent",
      lines: [
        ["接下来这步最省事。"],
        ["现在很多人手边都有 coding agent 了，", "Claude Code、Codex 都行。"],
        ["所以你基本不用自己在 GitHub 上点来点去，", "跟它说人话就行。"],
        ["第一次用，先让它连上你的 GitHub 账号，", "它会一步步告诉你怎么弄。"],
      ],
    },
    {
      id: "issue",
      lines: [
        ["比如你想提个需求，", "就跟它说："],
        ["帮我开个 Issue：首页加一个常见问题的入口，", "因为大家老在问同样的事。"],
        ["它就帮你开好了。", "记得把想要什么、为什么说清楚。"],
        ["之后所有的讨论，都在这条 Issue 下面聊。", "做完了，这条就关了。"],
      ],
    },
    {
      id: "pr",
      lines: [
        ["想改东西也一样。", "你说："],
        ["把常见问题里收费那条，改成不收费，", "再把这两个文件放进去，", "提个 PR，让大家先看看。"],
        ["它改完，会给你一个 Pull request。"],
        ["我们看一眼，", "没问题就合并进去。"],
      ],
    },
    {
      id: "habits",
      lines: [["最后记三件事。"], ["一件事开一条 Issue，别混着说。"], ["要改东西，都让它提 PR。", "改错了也不怕，每一版都找得回来。"], ["还有，公开的仓库谁都能看，", "隐私和密码千万别往里放。"]],
    },
    {
      id: "close",
      lines: [[{ show: "好，这就是今天的 Novawerk 101。", say: "好，这就是今天的 Novawerk 一零一。" }], ["我们一起，把想法做成真的东西。"], ["下次见。"]],
    },
  ],
  en: [
    { id: "hook", lines: [["The request is somewhere in a chat. ", "The file is in someone's inbox. "], ["And the latest version? ", "No idea whose laptop that's on."]] },
    {
      id: "welcome",
      lines: [
        [{ show: "Hey, welcome to Novawerk 101. ", say: "Hey, welcome to Novawerk one-oh-one. " }],
        ["The basic stuff ", "that gets you working with Novawerk. "],
        ["Today I'm gonna talk about GitHub, ", "and how we use it."],
      ],
    },
    {
      id: "what",
      lines: [["So, GitHub. ", "Really, it's just a website. "], ["Think of it as a shared folder for your project, ", "with a message board on top. "], ["Who changed what, and when: ", "it remembers all of it."]],
    },
    {
      id: "words",
      lines: [
        ["You only need three words. "],
        ["Repository: ", "that's the project's folder. "],
        ["Issue: ", "one thing that needs doing. A request, a bug, a question. "],
        ["Pull request, or PR: ", "I changed something. Take a look, and if it's good, put it in."],
      ],
    },
    { id: "start", lines: [["Getting in is easy. ", "Make a free account. "], ["Send your username to whoever you're working with. "], ["Then accept the invite in your email. ", "Done."]] },
    {
      id: "agent",
      lines: [
        ["Now, here's the thing. "],
        ["A lot of us have a coding agent these days. ", "Claude Code, Codex, whatever you like. "],
        ["So you barely need to click around GitHub yourself. ", "You just tell the agent. "],
        ["The first time, let it connect to your GitHub account. ", "It'll walk you through it."],
      ],
    },
    {
      id: "issue",
      lines: [
        ["Say you want to ask for something. ", "You tell it: "],
        ["Open an issue: add an FAQ link to the home page, ", "because people keep asking the same things. "],
        ["And it's done. ", "Just say what you want, and why. "],
        ["After that, the whole conversation lives under that issue. ", "When the work is done, it gets closed."],
      ],
    },
    {
      id: "pr",
      lines: [
        ["Changing things works the same way. ", "You say: "],
        ["Change the pricing answer in the FAQ to: it's free, ", "add these two files, ", "and open a PR, so people can look first. "],
        ["It makes the change, and hands you a pull request. "],
        ["We take a look, ", "and if it's good, we merge it."],
      ],
    },
    {
      id: "habits",
      lines: [["Three things to remember. "], ["One thing, one issue. Don't mix them. "], ["Every change goes through a PR. ", "And don't worry about breaking stuff: every version is saved. "], ["And public repos are public: ", "no private data, no passwords."]],
    },
    {
      id: "close",
      lines: [[{ show: "And that's Novawerk 101 for today. ", say: "And that's Novawerk one-oh-one for today. " }], ["Let's turn ideas into something real, together. "], ["See you next time."]],
    },
  ],
};

export const shown = (p: Phrase) => (typeof p === "string" ? p : p.show);
export const said = (p: Phrase) => (typeof p === "string" ? p : p.say);
