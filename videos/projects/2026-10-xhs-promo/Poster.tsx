import { CopyContext, copies } from "./copy";
import { Shot2Intro } from "./shots/Shot2Intro";

// The English poster for LinkedIn, 1080 × 1440: the intro settled (frame 140, the film's first
// frame), with the star upright instead of mid-turn. Root renders it as a composition.
export const POSTER_FRAME = 140;

export function Poster() {
  return (
    <CopyContext.Provider value={copies.en}>
      <Shot2Intro upright />
    </CopyContext.Provider>
  );
}
