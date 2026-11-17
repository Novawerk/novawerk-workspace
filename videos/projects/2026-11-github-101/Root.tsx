import type { ReactNode } from "react";

import { VideoRoot } from "../../kit/root";
import { Cover } from "./Cover";
import type { Lang } from "./lyrics";
import { Shot5Agent } from "./shots/Agent";
import { Shot1Title, Shot2Hook, Shot3What, Shot4Words } from "./shots/Intro";
import { Shot6Habits, Shot7Close } from "./shots/Outro";
import { FilmLang, framesOf } from "./shots/parts";
import { FPS, TIMELINES } from "./theme";

// Shots in order. Each shot is also its own composition, so a change re-renders only that shot.
// The song sets every shot's length, so each language has its own.
const SHOTS = [
  ["Shot1Title", "title", Shot1Title],
  ["Shot2Hook", "hook", Shot2Hook],
  ["Shot3What", "what", Shot3What],
  ["Shot4Words", "words", Shot4Words],
  ["Shot5Agent", "agent", Shot5Agent],
  ["Shot6Habits", "habits", Shot6Habits],
  ["Shot7Close", "close", Shot7Close],
] as const;

/** The songs come at -12.9 (zh) and -13.4 (en) LUFS with peaks near full scale; this brings both films to about -14. */
const SONG_VOLUME: Record<Lang, number> = { zh: 0.89, en: 0.93 };

function film(lang: Lang) {
  const shots = SHOTS.map(([id, seg, component]) => ({ id, component, frames: framesOf(lang, seg) }));
  const wrap = ({ children }: { children: ReactNode }) => <FilmLang.Provider value={lang}>{children}</FilmLang.Provider>;
  // 小红书 shows the first frame as the thumbnail: open on the pile, the question up and its whole line sung.
  const poster = { shot: "Shot2Hook", frame: Math.round((TIMELINES[lang]!.when("hook", 3, 1) + 0.9 - TIMELINES[lang]!.SHOTS.hook!.start) * FPS) };
  // The soundtrack is the song itself (music.ts): voice and beat in one file.
  return <VideoRoot shots={shots} cover={Cover} formats={["3x4"]} variant={lang === "zh" ? undefined : lang} wrap={wrap} poster={poster} musicVolume={SONG_VOLUME[lang]} />;
}

export function Root() {
  return (
    <>
      {film("zh")}
      {film("en")}
    </>
  );
}
