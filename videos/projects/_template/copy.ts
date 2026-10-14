// Every word on screen, in one place. **word** is highlighted in green.
// Facts only from knowledge/ and novawerk.io — see videos/BRAND.md and BRIEF.md.

export const copy = {
  hook: {
    caption: ["一句戳中人的", "**问题**？"],
    notes: ["想法一", "想法二", "想法三"],
  },
  cta: {
    caption: ["下一个", "可以是**你的想法**"],
    url: "novawerk.io",
  },
  cover: {
    title: ["封面", "大**标题**"],
  },
} as const;

/** Every character the video puts on screen, for the font subset. */
export function allText(): string {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(copy);
  return strings.join("");
}
