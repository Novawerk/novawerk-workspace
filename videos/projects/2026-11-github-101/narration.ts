// What the voice says, and the subtitles: the same words. No imports (scripts/tts.ts and
// timeline.ts read it under plain Node).
//
// A segment is one request to the speech model and one audio clip (public/vo/<id>.mp3). Its lines
// are the subtitle lines; each line is split into phrases, and every phrase gets a start time
// (voice.ts), so a picture event can wait for the exact word. `say` is what the model reads when
// it differs from what the subtitle shows.

export type Phrase = string | { show: string; say: string };

export const NARRATION: readonly { id: string; lines: readonly (readonly Phrase[])[] }[] = [
  { id: "hook", lines: [["需求在聊天记录里，", "文件在邮箱里。"], ["最新的那一版，", "在谁的电脑里？"]] },
  { id: "what1", lines: [["我们把项目的所有东西，"], ["放在一个地方：", "GitHub。"]] },
  {
    id: "what2",
    lines: [["它是个网站，", "浏览器打开就能用。"], ["像共享文件夹，", "加一块留言板。"], ["谁改了什么，", "都有记录。"]],
  },
  {
    id: "words",
    lines: [["先认三个词。"], ["Repository，仓库，", "项目的文件夹。"], ["Issue，", "一件要做的事。"], ["Pull request，一次改动，", "看过再放进去。"]],
  },
  { id: "start", lines: [["先注册一个免费账号，"], ["把用户名告诉项目伙伴，"], ["在邮件里接受邀请。"]] },
  {
    id: "issue1",
    lines: [["有需求、有问题，", "就开一条 Issue。"], ["点 New issue，", "标题一句话说清，"], ["下面写想要什么、为什么，"], ["截图可以直接贴。"]],
  },
  { id: "issue2", lines: [["之后的讨论，", "都在这条下面回复。"], ["做完了，", "它会被关掉。"]] },
  { id: "edit1", lines: [["想改文档，", "点文件右上角的铅笔。"], ["改完点 Commit changes，", "写一句改了什么。"]] },
  { id: "edit2", lines: [["要传材料，", "点 Add file，", "把文件拖进去。"]] },
  { id: "pr", lines: [["保存时选下面那一项，", "再点 Create pull request。"], ["我们看过，", "就合并进去。"]] },
  {
    id: "habits",
    lines: [["一件事，开一条。"], ["改错了不怕，", "每一版都找得回来。"], ["公开的仓库谁都能看，", "隐私和密码别放。"]],
  },
  { id: "close", lines: [[{ show: "这就是 Novawerk 101。", say: "这就是 Novawerk 一零一。" }], ["一起把想法做成真的东西。"]] },
];

export const shown = (p: Phrase) => (typeof p === "string" ? p : p.show);
export const said = (p: Phrase) => (typeof p === "string" ? p : p.say);
