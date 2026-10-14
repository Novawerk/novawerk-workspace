import { VideoRoot } from "../../kit/root";
import { Cover } from "./Cover";
import { Shot1Hook, Shot2Pitch, Shot3Email } from "./shots/Novawerk";
import { Shot5Plan, Shot6Road, Shot7Recruit, Shot8End } from "./shots/Psygym";
import { Shot4Why } from "./shots/Why";
import { CUES, sec } from "./theme";

// Shots in order, each from its cue to the next (timeline.ts). Each shot is also its own
// composition, so a change re-renders only that shot.
const shots = [
  { id: "Shot1Hook", component: Shot1Hook, from: CUES.hook, to: CUES.pitch },
  { id: "Shot2Pitch", component: Shot2Pitch, from: CUES.pitch, to: CUES.email },
  { id: "Shot3Email", component: Shot3Email, from: CUES.email, to: CUES.why },
  { id: "Shot4Why", component: Shot4Why, from: CUES.why, to: CUES.plan },
  { id: "Shot5Plan", component: Shot5Plan, from: CUES.plan, to: CUES.road },
  { id: "Shot6Road", component: Shot6Road, from: CUES.road, to: CUES.recruit },
  { id: "Shot7Recruit", component: Shot7Recruit, from: CUES.recruit, to: CUES.end },
  { id: "Shot8End", component: Shot8End, from: CUES.end, to: CUES.out },
].map((s) => ({ id: s.id, component: s.component, frames: sec(s.to - s.from) }));

// 小红书 uses the first frame as the thumbnail: show the two answers there.
export function Root() {
  return <VideoRoot shots={shots} cover={Cover} poster={{ shot: "Shot4Why", frame: 320 }} />;
}
