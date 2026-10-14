---
title: Launch checklist
category: community
status: evolving
updated: 2026-10-11
---

# Launch checklist

每个项目从 Planning 走到 Launched 之后 90 天，公开层面要做的事。
**T = 上线日**。

每个项目里需要一位**宣发位**承担发出动作 —— 可以是 Initiator 自己，
也可以是社区里的 Supporter 认领。宣发位要么自己能写双语，要么和
另一位社区成员搭档（一人中文 / 一人英文）。

每个公开节点都标注了 **🇨🇳** 中文渠道 和 **🇬🇧** 英文渠道。

**发小红书的中文版不放网址、邮箱，也不引导去站外**（小红书会限流，见
[post-templates](./post-templates.md#小红书不露网址不引导)）。链接留给英文版和 Discord。

## Building 早期（立项当周）

- [ ] **立项卡配图** · 用 [visual-assets ①](./visual-assets.md#-立项卡) prompt，Recraft V3 出 3:4 / 1:1 / 1.91:1 三个比例
- [ ] **立项卡 🇨🇳 中文版** · 宣发位 → 小红书 + Discord `#cn`
- [ ] **立项卡 🇬🇧 英文版** · 宣发位 → LinkedIn + Discord `#en` + GitHub issue（招募）
- [ ] **项目仓库初始化** · 用 [nw-bootstrap-project](../../skills/nw-bootstrap-project/SKILL.md) 跑一遍
- [ ] **portfolio 登记** · admin 面板 → Projects，把项目推到 `Planning`；首个交付写进项目的 Deliverables 标签
- [ ] **首个交付确认** · 产物 / 责任人 / 完成标志 / 截止日 四项都明确才算立项完成

## Building 进行中

- [ ] **进展帖 🇨🇳** · 每 2 周 1 次 → 小红书 + Discord `#cn`
- [ ] **进展帖 🇬🇧 简版** · Discord `#en` 同步要点（LinkedIn 节奏太密，跳过）
- [ ] **GitHub release notes** 🇬🇧 · 每个有名字的版本都写一条
- [ ] **status 切到 `Building`** · admin 面板 → Projects（立项卡和之后的进展帖会自动排进 Posts）

## Launching 前 2 周（T-14 ~ T-7）

- [ ] **项目视觉手册** · 从 [project-supplement](./project-supplement.md) 复制模版到 `<project-repo>/docs/visual-supplement.md`，至少填到 §1 §3 §6
- [ ] **制作幕后配图** · [visual-assets ③](./visual-assets.md#-制作幕后) prompt，Midjourney v7 出 4:5
- [ ] **制作幕后 🇨🇳** · 宣发位组稿 → 小红书 + 官网 blog 中文长文（小红书那版不提「原文在官网」）
- [ ] **制作幕后 🇬🇧** · 宣发位组稿 → LinkedIn + 官网 blog 英文长文
- [ ] **上线日定档** · status 切到 `Launching` 并填上线日（制作幕后和上线卡自动排进 Posts）· Discord 双频道公告 + 内部邮件
- [ ] **上线卡 hero 配图** · [visual-assets ④](./visual-assets.md#-上线卡-) prompt，Flux 1.1 Pro 出 4 个比例（3:4 / 1:1 / 1.91:1 / 16:9）
- [ ] **上线卡素材包**（双语） · 项目名、一句话定位、首图、团队头像、许愿原话（中英）、demo 录屏（英文字幕或纯视觉）
- [ ] **`novawerk.io/portfolio/<slug>` 页面就绪** · 中英内容都跑通
- [ ] **README 完整版 🇬🇧** · 一句话 → 安装 → 用法 → 致谢

## T-day（上线当天）

- [ ] **上线卡 🇨🇳 发布** · 北京时间早 10 点 → 小红书 + Discord `#cn` `@全员` + 中文 Newsletter（项目链接只放 Discord 和 Newsletter）
- [ ] **上线卡 🇬🇧 发布** · 柏林时间早 10 点 → LinkedIn + Discord `#en` `@全员` + 英文 Newsletter
- [ ] **官网状态切换** · portfolio status → `Launched`（T+10 / T+30 / T+90 的帖子从上线日起算）
- [ ] **GitHub repo 转 public**（如还没）+ tag v1.0
- [ ] **回应评论**（双语） · 当天前 6 小时不要走开，第一波反馈最关键。小红书评论里有人要链接，就说项目叫什么、在哪儿能搜到，不贴网址

## Launched 之后

- [ ] **T+3** 开始收集反馈截图（中英分别存，私文档）
- [ ] **T+10 配图** · [visual-assets ⑤](./visual-assets.md#-十天反馈) 引用卡，Ideogram 2.0 或 Figma 排版
- [ ] **T+10** 十天反馈帖 🇨🇳 → 小红书 + Discord `#cn` + 中文 Newsletter
- [ ] **T+10** 十天反馈 🇬🇧 简版 → Discord `#en` + 英文 Newsletter（LinkedIn 跳过）
- [ ] **T+30** 月度 Newsletter 双语都带一句
- [ ] **T+90 配图** · [visual-assets ⑥](./visual-assets.md#-阶段回顾) —— 优先团队照片，缺氛围补图用 Midjourney
- [ ] **T+90** 阶段回顾 🇨🇳 长文 → 官网 blog 中文 + 小红书
- [ ] **T+90** 阶段回顾 🇬🇧 长文 → 官网 blog 英文 + LinkedIn

## 角色分工

| 角色                          | 出什么                                                  |
|-------------------------------|---------------------------------------------------------|
| **Initiator**                 | 原始内容：「这周做了什么」、「我为什么许这个愿」        |
| **Builder**                   | 截图、demo 录屏、技术取舍                               |
| **宣发位**（项目内 1 位或 1 对） | 排版、发帖、维护时间表、回应评论；负责双语版本到位      |
| **Operations**（Novawerk 核心）| 月度 Newsletter 聚合（双语）、官网状态切换              |

宣发位的"一对"配置：如果一个人不能双语自如，可以拆成
**中文宣发** + **英文宣发** 两位，共同对一个项目负责。

## Related

- [Post templates](./post-templates.md) —— 六类帖子的写法
- [Promotion playbook](./README.md) —— 概览和平台分发
- [Ways to join](../../operations/ways-to-join.md) —— Initiator / Builder / Supporter 三种参与方式
