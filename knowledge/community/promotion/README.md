---
title: Promotion playbook
category: community
status: evolving
updated: 2026-10-11
---

# Promotion playbook

How each Novawerk project is announced, narrated, and reflected on as it
moves from Planning → Launched. This is a working playbook, not a brand
mandate —— 每个项目的*宣发位*（promotion lead）可以按情况调整。

写之前先过一遍 [Brand voice](../../brand/voice.md)：直接、平白、
用「我们」。避开 leverage / ecosystem / stakeholders。

## What's here

- [Post templates](./post-templates.md) —— 六类帖子的固定字段和示例
- [Visual assets](./visual-assets.md) —— 配图模型选择、可复用 prompt 模版、尺寸速查
- [Project visual supplement](./project-supplement.md) —— 每个项目自己的视觉手册模版（在项目 repo 里维护）
- [Launch checklist](./launch-checklist.md) —— T-day 时间线和角色分工

## In the admin panel

这套节奏已经接进 admin 面板（admin.novawerk.io → **Posts**）：

- 项目切到 `Building` / `Launching` / `Launched`、或者改了上线日，到点的帖子会自动出现
  （进展帖每 2 周、T+10、T+30、T+90 由每天的 promo agent 补上）。
- promo agent 用 Claude 按 [post-templates](./post-templates.md) 写中英两版，**只用我们自己的数据**：
  项目、团队、交付物、原始 pitch、之前的帖子，加上宣发位写的 brief。缺的事实会留成
  【待补充：…】，填完才能 approve。发小红书的中文版不放网址（漏掉的会变成 【待补充：去掉网址】），
  3:4 卡片也不印 novawerk.io。
- 配图由模版**拼装**，不用 AI 生图（EVA 风格：黑底、压扁的宋体、绿色 HUD）：Nova Star、字体、文字都是准确的，再放一张项目
  自己的封面或截图（PNG / JPEG）。四个尺寸一键下载。
- 发帖仍然手动：复制文案、下载配图、发出去，再在 admin 里点「Mark as posted」。
- 六个节点之外的帖子（开放日、招募、感谢、月报……）用 **New post → 自由帖**：可以不挂项目
  （Novawerk 自己的帖子）、只发一种语言、自己选平台，模版卡片可开可关，还能放自己的图（多图）。
- 也可以在仓库里写：`posts/<目录>/`（`post.yml` + `zh.md` / `en.md` + 图片，格式见
  `posts/README.md`），用 Claude Code（`nw-posts` skill）或任何工具写文案、做图，
  `pnpm post render` 看卡片、`pnpm post check` 检查。PR 合并后自动同步到 admin，状态是
  **Approved**（PR review 就是审核）。admin 里任何一篇都能「Continue in the repo」拉回本地接着改。

## Six post types tied to project lifecycle

每个项目从立项走到上线后 90 天，对应六个公开节点：

| #  | 帖子         | 时机                     | 一句话目的                  |
|----|--------------|--------------------------|-----------------------------|
| 1  | 立项卡       | Building 切换时          | 宣布愿望 + 公开招募         |
| 2  | 进展帖       | Building 中（每 2 周）   | 兑现 open-by-default        |
| 3  | 制作幕后     | Launching 前 1-2 周      | 给上线预热，让团队具体起来  |
| 4  | 上线卡 ⭐    | Launched（T-day）        | 告诉世界这件事做成了        |
| 5  | 十天反馈     | T+10                     | 表明它还在被改进            |
| 6  | 阶段回顾     | T+30 / T+90              | 数字、人、下一步            |

## Languages & audiences

Novawerk 是一个多语种团队。每个项目的宣发同时面向：

- **中文社区** —— Berlin 的中文圈、海外华人社区、国内关心非营利建造的读者
- **英文世界** —— 国际开发者、行业读者、未来潜在共建者

不是简单翻译，而是**并行的母语版本** —— 同一个项目事实，
中英两种叙述方式，分别放在合适的渠道。同一个故事不要直译，
两种语言里要用各自最自然的说法。

| 平台          | 主语言    | 备注                          |
|---------------|-----------|-------------------------------|
| 小红书        | 中文      | 个人化、生活化口吻；不放网址  |
| LinkedIn      | 英文      | 专业、行业向、招募 Builder    |
| Discord       | 双语      | 按频道分 `#cn` / `#en`        |
| Newsletter    | 双语      | 同一封两版，或分开发          |
| 官网 blog     | 双语      | 长文，先写哪种语言看团队      |
| GitHub        | 英文      | 开源惯例                      |

## Platform distribution

| 帖子          | 小红书  | LinkedIn | Discord  | Newsletter | 官网 blog | GitHub          |
|---------------|:-------:|:--------:|:--------:|:----------:|:---------:|:---------------:|
| 1 立项卡      | ✓ 主    | ✓        | ✓ 同步   |            |           | ✓ issue 招募    |
| 2 进展        | ✓       |          | ✓ 主     | 月度汇总   |           | ✓ release notes |
| 3 制作幕后    | ✓ 主    | ✓        | ✓        |            | ✓ 长文    |                 |
| 4 上线卡 ⭐   | ✓ 主    | ✓ 主     | ✓ @全员  | ✓          | ✓         | ✓ README        |
| 5 十天反馈    | ✓ 主    |          | ✓        | ✓          |           |                 |
| 6 阶段回顾    | ✓       | ✓        | ✓        | ✓ 主       | ✓ 长文    |                 |

- **LinkedIn** —— 不发 #2 进展和 #5 十天反馈（节奏太密会刷屏）；可以月度合一条
- **小红书** —— 对外中文主战场，每一类帖子都发。**不露网址，不引导**：正文和卡片里没有
  网址、邮箱，也不叫人去官网、加群、加 Discord，不然会被限流（2026-10-10 第一条宣传视频就是这样）。
  要说的换成「我们是谁、接下来做什么」，或者请大家在评论区留言。规则和写法见
  [post-templates](./post-templates.md#小红书不露网址不引导)
- **Newsletter** —— 月度沉淀，不每篇都发（会被退订）
- **官网 blog** —— 长读内容（幕后、回顾），中英双语
- **GitHub** —— 招募 Builder + release notes，英文为主
- **Discord** —— 社区内部同步，所有节点中英频道都发

视频平台（视频号 / B 站 / 抖音 / YouTube）暂不加 —— 制作成本高，
等社区里有人主动认领再说。

## Related

- [Channels and contact](../channels.md) —— 完整渠道清单
- [Community rhythm](../rhythm.md) —— open days / workshops 节奏
- [How we work](../../operations/how-we-work.md) —— 项目流程上下文
- [Members and project roles](../../operations/titles-and-roles.md) —— 人人都是 Member，不分级 + 项目角色
