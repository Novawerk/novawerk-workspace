// What the song says, and the words on screen as it is sung: the same, in each language. No
// imports (scripts/align.py reads it through Node).
//
// The film is a rap. The song (public/song/<lang>.mp3) was made by a music model from
// public/song/<lang>.plan.json: voice and beat together, so the words sit on the beat. The founder
// asked for it on 2026-11-17 after two spoken cuts ("音乐和词不对劲，也许可以用 rap"), and heard and
// approved the two songs. Change a word here and the song has to be made again, and it will be a
// different song (scripts/song.py). The Chinese last line was changed that way, at his request: the
// song's last section was made again and joined to the first 48 seconds (BRIEF.md, "歌").
//
// A segment is the stretch of the song under one shot. Its lines are the subtitle lines; each line
// is split into phrases, and every phrase gets a start time (voice.ts, from scripts/align.py), so a
// picture event can wait for the exact word. The two languages have the same segments and lines, one
// for one, and mostly the same phrases: timeline.ts points at a phrase by its position, and every
// phrase it points at is there in both. `say` is what is sung when
// it differs from what the subtitle shows.

export type Phrase = string | { show: string; say: string };
export type Segment = { id: string; lines: readonly (readonly Phrase[])[] };
export type Lang = "zh" | "en";

export const LYRICS: Record<Lang, readonly Segment[]> = {
  zh: [
    { id: "title", lines: [["Novawerk ", { show: "101", say: "一零一" }]] },
    { id: "hook", lines: [["需求埋在聊天记录里"], ["文件躺在谁的邮箱里"], ["最终版，", "最终版二，", "真的最终版"], ["最新那一份，", "到底在哪里"]] },
    { id: "what", lines: [["GitHub 说白了，", "就是个网站"], ["项目的文件夹，", "加一块留言板"], ["谁在哪一天，", "改了哪一段"], ["它全都记着，", "一条都不乱"]] },
    { id: "words", lines: [["三个词，", "记住就上路"], ["Repository，", "项目的仓库"], ["Issue，", "一件事，一条记录"], ["Pull request，", "改完先让大家过目"]] },
    { id: "agent", lines: [["现在有了 agent，", "不用自己点"], ["跟它说一句，", "Issue 就出现"], ["要改东西，", "让它提个 PR"], ["合并之前，", "大家先看一遍"]] },
    { id: "habits", lines: [["公开的仓库，", "隐私密码别乱放"], ["改错也别慌，", "每一版都存档"]] },
    { id: "close", lines: [["Novawerk ", { show: "101，", say: "一零一，" }, "今天就到这"], ["一起把想法，", "变成真的"]] },
  ],
  en: [
    { id: "title", lines: [["Novawerk ", { show: "101", say: "one-oh-one" }]] },
    { id: "hook", lines: [["The request is in a chat ", "from a week ago"], ["The file is in an email, ", "which one, I don't know"], ["Final, ", "final two, ", "really final, send"], ["Where's the latest version? ", "On the laptop of a friend"]] },
    { id: "what", lines: [["GitHub is a website, ", "nothing more to it"], ["A shared project folder ", "with a message board in it"], ["Who changed what and when, ", "it's all on record"], ["Every single version, ", "you can always check it"]] },
    { id: "words", lines: [["Three words ", "and you're good to go"], ["Repository, ", "that's the folder, so you know"], ["Issue, ", "one thing to do, one thread"], ["Pull request, ", "look first, then go ahead"]] },
    { id: "agent", lines: [["Got a coding agent? ", "Then you don't have to click"], ["Tell it what you want ", "and it opens issues quick"], ["Need a change? ", "Ask it for a PR"], ["We take a look, ", "then merge it, and there you are"]] },
    { id: "habits", lines: [["Public repo? ", "Keep your secrets out"], ["Made a mistake? ", "Every version's there, no doubt"]] },
    { id: "close", lines: [["Novawerk ", { show: "101, ", say: "one-oh-one, " }, "that's all for today"], ["Let's turn ideas ", "into something real"]] },
  ],
};

export const shown = (p: Phrase) => (typeof p === "string" ? p : p.show);
