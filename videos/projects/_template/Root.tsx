import { VideoRoot } from "../../kit/root";
import { Cover } from "./Cover";
import { Shot1Hook, SHOT1_FRAMES } from "./shots/Shot1Hook";
import { Shot2Cta, SHOT2_FRAMES } from "./shots/Shot2Cta";

// Shots in order. Each shot is also its own composition, so a change re-renders only that shot.
const shots = [
  { id: "Shot1Hook", component: Shot1Hook, frames: SHOT1_FRAMES },
  { id: "Shot2Cta", component: Shot2Cta, frames: SHOT2_FRAMES },
];

export function Root() {
  return <VideoRoot shots={shots} cover={Cover} />;
}
