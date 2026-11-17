import { VideoRoot } from "../../kit/root";
import { Cover } from "./Cover";
import { CLOSE_FRAMES, HABITS_FRAMES, Shot7Habits, Shot8Close } from "./shots/Outro";
import { EDIT_FRAMES, ISSUE_FRAMES, Shot5Issue, Shot6Edit } from "./shots/Work";
import { HOOK_FRAMES, Shot1Hook, Shot2What, Shot3Words, Shot4Start, START_FRAMES, WHAT_FRAMES, WORDS_FRAMES } from "./shots/Intro";

// Shots in order. Each shot is also its own composition, so a change re-renders only that shot.
const shots = [
  { id: "Shot1Hook", component: Shot1Hook, frames: HOOK_FRAMES },
  { id: "Shot2What", component: Shot2What, frames: WHAT_FRAMES },
  { id: "Shot3Words", component: Shot3Words, frames: WORDS_FRAMES },
  { id: "Shot4Start", component: Shot4Start, frames: START_FRAMES },
  { id: "Shot5Issue", component: Shot5Issue, frames: ISSUE_FRAMES },
  { id: "Shot6Edit", component: Shot6Edit, frames: EDIT_FRAMES },
  { id: "Shot7Habits", component: Shot7Habits, frames: HABITS_FRAMES },
  { id: "Shot8Close", component: Shot8Close, frames: CLOSE_FRAMES },
];

// 小红书 shows the first frame as the thumbnail: open on the pile with its question already up.
const poster = { shot: "Shot1Hook", frame: 215 };

export function Root() {
  // The voice is in the shots; the music and the sound effects sit under it.
  return <VideoRoot shots={shots} cover={Cover} formats={["3x4"]} poster={poster} musicVolume={0.5} />;
}
