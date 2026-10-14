---
title: Post templates
category: community
status: evolving
updated: 2026-10-11
---

# Post templates

六类帖子的固定字段 + 示例。字段用 `<…>` 标注，示例用真实项目
（[YIMA](../../projects/overview.md)、[柏林中餐地图](../../projects/overview.md)）演示。

写之前先看一遍 [Brand voice](../../brand/voice.md)：直接、平白、
用「我们」，避免 leverage / ecosystem / stakeholders。

## Bilingual approach

每一类帖子都需要**中英双语版本**（除 #2 进展和 #5 十天反馈 —— 节奏太密，
英文版可以月度合并）。不是直译，而是用各自语言里最自然的说法说同一件事。

- **中文版** → 小红书（主）、Discord `#cn`、中文 Newsletter
- **英文版** → LinkedIn（主）、GitHub、英文 Newsletter、官网 blog
- 双语都写 → Discord 全频道、双语 Newsletter

英文版的语气提示：
- 比中文版更克制 —— LinkedIn 受众对"营销腔"敏感
- 仍然避开 leverage / ecosystem / stakeholders / synergy / disrupt
- "Wish / wished by" 这套术语保持英文原词，不要换成 idea / proposed by ——
  这是 Novawerk 的方法论用词

## 小红书：不露网址，不引导

小红书会限流露出网址、或者把人往站外引的笔记（引导式内容）。2026-10-10 我们第一条宣传视频
就因为这个被限流（[videos/BRAND.md](../../../videos/BRAND.md)）。所以**中文版只要发小红书**：

- 正文、标题、卡片里都**不放网址和邮箱**：没有 novawerk.io、项目链接、GitHub、info@。
- **不引导去站外**：不写「点链接」「去官网」「私信加群」「加 Discord」。
- 英文版放链接的地方，中文版改说**我们是谁、接下来做什么**，或者请大家**在评论区留言**。
- 3:4 的卡片（小红书用的尺寸）不印 novawerk.io。

英文版（LinkedIn、GitHub）和只发 Discord `#cn` 的中文帖可以留链接。promo agent 会照这条写；
它漏掉的链接会变成 【待补充：去掉网址】，改完才能 approve。`pnpm post check` 也会拦。

下面每个模版里，立项卡（①）和上线卡（④）给出完整中英示例；
其他类型按相同结构改写即可。

---

## ① 立项卡

宣布愿望 + 公开招募 Builder。

### 固定字段
- **标题**：`Novawerk 又有人许愿了 · <项目名>`
- **第一句**：愿望是什么 + 为什么有意思
- **许愿人（Initiator）**：名字 / 一句话身份
- **首个交付**：产物 · 责任人 · 完成标志 · 截止日
- **招募**：需要的角色 + 技能
- **CTA**：怎么加入。中文版：在评论区说说你能做什么；英文版：留言 / 邮件 / Discord
- **尾签**：一句 Novawerk 是什么

### 中文示例（柏林中餐地图）

> 🌟 Novawerk 又有人许愿了 · 柏林中餐地图
>
> 在柏林想吃口靠谱的中餐，每次都要在朋友圈问一圈。
> 有没有一份由真实吃过的人维护的地图？
>
> 许愿人：Min Z.（在柏林住了 6 年）
>
> 首个交付：
> · 产物 —— 20 家店的种子清单（菜系、人均、一句话评价）
> · 责任人 —— Yu
> · 完成标志 —— 在 Notion 上公开可访问
> · 截止 —— 5 月 30 日
>
> 招募：
> · 1 位 Builder：写过 Next.js，之后做地图前端
> · 2-3 位 Supporter：住在柏林、愿意写两句真实评价
>
> 想加入？在评论区说说你能做什么，我们来找你。
>
> ——
> Novawerk 是一个非盈利社区，我们一起把愿望做成真的东西。

### English example (Berlin Chinese Food Map)

> 🌟 Someone wished for it · Berlin Chinese Food Map
>
> Finding decent Chinese food in Berlin shouldn't require
> crowdsourcing your circle every weekend. We're building a map
> maintained by the people who actually eat at these places.
>
> Wished by: Min Z. (6 years in Berlin)
>
> First deliverable:
> · Artifact — Seed list of 20 restaurants (cuisine, price, one-line review)
> · Owner — Yu
> · Done when — Public, accessible on Notion
> · By — 30 May
>
> We're looking for:
> · 1 Builder who's shipped Next.js — for the map frontend
> · 2-3 Supporters in Berlin willing to write honest two-liners
>
> Join us: comment / info@novawerk.io / Discord
>
> ——
> Novawerk is a non-profit community. We turn community wishes
> into real, working things.

---

## ② 进展帖（每 2 周）

兑现 open-by-default —— 让没参与的人也能跟上。

### 固定字段
- **标题**：`<项目名> · 第 N 周进展`
- **完成了哪个交付**：产物 + 谁交付的
- **新加入的人**：点名欢迎
- **一个开放性叙事**：一个小困难 / 一个小决定（这条决定帖子的「人味」）
- **下一个交付**

### 示例（柏林中餐地图）

> 柏林中餐地图 · 第 3 周进展
>
> 完成：
> · 20 家店种子清单上线（Yu 交付）
> · 地图前端原型跑通（Jiawei 交付）
>
> 新加入：欢迎 Lin —— 之前做食评公众号，加入做内容审核
>
> 这周的小困难：
> 20 家变成 60 家之后，「什么算靠谱」开始有分歧。
> 有人想要米其林口味，有人想要「半夜两点能吃到的炒饭」。
> 我们决定不合并，做两个 tag —— 让用户自己挑。
>
> 下一个交付：
> · 产物 —— 评价 tag 系统（最多 5 个 tag/店）
> · 责任人 —— Lin
> · 完成 —— 60 家店都打上 tag
> · 截止 —— 6 月 13 日

---

## ③ 制作幕后（上线前 1-2 周）

给上线日预热，让「团队」具体起来变成「人」。

### 固定字段
- **标题**：`在 <项目名> 上线之前，先聊聊它是怎么长出来的`
- **过程素材**：2-3 张截图 / 录屏 / 手稿
- **一个取舍故事**：我们差点做了 X，后来选了 Y
- **制作团队人物卡**：2-4 人，每人一句话
- **上线预告日期**

---

## ④ 上线卡 ⭐（核心）

告诉世界这件事做成了。宣发的高峰节点。

### 固定字段
- **标题**：`Novawerk 新项目上线 · <项目名>`
- **项目名 + 一句话定位**
- **愿望功能介绍**：用户视角，不是 feature list
- **许愿人**
- **制作团队**
- **一句 Novawerk 是什么**
- **CTA**：「下一个就是你 ——」。中文版：请大家在评论区说说自己的愿望；英文版：许愿入口
  （novawerk.io/submit）
- **项目链接**：只在英文版。中文版说它叫什么、在哪儿能搜到（例如应用商店里的名字），不放网址

### 中文示例（YIMA）

> 🌟 Novawerk 新项目上线 · YIMA
>
> 一个把利润排除在外的经期日历。
>
> 许愿来自 <Initiator>：
> 「用了五年付费经期 app，有一天发现它把我的数据卖了。
> 我想要一个不这么做的。」
>
> YIMA 做了什么：
> · 经期 / 排卵预测
> · 数据完全留在本地，不上传任何服务器
> · 没有广告、没有付费墙、没有「高级版」
> · 开源、可审计
>
> 制作团队：
> · 设计 —— <名字>
> · 工程 —— <名字>
> · 隐私顾问 —— <名字>
> · 文档 —— <名字>
>
> 现在就能用了。
>
> ——
> Novawerk 是柏林的一个非营利社区，我们一起把愿望做成真的东西。
> 下一个也许就是你 —— 你一直想要、但没人做的东西是什么？评论区说说。

### English example (YIMA)

> 🌟 New from Novawerk · YIMA
>
> A period calendar designed without profit as a constraint.
>
> The wish came from <Initiator>:
> "I'd used a paid period app for five years. One day I found out
> they were selling my data. I wanted one that doesn't."
>
> What YIMA does:
> · Period and ovulation prediction
> · All data stays on-device — nothing ever uploads
> · No ads, no paywall, no "premium tier"
> · Open source, auditable
>
> Built by:
> · Design — <name>
> · Engineering — <name>
> · Privacy advisor — <name>
> · Documentation — <name>
>
> Try it: novawerk.io/portfolio/yima
>
> ——
> Novawerk is a non-profit community. We turn community wishes
> into real, working things.
> You could be next. Tell us your wish: novawerk.io/community

---

## ⑤ 上线十天反馈（T+10）

表明这不是发完就走 —— 项目还在被改进（呼应 [projects overview](../../projects/overview.md)
里的 *worksite* 口径）。

### 固定字段
- **标题**：`<项目名> 上线十天 · 我们听到了什么`
- **数字**：用户 / 下载 / GitHub stars / 贡献者
- **3-5 条真实反馈**：截图或引用，匿名 OK
- **我们已经改了什么**：英文版带 commit 链接 / 日期，中文版只写日期
- **我们准备改什么**
- **一个意外发现**（这条最值钱，让帖子有人味）
- **CTA**：继续反馈的入口。中文版：评论区

---

## ⑥ 阶段回顾（T+30 / T+90）

数字、人、下一步。

### 固定字段
- **标题**：`<项目名> 三个月 · 数字、人、下一步`
- **关键数字 3-5 个**
- **一位用户/共建者短访谈**：3-5 问
- **下一阶段的交付**
- **致谢名单**
- **一句「还在被改进」**：不要说「完美」或「圆满」

---

## Related

- [Promotion playbook](./README.md) —— 概览和平台分发
- [Launch checklist](./launch-checklist.md) —— T-day 时间线
- [Brand voice](../../brand/voice.md) —— 语气和用词规则
