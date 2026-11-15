---
title: Product demo video
category: community
status: evolving
source:
  - project-psygym-workspace/docs/demo-script.md
updated: 2026-11-13
---

# Product demo video

一段 90 秒左右的产品演示视频：手机画面居中，配旁白和字幕，发小红书和 LinkedIn。
我们第一次做是 2026-11 给聆镜 PSYGYM 做的，下面的做法和脚本都来自那一次。
其他 App 项目照着改文案和剪辑点就能用。

适合放在 [#3 制作幕后](./README.md) 和 [#4 上线卡](./README.md) 里。

## 两个版本，不是一个版本加字幕

照 [Languages & audiences](./README.md#languages--audiences) 的规矩，中英文是两个母语版本：

| | 小红书 | LinkedIn |
|---|---|---|
| 尺寸 | 1080×1440（3:4） | 1080×1350（4:5） |
| App 界面 | 中文 | **英文** |
| 台词、旁白、字幕 | 中文 | 英文 |

LinkedIn 版要**单独用英文界面重录**，不能拿中文画面配英文字幕。

## 流程

1. **写分镜。** 7 个镜头：标题卡 → 首页和选内容 → 核心操作（加速）→ 一个亮点功能 → 一个关键动作 → 结果页 → 结尾卡。每个镜头一句旁白，一句不超过 12 秒。结尾卡写清楚这是什么、不是什么，再放网址。
2. **打连生产的包。** 用真数据、真模型录，不用演示数据。iOS 模拟器包要用本地签名打（`CODE_SIGN_IDENTITY=-`），不能 `CODE_SIGNING_ALLOWED=NO`：没签名的包用不了钥匙串，登录会失败。
3. **准备模拟器。** 系统语言和键盘切成目标语言（改 `.GlobalPreferences` 后重启），状态栏固定成 9:41、满电（`simctl status_bar`），用演示账号登录。登录这一步由账号负责人自己输验证码，画面里不出现邮箱和邀请码。
4. **清空本地记录。** 录第二个语言之前，先把上一遍留在 App 里的记录删掉，不然 App 会把它当成续集。
5. **自动操作，同时录屏。** `xcrun simctl io <device> recordVideo` 录屏；[Maestro](https://maestro.mobile.dev) 按脚本点按、打字、等回复。iOS 上 Maestro 能输入中文。`simctl` 自己不能点击和打字；idb 只能打 ASCII；后台的辅助功能写值进不了 Compose 输入框。
6. **配音和音乐。** ElevenLabs 每句生成一段 mp3（`eleven_multilingual_v2`），背景音乐用 `/v1/music` 生成一段纯器乐。
7. **定剪辑点，合成。** 每隔 4 秒截一帧拼成接触表，先找大致位置，再按 1 秒精度确认。把剪辑点写进 `SEGS`（起点、终点、倍速），跑 `render.py`。加速的片段在手机旁边标上「4× 加速」。
8. **检查。** 每个镜头抽一帧看；响度在 -16 LUFS 左右。

## 工具和脚本

都在 [`demo-video/`](./demo-video/)：

| 文件 | 做什么 |
|---|---|
| `flows/demo_zh.yaml`、`flows/demo_en.yaml` | Maestro 主流程：选病例 → 7 句台词 → 中途督导 → 结束 → 滚动看报告 |
| `flows/turn_*.yaml` | 一轮对话：输入、发送、等输入框重新可用（来访者回完） |
| `flows/pause.yaml` | 停顿（等一个不存在的元素，`optional`） |
| `flows/reset.yaml` | 删掉 App 里的全部练习记录 |
| `vo.py` | ElevenLabs 生成每句旁白 |
| `render.py` | 剪辑、变速、圆角手机画面、标题卡、字幕、加速标记、混音、导出 |

本机要有：Xcode、ffmpeg、Python 和 Pillow、Maestro（`brew install mobile-dev-inc/tap/maestro`，需要 Java）。
跑 Maestro 前设 `MAESTRO_CLI_NO_ANALYTICS=1`。ElevenLabs 的 key 从环境变量读，不写进文件。

## 范例：聆镜 PSYGYM（2026-11）

- **画面：** iPhone 17 Pro 模拟器，Release 包，连 `psygym-api.novawerk.io`。病例小陈，初次会谈。
- **台词：** 照项目里 `docs/demo-script.md` 的路线 A 缩成 7 句，故意放一句新手常犯的错（替来访者下结论），看督导报告能不能抓到。两次录制，报告都抓到了。
- **配音：** 中文 Amy，英文 Sarah。
- **成片：** 两个版本都约 98 秒。

**分镜**

| 镜头 | 画面 | 中文旁白 | English voiceover |
|---|---|---|---|
| 1 | 标题卡 | 新手咨询师最缺两样东西：练习的机会，和督导。 | New counselors need two things they rarely get: practice, and supervision. |
| 2 | 首页 → 病例简介 | 聆镜让你随时和 AI 来访者谈一场。选一个病例，先看清这次要练什么。 | With PSYGYM, you practise with an AI client, any time. Pick a case, and see what this session is for. |
| 3 | 五轮对话（5× 加速） | 来访者由 AI 扮演，会犹豫，会回避，也会被你的话打动或刺痛。你就像在真实的初次会谈里一样，提问，倾听。 | The client hesitates, avoids, and reacts to what you say, just like a real first session. You ask. You listen. |
| 4 | 中途督导提示 | 卡住了？会谈中途，就能看一眼督导的提示。 | Stuck? Check a quick hint from the supervisor, mid-session. |
| 5 | 风险筛查那一句 | 该问的风险，也要问出口。 | And ask the hard question about safety. |
| 6 | 督导报告 | 结束后，AI 督导引用你的原话，告诉你哪里做得好，哪句可以换个说法，下次练什么。 | When you finish, an AI supervisor quotes your own words back: what worked, what to say instead, and what to practise next. |
| 7 | 结尾卡 | 聆镜 PSYGYM，开源，正在内测。这是训练工具，不是心理治疗。 | PSYGYM is open source, and in beta. It's a training tool, not therapy. |

**小红书文案**

标题：新手咨询师的练习场｜和 AI 来访者练一场初次会谈

> 刚入行的咨询师，最缺的是练习和督导。
> 我们做了聆镜 PSYGYM：AI 扮演来访者，你练一场初次会谈；结束后 AI 督导引用你的原话，告诉你哪里做得好、哪句可以换个说法。
> 来访者都是虚构的。这是训练工具，不是心理治疗。
> 项目开源，正在内测。想试试的咨询师和督导，留言或私信我们。
>
> #心理咨询师 #心理学 #CBT #咨询师成长 #AI

**LinkedIn 文案**

> New counselors need practice and supervision. Both are hard to get.
>
> We're building 聆镜 PSYGYM with a team of psychologists. An AI plays the client, you run a first session, and an AI supervisor quotes your own words back with feedback: what worked, what to say instead, what to practise next.
>
> Every client is fictional. It's a training tool, not therapy. Open source, in beta now, part of Novawerk.
>
> Counselors and supervisors who'd like to try it: send us a message.
>
> psygym.novawerk.io

## 踩过的坑

- 没签名的 iOS 模拟器包：服务器返回 200，App 存不进钥匙串，用户再点一次就变成「验证码失效」。
- 后台模式点不进 Compose 输入框；接管整块屏幕又会和人抢鼠标。用 Maestro。
- 粘贴会触发 iOS「允许粘贴」弹窗，录进画面很难看。用 Maestro 的 `inputText`。
- 模拟器默认键盘跟着系统地区走（我们遇到的是德语），录之前换成拼音或英文。
- `simctl` 录的是可变帧率，合成前先 `fps=60` 再变速，再统一到 30 fps。
- 本机 ffmpeg 没有 `drawtext`，字幕和卡片用 Pillow 画成 PNG 再叠上去。

## Related

- [Promotion playbook](./README.md) —— 六类帖子和平台分发
- [Post templates](./post-templates.md) —— 帖子的固定字段
- [Visual assets](./visual-assets.md) —— 配图和尺寸
- [Launch checklist](./launch-checklist.md) —— 上线日时间线
- [Brand voice](../../brand/voice.md)
