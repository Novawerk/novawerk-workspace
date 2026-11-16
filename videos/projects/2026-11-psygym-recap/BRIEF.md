# 聆镜 PSYGYM 项目总结 · LinkedIn · 2026-11

共用规则见 `../../BRAND.md`（能讲的事实、不能说的、视觉、声音）。这里只写这条视频自己的事。

- 平台和规格：LinkedIn，英文。3:4（1080×1440）主发，约 80 秒。领英上很多人静音刷视频，所以字幕全部烧进画面。
- 目标：让领英上的人看到 Novawerk 怎么把一个想法做成真东西：PSYGYM 从提案到上架 App Store，再交给创始团队。可以放网址，用 novawerk.ai（跳转到 novawerk.io，和 2026-10 英文宣传片一致）。中文版发小红书，不放网址。
- 给谁看：领英上关心 AI、开源、心理学教育和社区项目的人，包括潜在的合作方和贡献者。
- 要讲的事：
  1. 新手咨询师缺练习对象，也缺督导。
  2. PSYGYM 做两件事：AI 来访者陪你练，AI 督导引用你的原话给反馈。
  2b. 可以直接开口说：放一段语音会谈的真实录音（2026-11-16 加，见「语音段」）。
  3. 时间线：10.05 提案 → 10.10 立项 → 10.17 首次演示 → 11.15 上架 App Store，然后交给创始团队。
  4. 项目创始人亲口说合作的感受（原声，加英文字幕）。
- 成片：`out/psygym-recap_3x4.mp4`；封面：`out/cover_3x4.png`；帖子：`POST.md`

## 事实来源

- `project-psygym-workspace` 的 README（origin/main，2026-11-15）：Launched；10.17 MVP 首次演示；
  11.15 上架 App Store，Android 在 Play 内测；11 月交给创始团队，Novawerk 继续托管服务器；
  代码开源，MIT。
- `../2026-10-psygym/`：提案 10.05、立项 10.10，两个痛点，两件事。
- 创始人感谢视频（微信，2026-11-13），本人同意在领英使用。

## 这条视频额外不能说的

- 不说治疗、疗愈、陪伴，不说 "AI therapist"。只说练习工具；结尾写 "A practice tool, not therapy."
- 不说用户数、下载量、评分这些数字；不说"替代督导"。
- 产品画面用 App Store 商店页的真实截图（我们自己的上架页面），不画假界面，也不用录屏。
  语音段不放手机界面（通话页本来就不显示文字），画面是声音本身，加 App 里真实的两个通话状态文案。
- 创始人的话只用他原话的翻译，不加、不改意思。名字和头衔用他本人给的写法（没给就写 "Founder, PSYGYM"）。
- 英文禁词照 `../../BRAND.md`：leverage / ecosystem / stakeholders / synergy / disrupt / transform。
  "make the world a little better" 是创始人原话的翻译，可以出现在他的字幕里，不放进我们自己的字幕。

## 语音段（2026-11-16）

看过片子的人问「没有 Voice 功能吗」。语音是这个项目的亮点，所以在「AI 来访者」和「AI 督导」之间加了 10 秒。

- **来访者的回答是真的。** `public/voice-call.mp3` 来自和线上 AI 来访者（ElevenLabs 上的生产 agent，接生产后端）
  打的一通真实电话，英文，病例是 App 里的虚构病例。做法和 `project-psygym-workspace` 的
  `apps/api/scripts/voice-test/call.mjs` 一样：走 agent 的 WebSocket，把来访者的回答存下来。没有经过 App 本身；
  共打了两通，各两轮。
- **咨询师那句是写好的台词**，用合成声音（ElevenLabs TTS）念给 agent 听。没有真人咨询师，也没有真实对谈。
  画面底部写明这一点。
- **只截了一问一答。** 咨询师："Yes, I can hear you fine. So, what brings you here today?"，
  来访者回答的开头一句（字幕分两行）。来访者的回答没有改字，只在句子停顿处截断。两句之间的间隔是通话里实际的等待时间。
- 逐词时间（`timeline.ts` 的 `VOICE`）是对成品音轨做语音转文字得到的；每帧音量（`shots/voiceData.ts`）
  是从同一条音轨算的。
- 中文版用同一段英文录音，配中文字幕。要中文录音就按同样的办法用 `locale=zh` 再打一通。
- 通话页状态文案取自 App 的 `strings.xml`（`voice_listening_you`、`voice_client_speaking`）。
- **这一版成片是接出来的。** 创始人的原始视频（`public/founder.mp4`）不进仓库，2026-11-16 这台机器上也没有，
  所以 `out/` 里的两条片子是：前 38 秒按新时间轴重渲，后面的创始人段和片尾取自 2026-11-15 的成片，
  在切镜处接上。以后要整条重渲（`pnpm video 2026-11-psygym-recap render`），先把原始视频放回 `public/founder.mp4`。

## 定下来的事

1. 2026-11-15：用代码做产品介绍部分，不用另外找英文介绍视频。
2. 2026-11-15：创始人本人同意出镜。
3. 2026-11-15：原始视频不进公开仓库，只有成片进 `out/`。
4. 2026-11-15：结尾用 2026-10 英文宣传片已有的 "No demos. We ship."，不另写新口号。
5. 2026-11-15：不用 Novawerk 惯用的便签风格。做了三个开头小样（`sketches/`：杂志、光感、开发日志），选了 B 光感；配乐也重做（B 小调、半拍律动、玻璃音色）。
6. 2026-11-15：产品画面换成 App Store 截图（2 倍分辨率，`assets/`）。
7. 2026-11-15：领英文案按 Haodong 自己的中文帖子改写成英文（`POST.md`）。
