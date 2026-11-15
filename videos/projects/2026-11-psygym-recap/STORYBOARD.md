# 聆镜 PSYGYM 项目总结 · 分镜表

- 69.5 秒，30 fps，120 BPM（按半拍律动：一拍 15 帧，一小节 60 帧）；时间以 `timeline.ts` 为准，字幕以 `copy.ts` 为准
- 风格："B · 光感"（2026-11-15 从三个小样里选的，见 `sketches/`）：PSYGYM 的淡紫色夜空、毛玻璃标签、App 的真实界面放在浮动的 3D 手机里、标题关键词用淡紫到薄荷绿的渐变。组件在 `shots/glow.tsx`
- 手机里的画面是 App Store 商店页的真实截图（`assets/appstore-full.png` 裁出 `public/screen1–4.png`，页头 `public/appstore-header.png`）
- 原声素材 `public/founder.mp4` 不进仓库（.gitignore）：从微信收到的创始人视频（2026-11-13）0.25 s 起截 35.5 s，响度标准化到 -16 LUFS
- 配乐：B 小调（Bm7 Gmaj7 D A），开头是闪烁的琶音，中段半拍律动，创始人段只留很轻的长音，结尾落到 D 大调；每个玻璃标签出现时有一声"叮"，切镜是轻"嗖"

| # | 时间 | 画面 | 字幕（**粗体** = 渐变） |
|---|------|------|--------------------------|
| 1 | 0:00–0:03 | 首页截图在手机里从下方浮起、缓慢转动；两个玻璃标签 Oct 5 · Pitch、Nov 15 · App Store | Six weeks. **Pitch to App Store.** |
| 2 | 0:03–0:08 | 标签 THE PROBLEM；两张玻璃卡片 | New counselors need **practice**. · Nobody to practise with / You can't learn on real people. · Supervision is scarce / Long waits, and it costs a lot. |
| 3 | 0:08–0:15 | 两部手机：后面是病例简介，前面是会谈界面；两个标签 | Hold a session with an **AI client**. · By voice or by text · Every client is fictional |
| 4 | 0:15–0:21 | 督导报告界面；左边两张玻璃卡片 | Then a **supervisor** quotes you back. · What went well · What to improve |
| 5 | 0:21–0:28 | 发光的竖向时间线逐点亮起，最后一点是薄荷绿；App Store 页头截图滑入 | Six weeks. **For real.** · Oct 5 Pitch → Oct 10 Kickoff → Oct 17 First demo → Nov 15 On the App Store · Now handed over to its founding team. |
| 6 | 0:28–1:04.5 | 创始人原声视频裁成 3:4，放在带光晕的圆角框里；左上玻璃标签 Founder · PSYGYM，右下注明 In Chinese · English subtitles | 逐句英文字幕（见下表） |
| 7 | 1:04.5–1:09.5 | PSYGYM ×，星标坠落进 Novawerk 字标并发光；网址放在玻璃胶囊里 | No demos. **We ship.** · novawerk.ai（中文版：不做 demo，只做真的。· 代码开源 · MIT，不放网址）· PSYGYM is a practice tool for counselors, not therapy. Open source, MIT. |

## 创始人字幕（原声起止时间，秒）

| 原声 | 英文字幕 |
|------|----------|
| 0.4–5.4 | Hi, I founded PSYGYM, a project in the Novawerk community. |
| 6.1–13.7 | Working with Novawerk was a real pleasure, in communication and in everything else. |
| 14.3–17.0 | The people at Novawerk are professional, and they communicate efficiently. |
| 17.5–23.3 | They helped us a lot, on the technical side and with where we go next. |
| 24.0–31.9 | I hope Novawerk keeps growing, and that we work together again. |
| 32.5–35.4 | Let's build more projects that make the world a little better. |
