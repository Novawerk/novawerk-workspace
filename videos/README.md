# videos

Novawerk's short videos (小红书 and the like), made in code with [Remotion](https://www.remotion.dev).
Every frame is a function of time; picture and music share one clock, so every cut and landing has
its sound on the exact frame.

```
videos/
  BRAND.md            what every video may and may not say; the visual and sound system
  kit/                shared: brand pieces (Nova Star, notes, lockup), motion, fonts, colours,
                      shapes and robots, VideoRoot, and audio/synth.ts (instruments + mixer)
  projects/
    _template/        a 12-second, two-shot starting point
    2026-10-xhs-promo/
      BRIEF.md        this video's decisions          STORYBOARD.md   shot list
      POST.md         title, body, hashtags           project.json    output name, formats
      copy.ts         every word on screen            timeline.ts     the clock: beats, cues, events
      shots/          one component per shot          music.ts        the soundtrack arrangement
      out/            the finished films and cover (committed)
  scripts/video.ts    the `pnpm video` command
```

## Setup

Not part of the pnpm workspace (Remotion pulls in Chrome and a lot of packages the apps don't need):

```bash
cd videos
pnpm install --ignore-workspace   # without the flag pnpm installs into the root workspace instead
```

## Commands

```bash
pnpm video list                                   # the projects
pnpm video new 2026-11-open-day                   # a new project from _template
pnpm video 2026-10-xhs-promo studio               # Remotion Studio, scrub and preview
pnpm video 2026-10-xhs-promo music                # synthesise public/music.wav from music.ts
pnpm video 2026-10-xhs-promo still Shot4Team-3x4 200   # one frame → out/stills/
pnpm video 2026-10-xhs-promo shot Shot4Team-3x4   # one shot with its music → out/shots/
pnpm video 2026-10-xhs-promo render               # every format → out/<output>_<format>.mp4
pnpm video 2026-10-xhs-promo cover                # out/cover_3x4.png
pnpm video 2026-10-xhs-promo all                  # music, every format, cover
pnpm typecheck
```

`out/stills/`, `out/shots/` and `public/*.wav` are generated and ignored; the films and the
covers in `out/` are committed.

## Languages

A project can have variants (`"variants": ["en"]` in `project.json`). Each variant gets its own
compositions (`Main-en-3x4`, `Shot1Hook-en-3x4`, `Cover-en`), its own soundtrack
(`node music.ts en` → `music-en.wav`) and its own files (`<output>_en_3x4.mp4`,
`cover_en_3x4.png`). The 2026-10 promo shows the pattern: `copy.ts` holds `zh` and `en` with the
same shape, `Root.tsx` wraps the English shots in `CopyContext`, shots read `useCopy()`.

## Making a new video

The `nw-videos` skill (`.claude/skills/nw-videos/SKILL.md`) is the full way of working: brief,
storyboard, style options, stills, sound, platforms. In short:

1. `pnpm video new <yyyy-mm-name>`, then fill in `BRIEF.md` and `STORYBOARD.md`. Check every claim
   against `BRAND.md`.
2. Put the words in `copy.ts` (`**word**` is highlighted) and the times in `timeline.ts`.
3. Build shots from `kit/`: `Stage`, `Note`, `Rich`, `Lockup`, `NovaStar` + `starFall`,
   `SwapCaption`, `Robots`, `Burst`. Add each shot to `Root.tsx`.
4. Score it in `music.ts` with `kit/audio/synth.ts`: put a sound on every event from `timeline.ts`.
5. Review with `still` and `shot`; when it's right, `all`. Write `POST.md`.

## Gotchas

- The default Chrome headless shell crashes on this macOS (`icudtl.dat`); `remotion.config.ts`
  uses Chrome for Testing instead.
- `timeline.ts` and `music.ts` run under plain Node (type stripping): no extensionless imports, no
  TypeScript-only syntax such as parameter properties or enums.
- Chinese fonts are subset to the characters in `copy.ts` at render time, so text has to live there.
