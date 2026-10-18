---
title: Visual assets for posts
category: community
status: evolving
updated: 2026-10-03
---

# Visual assets for posts

每类帖子的配图思路、推荐模型、可复用 prompt 模版。所有 prompt 都基于
[Visual identity](../../brand/visual-identity.md) 这套视觉锚点 ——
不要偏离它。

> **默认做法（2026-10 起）：** admin 面板里的每篇帖子都自带模版拼装的配图 ——
> EVA 风格：黑底、压扁的粗宋体 / 衬线大写标题（Noto Serif SC / Noto Serif）、等宽字的
> HUD（IBM Plex Mono）、荧光绿 `#38e07b` 作唯一信号色（Nova Star 的绿点亮），帖子文字，加一张项目
> 自己的封面或截图，四个尺寸直接下载。不用生图模型。下面的 prompt 只在你想**手工**
> 另做一张氛围图时参考；第 4 节的尺寸对模版同样适用。帖子卡片和网站不同，不用 cream 底，
> 见 NB-ADR-0009。每类帖子的样子在 admin 的 Posts → Templates。

## 1. Shared visual anchors

每张图必须暗示或包含这些元素：

- **配色** —— cream 背景 `#efe9d8`（"the room"）、accent green `#1f7a4a`、
  可选 expressive blue `#2a5dc8`
- **Nova Star** —— 四角尖星，绿色，中间的小星是镂空（透出背景色，不填深绿）；**不要**圆角 / 描边 / 渐变 / 阴影。
  AI 生图经常画错，**默认做法是留空白让后期 Figma 合成 SVG** ——
  详见 [brand-mark · In AI-generated images](../../brand/mark.md#in-ai-generated-images)
- **M3-Expressive 气质** —— springy 但不浮夸，soft-edged cards（16px radius），
  one hero one accent，欢迎非对称构图
- **风格关键词** —— `editorial`, `matte texture`, `natural light`,
  `asymmetric composition`, `generous whitespace`
- **避免** —— stock photo feel、glossy reflections、AI 经典瑕疵
  （多余手指、扭曲文字、虚假纹理）、Nova Star 上加任何渐变 / 阴影

### Universal negative prompt

```
stock photo, glossy plastic finish, AI-generated look, distorted text,
extra fingers, oversaturated, gradient on logo, drop shadow on star,
neon, cyberpunk, generic 3D render, watermark, low resolution,
busy background, more than two accent colors
```

## 2. Model picker

| 帖子           | 主推模型              | 备选            | 优先用真实素材？           |
|----------------|----------------------|-----------------|---------------------------|
| 1 立项卡       | Recraft V3           | Ideogram 2.0    | 部分（如有产品草图）       |
| 2 进展         | —                    | Nano Banana     | **优先用实际截图**         |
| 3 制作幕后     | Midjourney v7        | Flux 1.1 Pro    | **优先用过程照片**         |
| 4 上线卡 ⭐    | Flux 1.1 Pro         | Midjourney v7   | 产品镜头 + 装饰可生成      |
| 5 十天反馈     | Ideogram 2.0         | Figma 做更可控  | 用户反馈截图              |
| 6 阶段回顾     | Midjourney v7        | 团队照片        | **优先用社区/团队照片**    |

### 为什么选这些

| 模型 | 强项 | 弱项 | 哪里用 |
|------|------|------|--------|
| **Midjourney v7** | 气质和材质最稳，人 / 场景 / 氛围一流 | 文字会乱 | midjourney.com / Discord |
| **Flux 1.1 Pro** | 构图干净、品牌色可控、可控性高 | 略缺氛围 | fal.ai / replicate.com |
| **Ideogram 2.0** | 唯一能稳出文字 | 写实弱 | ideogram.ai |
| **Recraft V3** | 矢量插画风、可指定调色板 | 不擅长照片 | recraft.ai |
| **Nano Banana** | 快、便宜、适合试探 | 质量上限低 | aistudio.google.com（Gemini 2.5 Flash Image）|

## 3. Prompt templates per post type

每个模版的 `<…>` 是需要替换的变量。建议先一句话写出"这张图在说什么"，
再填变量。

---

### ① 立项卡

**视觉角色**：象征性表达"愿望"，传递"we're starting something"的气场。

**主推 · Recraft V3** —— 指定 Novawerk 调色板，生成插画风

```
Editorial illustration in flat vector style. A single symbolic object
representing <wish concept>, rendered in cream (#efe9d8) and accent
green (#1f7a4a). The object sits off-center, asymmetric composition,
generous whitespace around it. A small four-pointed star floats in
the upper-right corner as a quiet brand mark — sharp edges, no
rounding. Soft matte texture, no gradients, no shadows.

Palette: cream #efe9d8 background, accent green #1f7a4a, ink #0f0f0f for any line work.
Aspect: 3:4 (xiaohongshu) | 1:1 (linkedin square) | 1.91:1 (linkedin link)
```

`<wish concept>` 示例：
- 柏林中餐地图 → `a hand-drawn paper map with chopsticks resting on it`
- YIMA → `a pebble-shaped device with a small calendar pattern, half in shadow`

---

### ② 进展帖

**视觉角色**：低成本、有 momentum 感。**优先用实际截图**，套一个简单品牌框。

不需要 AI 生图。Figma 做一个固定模版：cream 背景 + 项目名 caption +
右下角 Nova Star 水印 + 中间留空贴截图。

需要快速产出占位图时（**Nano Banana**）：

```
A clean flat-lay frame on cream background (#efe9d8) with subtle paper texture.
Off-center composition with empty space in the middle for a screenshot to be
pasted on top. Small four-pointed green star (#1f7a4a) in the bottom-right
corner. Minimal, no decoration.

Aspect: 4:3
```

---

### ③ 制作幕后

**视觉角色**：人和过程，把"团队"变成具体的人。

**主推 · Midjourney v7** —— 氛围和材质最稳

```
Documentary-style photograph, natural window light, hands working on
<artifact: keyboard / sketchbook / phone screen / paper map>,
shallow depth of field. Warm cream walls (#efe9d8) in soft background.
Muted palette with forest green (#1f7a4a) accents on a single object
in scene. Matte film grain, Kodak Portra 400 aesthetic. No faces, or
only partial / from behind. Asymmetric composition, generous negative
space.

--ar 4:5 --style raw --v 7
```

替换 `<artifact>` 时优先选项目实际在做的东西（不要乱编）。

---

### ④ 上线卡 ⭐

**视觉角色**：项目的 hero 镜头 —— 整套宣发图里最重要的一张。

**主推 · Flux 1.1 Pro** —— 构图最干净、品牌色把控最好

通用骨架：

```
Hero composition for a non-profit product launch. <product visual: device,
app screen, artifact>. Cream background (#efe9d8). Accent green (#1f7a4a)
as a single point of contrast in the scene. Asymmetric layout, generous
negative space, soft natural lighting from one side.

A small four-pointed green star (#1f7a4a) floats in one corner as the
brand mark — sharp edges, NO rounding, NO drop shadow, NO gradient on
the star itself.

Editorial product photography feel, matte not glossy. M3-Expressive
aesthetic: springy yet quiet. One hero, one accent — everything else
reads quietly.
```

变体 — YIMA：

```
A modern smartphone laying flat on a cream linen surface (#efe9d8),
screen showing a soft calendar interface with small green dot markers.
The phone is angled off-center to the lower-left. Window light from the
upper-right creates a gentle natural shadow. A small four-pointed green
star (#1f7a4a) in the upper-right corner, sharp edges. Editorial product
photo, matte texture, no glare, no reflections.

--ar 1:1 (also generate 3:4, 1.91:1, 16:9)
```

变体 — 柏林中餐地图：

```
A hand-illustrated overhead map of Berlin, simplified in line work on
cream paper (#efe9d8). Small marker dots in accent green (#1f7a4a)
scattered across districts. A pair of chopsticks resting diagonally
over the map. Off-center, asymmetric. A four-pointed green star in the
upper corner. Editorial illustration style, matte paper texture, no
shadows.

--ar 3:4
```

每个项目至少生成 4 种比例：3:4（小红书）/ 1:1（LinkedIn square）/
1.91:1（LinkedIn link card）/ 16:9（blog hero）。

---

### ⑤ 十天反馈

**视觉角色**：放大用户的声音。

**主推 · Ideogram 2.0** —— 唯一能稳定渲染长文字的模型

引用卡 prompt：

```
A clean editorial quote card. Cream background (#efe9d8). A large
quotation mark glyph in accent green (#1f7a4a) at the top-left, slightly
oversized. Below it, the quote text set in elegant sans-serif:

"<user feedback quote, max ~25 words>"

Attribution in smaller muted gray text below: "— <handle or anonymous>".
A small four-pointed green star in the bottom-right corner. Asymmetric,
generous margins, no decoration beyond the named elements.

Style preset: Design
Aspect: 3:4 (xiaohongshu carousel) or 1:1 (linkedin)
```

更可控的做法：Figma 做一个模版，把真实反馈直接排版进去（截图比生图更
可信）。

---

### ⑥ 阶段回顾

**视觉角色**：回望 + 数字 + 人。

**主推：真实素材**。团队照片、社区聚会照片、工作现场都比生图好。

需要氛围补图时（**Midjourney v7**）：

```
Wide-angle documentary photograph of a community workspace at golden hour.
Cream walls (#efe9d8), scattered sketches and laptops on a wood table,
a half-finished whiteboard with illegible writing in the background.
Empty chairs suggest people just stepped out. Warm afternoon light.
Muted palette with a single forest green (#1f7a4a) accent on one object
(plant, mug, or book spine). Kodak Portra 400 film aesthetic, shallow
depth of field.

--ar 16:9 --style raw --v 7
```

**数据图不要 AI 生成** —— 用 Figma / Notion 自带 chart 工具做，准确性
比好看更重要。

## 4. 尺寸速查

| 平台              | 标准尺寸             | 备注                              |
|-------------------|----------------------|-----------------------------------|
| 小红书            | 3:4 (1242×1656)      | 9:16 也可。封面图最重要           |
| LinkedIn 帖文     | 1:1 (1200×1200)      | 方图在 feed 里更显眼              |
| LinkedIn link card| 1.91:1 (1200×627)    | 分享链接时自动抓取                |
| LinkedIn cover    | 4:1 (1584×396)       | 公司 / 项目主页                   |
| Newsletter        | 1.91:1 (1200×630)    | 顶图                              |
| 官网 blog         | 16:9 (1920×1080)     | hero                              |
| Discord embed     | 1.91:1               | 自动预览                          |
| GitHub social     | 1.91:1 (1280×640)    | OG image                          |

## 5. Workflow

1. **写文案 → 确定关键视觉概念**（一句话能说出来吗？说不出就别配图）
2. 从 [model picker](#2-model-picker) 选模型
3. 套对应的 prompt 模版，替换 `<…>` 变量
4. 生成多张 → 挑 1-2 张
5. 在 Figma 里裁出所有要的比例（不要让模型生成不同比例的版本，会变形）
6. 如果生成的图没有 Nova Star，在 Figma 里加上 [`brand/assets/nova-star.svg`](../../brand/assets/nova-star.svg)
7. 检查 [Don'ts](../../brand/visual-identity.md#dont) 列表 —— 别违反规则

## Related

- [Visual identity](../../brand/visual-identity.md) —— 视觉锚点完整规则
- [Brand mark (Nova Star)](../../brand/mark.md) —— 星标本身的细节 +
  [AI 生图里的用法](../../brand/mark.md#in-ai-generated-images)
- [Brand assets](../../brand/assets/) —— SVG 文件可直接合成进图里
- [Post templates](./post-templates.md) —— 配图对应的文案
- [Project visual supplement](./project-supplement.md) —— 项目专属的视觉手册模版
- [Launch checklist](./launch-checklist.md) —— 什么时候生成配图
