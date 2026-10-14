---
title: Project visual supplement (template)
category: community
status: evolving
updated: 2026-05-20
---

# Project visual supplement (template)

每个项目都应在**自己的 repo** 里维护一份「视觉手册补丁」，记录 Novawerk
核心 VI 之外的项目专属决定 —— 调色偏移、icon 风格、demo 截图模版、
hero 图样例。

**这个文件本身是模版** —— 项目从这里复制一份到自己的 repo，路径建议：
`<project-repo>/docs/visual-supplement.md`。

## 总原则：补丁不替换

[Novawerk Visual identity](../../brand/visual-identity.md) 仍然全部适用。
项目层的视觉手册只能：

- **加** 新的 token / icon / 插画系列
- **指定** 默认模版（device frame、screenshot 风格）
- **细化** prompt 变量（项目特定的 hero 镜头怎么拍）

**不能改** 的：
- `--color-accent` `#1f7a4a`、`--color-background` `#efe9d8`、
  `--color-foreground` `#0f0f0f` 三个核心色
- Nova Star 的形状、构造、用法规则（见 [brand-mark](../../brand/mark.md)）
- Typography（Cabinet Grotesk + Inter）

---

## 模版正文 ↓

复制下面的内容到 `<project-repo>/docs/visual-supplement.md`，
按项目情况填空。每节都加了「保留原样 OR 删除」的指引。

```markdown
---
title: <Project name> visual supplement
project: <project-slug>
status: evolving
updated: YYYY-MM-DD
---

# <Project name> visual supplement

How <Project name> renders inside Novawerk's visual system.
Everything in the [Novawerk VI guide](https://github.com/Novawerk/nw-knowledge-base/blob/main/brand/visual-identity.md)
still applies — this file only adds project-specific decisions.

## 1. Project identity card

- **One-line definition** — <e.g. "Privacy-first period calendar.">
- **Wish origin** — <Initiator name + one-sentence quote>
- **First deliverable** — <link to artifact or short description>

## 2. Palette deviations

If the project needs colors beyond the Novawerk core palette
(e.g. a category-specific accent, a data-viz scale):

| Token              | Hex       | Where it's used                    |
|--------------------|-----------|------------------------------------|
| `--<project>-tint` | `#______` | <e.g. category chip background>    |

**Or, if no deviation:**

> No project-specific colors. Uses the Novawerk core palette as-is.

> Constraint: never override `--color-accent`, `--color-background`,
> or `--color-foreground`. Add new tokens with project prefix.

## 3. Iconography

- **App icon** — `<path/to/icon.svg>` · what it depicts · sizes shipped
- **In-product icons** — <Lucide / Phosphor / Heroicons / custom set>
- **Custom illustrations** — <style notes, or "none">

## 4. Demo screenshot template

What a "good" promo screenshot of this project looks like:

| Decision        | Choice                                    |
|-----------------|-------------------------------------------|
| Device frame    | <iPhone 15 mock / browser frame / none>   |
| Background      | <cream #efe9d8 / project hero color>      |
| Aspect          | <3:4 xiaohongshu / 1:1 LinkedIn>          |
| Caption position| <left / right / overlay / none>           |
| Annotation style| <pill labels / arrows / numbered / none>  |

Link to the Figma template: `<figma URL>`

## 5. Hero image samples

Drop 2-3 reference renders here so the 宣发位 has a visual target.

- ![hero-1](./assets/hero-1.png) — for 上线卡 ⭐
- ![hero-2](./assets/hero-2.png) — for blog 首图

## 6. Prompt deltas

Where the standard [visual-assets prompts](https://github.com/Novawerk/nw-knowledge-base/blob/main/community/promotion/visual-assets.md)
need project-specific substitutions baked in.

### ④ 上线卡 hero — <project> variant

```
<paste the full prompt with project-specific wish concept / artifact
visual / palette tweaks already substituted, so the 宣发位 can copy
and run without rewriting>
```

### ① 立项卡 — <project> variant (optional)

```
<…>
```

## Related

- [Novawerk Visual identity](https://github.com/Novawerk/nw-knowledge-base/blob/main/brand/visual-identity.md)
- [Novawerk Promotion playbook](https://github.com/Novawerk/nw-knowledge-base/blob/main/community/promotion/)
- [Visual assets for posts](https://github.com/Novawerk/nw-knowledge-base/blob/main/community/promotion/visual-assets.md)
```

---

## 何时建立项目视觉手册

[Launch checklist](./launch-checklist.md) 的 **Launching 前 2 周** 阶段
新增一项：

- [ ] 项目 `docs/visual-supplement.md` 写完（最少填到 §1 §3 §6）

如果项目早期还没确定视觉，§4 §5 可以等 hero 图定稿后再回填。

## Related

- [Visual assets for posts](./visual-assets.md) —— Novawerk 全局的 prompt 模版
- [Visual identity](../../brand/visual-identity.md) —— 哪些规则不能动
- [Brand mark (Nova Star)](../../brand/mark.md) —— Nova Star 的细节
