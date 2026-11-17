# Novawerk 101 · GitHub 是什么，怎么用它一起做事 · 2026-11

Novawerk 101 的第一条：给**不写代码的项目方**看的讲解片。共用规则见 `../../BRAND.md`，这里只写这条
视频自己的事。

- 起因（创始人，2026-11-17）：和项目方协作时发现，很多人不知道 GitHub 是什么，也不知道怎么操作。
- 给谁看：带着想法来的项目方和他们的伙伴，不写代码，第一次被邀请进一个仓库。
- 发在哪：直接发给项目方（微信等），放进 onboarding 材料；同一条也发小红书。
- 规格：中文，**3:4（1080×1440）**，97.5 秒，合成人声旁白加字幕，不出 9:16。
- 因为要发小红书：画面、字幕、发布文案里**不放任何网址**，窗口的地址栏不画；不引导、不招人。
- 成片：`out/github-101_3x4.mp4`；封面：`out/cover_3x4.png`；发布文案：`POST.md`。

## 看完要会的事（创始人选的）

1. **提需求和反馈**：注册账号、接受邀请、开一条 Issue、在下面回复。
2. **自己改文档、传材料**：网页上点铅笔改文件，Add file 上传，保存成一个 Pull request。

讲概念只用半分钟：GitHub 是一个网站，像项目的共享文件夹加一块留言板，谁改了什么都有记录；三个词
（Repository、Issue、Pull request）。

## 能用的事实

GitHub 的界面是英文的，片子里按钮都用英文原文，旁白用中文讲。下面的标签 2026-11-17 在 GitHub 网页上
核对过：

- Issues 页的 **New issue**；表单 **Create new issue**、**Add a title**、**Add a description**、
  **Create**、**Cancel**；Issue 下面 **Add a comment**、**Comment**；状态 **Open** / **Closed**。
- 文件页的铅笔（Edit this file）；编辑页 **Cancel changes**、**Commit changes...**；对话框
  **Commit changes**、**Commit message**，两个选项 *Commit directly to the main branch.* 和
  *Create a new branch for this commit and start a pull request.*
- **Add file** → **Upload files**；*Drag files here to add them to your repository*。
- **Open a pull request**、**Create pull request**；合并后 **Merged**。
- 接受邀请的按钮 **Accept invitation**。

界面是按真实布局画的示意（窗口右上角标「示意」），不是截图。仓库名 `novawerk / demo`、文件、Issue、
人（「你」「宁」「周」）都是编的，不对应真实项目和真实的人。

片子教的是「保存时选第二项，发起 Pull request，我们看过再合并」。有写权限的人也可以直接提交到 main，
片子不教这条路：让改动先被看一眼，是我们想要的协作方式。

## 不能说的（这条特有的）

- 不出现任何真实项目方、真实仓库里的内容。
- 不说 GitHub 是我们的，不用 GitHub 的图标；只写它的名字。
- 三个提醒里的第三条按原意说：公开的仓库谁都能看，隐私和密码别放。

## 旁白

- 稿子在 `narration.ts`，也是字幕。每一段是一个音频（`public/vo/<段>.mp3`）。
- 合成：ElevenLabs，`eleven_v3`，一个普通话男声（声音库里的现成音色，不是谁的克隆）。这个模型没有
  语速参数，合成后用 ffmpeg 加速到 1.12 倍（音高不变）。每个短语的起始时间用强制对齐量出来，写进
  `voice.ts`。脚本是 `scripts/tts.ts`，要 `ELEVENLABS_API_KEY`；音频和 `voice.ts` 都提交了，重新渲染
  不需要密钥。
- 时间轴跟着旁白走（`timeline.ts`）：每个镜头的长度是它的旁白长度，再延到下一拍，所以切镜仍在
  120 BPM 的拍子上。画面里的每个动作等的是旁白里对应的那个词。
- 发音只用语音识别反查过字句，没有人逐句听过；创始人 2026-11-17 听了试听版，说「差不多」。

## 视觉和声音

- **便签堆叠**（BRAND.md 的默认风格）：白底、墨黑边框的便签和窗口、绿色强调。一个画面一个强调色。
  Open 是绿色描边，Closed 和 Merged 是墨黑实心，不用 GitHub 的紫色和红色。
- 配乐代码合成，C 大调（C Am F G），120 BPM，压在人声下面（`Root.tsx` 里半音量）。每次便签落下、
  每次点击、每个打出来的字、关闭和合并都有音效。
- `kit/root.tsx` 为这条片子加了 `musicVolume`（默认 1，别的片子不受影响）。

## 定下来的事

1. 2026-11-17：创始人选了要教的两件事、发给项目方加小红书、一条约 90 秒、加合成人声旁白。
2. 2026-11-17：稿子合成出来是 86 秒人声，加上镜头之间的停顿，全片 97.5 秒。再压就要删内容或者念得
   太快，没有再压。
