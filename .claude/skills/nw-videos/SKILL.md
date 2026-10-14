---
name: nw-videos
description: Make or change a Novawerk short video in code (videos/, Remotion) — a 小红书 / Reels / LinkedIn promo, a launch or open-day clip, a project teaser, an English or other-language version, a cover, a re-cut or a re-render — working as director and motion engineer: brief, storyboard, style options, shot-by-shot stills, synthesised music with sound effects on every cut, then the films, cover and post copy. Use when asked for a 宣传片, 短视频, video, animation, reel, clip or 动效 for Novawerk or one of its projects, or to edit, translate or re-render one in videos/projects.
---

# Making a Novawerk video

Videos live in `videos/`: one folder per video in `projects/`, shared pieces in `kit/`, the
rules every video follows in `videos/BRAND.md`. Read `videos/README.md` for the layout and the
`pnpm video` commands; this is how to work.

Reply in 简体中文 unless the person writes in another language; code, comments and commits in
English.

## 1. Understand before you make anything

- Read `videos/BRAND.md` (what a video may say, the visual and sound system), the knowledge base
  (`knowledge/brand/`, `knowledge/culture/`, `knowledge/operations/`, `knowledge/projects/`),
  the live site if relevant, and the closest earlier project in `videos/projects/`.
- Find out: the platform(s) and formats, the length, who it's for, the 1–3 things it must say,
  the call to action (if the platform allows one), and the music.
- **Facts only.** No invented numbers, names, quotes, company names or years. Team claims only in
  the words the founders give. `records/` is confidential; a new project may be named only when
  the person says so, and then only what it is. UI drawn in a shot is illustrative: say so.
- `pnpm video new <yyyy-mm-name>` and write `BRIEF.md`. **Show it and wait for a yes.**

## 2. Storyboard, then style

- Write `STORYBOARD.md`: per shot the time, picture, caption (`**word**` = highlighted), motion
  and sound. A hook in the first 3 s (a pain point or a contrast, never the logo first), the
  thing in one line, one shot per selling point on something real, then the close.
  **Show it and wait for a yes.**
- If the person isn't sure about the look ("不够酷"), don't argue: build the hook in 2–3
  directions as 3-second animated clips plus a key still each, send them, and let them pick.
  Then the chosen direction is the whole film's style. The current house style is
  "便签堆叠" (`videos/BRAND.md`): white, ink-bordered notes, an ink panel, green highlights.

## 3. Build

- Every word goes in `copy.ts` (fonts are subset from it), every time in `timeline.ts`
  (`CUES`, beats, events). Shots read both; nothing is hard-coded twice.
- Every frame is a pure function of the frame number. Cuts land on the beat grid (default
  120 BPM: a beat is 15 frames). Use `kit/`: `Stage`, `Note`, `Rich`, `Lockup`, `NovaStar` +
  `starFall`, `SwapCaption`, `Robots`, `Burst`, the project covers in `shapes.tsx`. Add what's
  missing to `kit/` when another video could use it.
- Lay out in the 1080 × 1440 safe area (`Stage`); 9:16 adds space above and below. Captions
  ~100 px, keywords in green, at most two lines.
- **Draw, don't record.** Screens (/submit, /join, the home page) are drawn in the video's own
  style from the site's real layout and labels; no screen recordings, no fake screenshots.

## 4. Sound on every event

- `music.ts` arranges `kit/audio/synth.ts` on the same clock: a track (default A minor, Am F C G)
  plus a sound for every visual event — a swish and snap on each cut, a tock per landing note,
  a key click per typed character, a thud and a "shing" when the star lands, beeps and
  footsteps for robots, a riser into each big moment. People notice when a cut is silent.
- Regenerate with `pnpm video <project> music` after any timing change.

## 5. Review in small steps

- After each change render **stills of the key frames** (`pnpm video <p> still <Comp> <frame>`)
  and **Read them yourself** before sending: text overflowing or wrapping badly, things covering
  the line that matters (a headliner must be readable before anything runs over it), the 9:16
  frame, an empty first frame. Fix, then send.
- Send work as you go with SendUserFile: stills for a look, a shot clip with music
  (`pnpm video <p> shot <Comp>`) for motion, the whole film for rhythm. When the person changes
  something mid-way, fold it in and re-render only that shot.
- Long renders (`render`, `all`) run in the background; wait for them, don't poll.
- Copy edits are cheap; when a line is too long for the frame, shorten it or give that language
  its own size in `copy.ts` rather than shrinking everything.

## 6. Platforms

- **小红书**: 3:4 is the main format (the feed is 3:4; 9:16 gets cropped there). No URL anywhere
  (captions, end card, drawn address bars, post text), no off-platform call to action, and
  nothing that reads as recruiting (no roles wanted, 成员 / 加入, pay or equity, Europe + work).
  It uses the first frame as the thumbnail: give the film a `poster` frame (`VideoRoot`). Post
  copy: three titles ≤ 20 characters, ~150 characters of body, 5–8 hashtags without
  #海外华人 / #德国华人 next to a team pitch.
- **LinkedIn / Instagram / Reels**: English variant (`"variants": ["en"]`), written for English
  readers, not translated; it may keep novawerk.io.
- A second language is a variant of the same project: same shots, music and clock, its own copy
  and its own `music-<lang>.wav` (typed lines differ).

## 7. Deliver

```bash
pnpm video <project> all      # music, every language and format, every cover → out/
```

- Check the final mp4's first frame (`pnpm exec remotion ffmpeg -i … -frames:v 1 x.png`), then
  send the films, cover and `POST.md` (titles, body, hashtags, ready to paste; per platform).
- Commit the project with its `out/` films and covers and open a pull request. Merge only when
  asked (squash).

## Gotchas

- Install with `cd videos && pnpm install --ignore-workspace`; plain `pnpm install` there installs
  into the root workspace.
- `remotion.config.ts` uses Chrome for Testing; the default headless shell crashes on macOS.
- `timeline.ts` and `music.ts` run under plain Node: imports need `.ts` extensions, no parameter
  properties or enums, `timeline.ts` imports nothing.
- Chinese characters not in `copy.ts` render in a fallback font.
