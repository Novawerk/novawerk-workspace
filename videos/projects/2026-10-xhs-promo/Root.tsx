import type { ReactNode } from "react";
import { Composition } from "remotion";

import { VideoRoot } from "../../kit/root";
import { CopyContext, copies } from "./copy";
import { Cover } from "./Cover";
import { POSTER_FRAME, Poster } from "./Poster";
import { Shot1Hook, SHOT1_FRAMES } from "./shots/Shot1Hook";
import { Shot2Intro, SHOT2_FRAMES } from "./shots/Shot2Intro";
import { Shot3Pitch, SHOT3_FRAMES } from "./shots/Shot3Pitch";
import { Shot4Team, SHOT4_FRAMES } from "./shots/Shot4Team";
import { Shot5Real, SHOT5_FRAMES } from "./shots/Shot5Real";
import { Shot6Next, SHOT6_FRAMES } from "./shots/Shot6Next";

// Shots in order. Each shot is also its own composition, so a change re-renders only that shot.
const shots = [
  { id: "Shot1Hook", component: Shot1Hook, frames: SHOT1_FRAMES },
  { id: "Shot2Intro", component: Shot2Intro, frames: SHOT2_FRAMES },
  { id: "Shot3Pitch", component: Shot3Pitch, frames: SHOT3_FRAMES },
  { id: "Shot4Team", component: Shot4Team, frames: SHOT4_FRAMES },
  { id: "Shot5Real", component: Shot5Real, frames: SHOT5_FRAMES },
  { id: "Shot6Next", component: Shot6Next, frames: SHOT6_FRAMES },
];

// The same film in English: same shots, music and clock; its own words and typed keys.
function English({ children }: { children: ReactNode }) {
  return <CopyContext.Provider value={copies.en}>{children}</CopyContext.Provider>;
}

// Frame 0 is the intro settled (lockup, line, the home page), not the hook's empty first frame:
// 小红书 shows the first frame in the feed.
const poster = { shot: "Shot2Intro", frame: POSTER_FRAME };

export function Root() {
  return (
    <>
      <VideoRoot shots={shots} cover={Cover} poster={poster} />
      <VideoRoot shots={shots} cover={Cover} variant="en" wrap={English} poster={poster} />
      {/* The LinkedIn poster: render frame POSTER_FRAME (pnpm video … still Poster-en 140). */}
      <Composition id="Poster-en" component={Poster} durationInFrames={SHOT2_FRAMES} fps={30} width={1080} height={1440} />
    </>
  );
}
