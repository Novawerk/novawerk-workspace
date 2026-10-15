import { VideoRoot } from "../../kit/root";
import { Cover } from "./Cover";
import { HookD, HOOK_D_FRAMES } from "./shots/HookD";
import { SHOT2_FRAMES, Shot2Idea } from "./shots/Shot2Idea";
import { SHOT_WHY_FRAMES, Shot2Why } from "./shots/Shot2Why";
import { SHOT3_FRAMES, Shot3Trial } from "./shots/Shot3Trial";
import { SHOT4_FRAMES, Shot4Tower } from "./shots/Shot4Tower";

// The film in order (STORYBOARD.md). Each shot is also its own composition with its music.
const shots = [
  { id: "Shot1Hook", component: HookD, frames: HOOK_D_FRAMES },
  { id: "Shot2Why", component: Shot2Why, frames: SHOT_WHY_FRAMES },
  { id: "Shot3Idea", component: Shot2Idea, frames: SHOT2_FRAMES },
  { id: "Shot4Trial", component: Shot3Trial, frames: SHOT3_FRAMES },
  { id: "Shot5Tower", component: Shot4Tower, frames: SHOT4_FRAMES },
];

// 小红书 uses the first frame as the thumbnail: frame 0 shows the cover (成员申请 + 已关闭).
export function Root() {
  return <VideoRoot shots={shots} cover={Cover} formats={["3x4"]} poster={{ shot: "Shot1Hook", frame: 28 }} />;
}
