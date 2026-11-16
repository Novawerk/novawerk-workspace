import type { ReactNode } from "react";

import { VideoRoot } from "../../kit/root";
import { CopyContext, copies } from "./copy";
import { Cover } from "./Cover";
import {
  CLIENT_FRAMES,
  END_FRAMES,
  FOUNDER_FRAMES,
  HOOK_FRAMES,
  PROBLEM_FRAMES,
  ROAD_FRAMES,
  SUPERVISOR_FRAMES,
  VOICE_FRAMES,
  Shot1Hook,
  Shot2Problem,
  Shot3Client,
  Shot3bVoice,
  Shot4Supervisor,
  Shot5Road,
  Shot6Founder,
  Shot7End,
} from "./shots/Film";

// Shots in order. Each shot is also its own composition, so a change re-renders only that shot.
const shots = [
  { id: "Shot1Hook", component: Shot1Hook, frames: HOOK_FRAMES },
  { id: "Shot2Problem", component: Shot2Problem, frames: PROBLEM_FRAMES },
  { id: "Shot3Client", component: Shot3Client, frames: CLIENT_FRAMES },
  { id: "Shot3bVoice", component: Shot3bVoice, frames: VOICE_FRAMES },
  { id: "Shot4Supervisor", component: Shot4Supervisor, frames: SUPERVISOR_FRAMES },
  { id: "Shot5Road", component: Shot5Road, frames: ROAD_FRAMES },
  { id: "Shot6Founder", component: Shot6Founder, frames: FOUNDER_FRAMES },
  { id: "Shot7End", component: Shot7End, frames: END_FRAMES },
];

// The same film in Chinese, for 小红书: same shots, music and clock; its own words.
function Chinese({ children }: { children: ReactNode }) {
  return <CopyContext.Provider value={copies.zh}>{children}</CopyContext.Provider>;
}

// Both platforms show the first frame as the thumbnail: open on the hook with its line already up.
const poster = { shot: "Shot1Hook", frame: 85 };

export function Root() {
  return (
    <>
      <VideoRoot shots={shots} cover={Cover} formats={["3x4"]} poster={poster} />
      <VideoRoot shots={shots} cover={Cover} formats={["3x4"]} variant="zh" wrap={Chinese} poster={poster} />
    </>
  );
}
