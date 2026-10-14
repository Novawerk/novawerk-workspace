import type { ComponentType, ReactNode } from "react";
import { Audio, Composition, Freeze, Sequence, Series, Still, staticFile } from "remotion";

import { FPS } from "./theme";

// Every project's compositions, the same way (scripts/video.ts relies on the names):
//   Main-<format>          the whole film with its soundtrack
//   <ShotId>-<format>      each shot alone, with the stretch of music under it — re-render one shot
//   Cover                  the 1080 × 1440 cover still
// `poster` puts one frame of a later shot on frame 0 of the film, so a platform that uses the first
// frame as the thumbnail (小红书 does) shows something better than the hook's empty start.
// A variant (another language) adds its name: Main-en-3x4, Shot1Hook-en-3x4, Cover-en, and reads
// its own soundtrack (music-en.wav).

export interface Shot {
  id: string;
  component: ComponentType;
  frames: number;
}

export const FORMATS = {
  "3x4": { width: 1080, height: 1440 },
  "9x16": { width: 1080, height: 1920 },
} as const;

export function VideoRoot({
  shots,
  cover,
  formats = ["3x4", "9x16"],
  variant,
  wrap: Wrap = ({ children }) => <>{children}</>,
  poster,
}: {
  shots: readonly Shot[];
  cover?: ComponentType;
  formats?: readonly (keyof typeof FORMATS)[];
  /** e.g. "en": a second set of compositions with their own soundtrack. */
  variant?: string;
  /** Wraps every shot and the cover, e.g. in a context with the variant's copy. */
  wrap?: ComponentType<{ children: ReactNode }>;
  /** Show this shot, frozen at `frame` (its own frame count), on the film's first frame. */
  poster?: { shot: string; frame: number };
}) {
  // The soundtrack (music.ts → public/music.wav) runs on the same clock as the picture.
  const music = staticFile(variant ? `music-${variant}.wav` : "music.wav");
  const v = variant ? `-${variant}` : "";
  const total = shots.reduce((n, s) => n + s.frames, 0);
  const starts = shots.map((_, i) => shots.slice(0, i).reduce((n, s) => n + s.frames, 0));

  const Poster = poster ? shots.find((s) => s.id === poster.shot)?.component : undefined;

  function Main() {
    return (
      <>
        <Audio src={music} />
        <Wrap>
          <Series>
            {shots.map((s) => (
              <Series.Sequence key={s.id} durationInFrames={s.frames}>
                <s.component />
              </Series.Sequence>
            ))}
          </Series>
          {Poster && poster ? (
            <Sequence durationInFrames={1}>
              <Freeze frame={poster.frame}>
                <Poster />
              </Freeze>
            </Sequence>
          ) : null}
        </Wrap>
      </>
    );
  }

  const alone = shots.map((s, i) =>
    function ShotWithMusic() {
      return (
        <>
          <Audio src={music} trimBefore={starts[i]} />
          <Wrap>
            <s.component />
          </Wrap>
        </>
      );
    },
  );

  const Cover = cover;
  function WrappedCover() {
    return <Wrap>{Cover ? <Cover /> : null}</Wrap>;
  }

  return (
    <>
      {Cover ? <Still id={`Cover${v}`} component={WrappedCover} width={1080} height={1440} /> : null}
      {formats.map((f) => (
        <Composition key={f} id={`Main${v}-${f}`} component={Main} durationInFrames={total} fps={FPS} {...FORMATS[f]} />
      ))}
      {formats.flatMap((f) =>
        shots.map((s, i) => <Composition key={`${s.id}-${f}`} id={`${s.id}${v}-${f}`} component={alone[i]!} durationInFrames={s.frames} fps={FPS} {...FORMATS[f]} />),
      )}
    </>
  );
}
