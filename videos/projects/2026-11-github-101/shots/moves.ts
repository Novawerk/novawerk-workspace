import { mirror, pose } from "../../../kit/dancer";
import type { Pose } from "../../../kit/dancer";

// The dancer's moves: each is a short loop of poses, one per beat unless a shot says otherwise.

const both = (p: Pose) => [p, mirror(p)] as const;

/** Standing and bobbing, arms loose. */
export const GROOVE = both(pose({ hip: [-10, 0], lean: -3, head: -5, armL: [26, 72], armR: [10, 28] }));
/** The same, bigger, with a side step. */
export const STEP = both(pose({ hip: [-30, 2], lean: -5, head: -6, armL: [62, 96], armR: [48, 80], footL: [-26, 0], footR: [-6, 16] }));
/** One hand up, then the other. */
export const HANDS_UP = both(pose({ hip: [-16, 0], lean: -5, head: -4, armL: [152, 8], armR: [58, 84], footL: [-18, 0] }));
/** Raise the roof. */
export const ROOF = [pose({ armL: [112, 62], armR: [112, 62], hip: [0, 6] }), pose({ armL: [150, 22], armR: [150, 22], hip: [0, -8] })] as const;
/** Both arms up, a hop. */
export const CHEER = [pose({ armL: [162, 0], armR: [162, 0], hip: [0, -18], footL: [-8, 10], footR: [8, 10] }), pose({ armL: [140, 30], armR: [140, 30], hip: [0, 4] })] as const;
/** Looking for something: a hand at the head, peering left, then right. */
export const SEARCH = both(pose({ hip: [-14, 2], lean: -7, head: -12, look: -1, armL: [18, 30], armR: [78, 128] }));
/** Something lands next to you. */
export const FLINCH = both(pose({ hip: [16, -6], lean: 9, head: 8, look: -1, armL: [74, 64], armR: [58, 96], footR: [18, 0] }));
/** No idea. */
export const SHRUG = [pose({ hip: [0, 8], head: 9, armL: [38, 96], armR: [38, 96] }), pose({ hip: [0, 2], head: -9, armL: [46, 100], armR: [46, 100] })] as const;
/** Pointing up and to the left, at what is on the screen. */
export const POINT = [pose({ lean: -6, head: -10, look: -1, armL: [128, 0], armR: [16, 40] }), pose({ lean: -3, head: -6, look: -1, armL: [116, 26], armR: [22, 60], hip: [-8, 0] })] as const;
/** Waving something away, to the left. */
export const DISMISS = [pose({ head: -8, look: -1, armL: [96, 40], armR: [14, 30], lean: 4 }), pose({ head: -4, look: -1, armL: [70, -30], armR: [14, 30], lean: 2 })] as const;
/** Talking to someone on the right. */
export const TALK = [pose({ lean: 5, head: 7, look: 1, armR: [72, 96], armL: [16, 34] }), pose({ lean: 3, head: 4, look: 1, armR: [60, 104], armL: [22, 50], hip: [8, 0] })] as const;
/** Wagging a finger. */
export const NO_NO = [pose({ head: 5, armR: [62, 106], armL: [28, -58], hip: [6, 0] }), pose({ head: -5, armR: [62, 138], armL: [28, -58], hip: [6, 0] })] as const;
/** Relaxed, a thumb up. */
export const ALL_GOOD = [pose({ head: -6, lean: -3, armL: [70, 96], armR: [20, 36], hip: [-8, 0] }), pose({ head: 4, lean: 2, armL: [84, 80], armR: [26, 50], hip: [-2, 0] })] as const;
/** The last pose: one arm to the sky, a hand on the hip. */
export const FINAL = [pose({ hip: [8, 0], lean: 4, head: 6, armR: [150, 12], armL: [34, -62], footL: [-16, 0], footR: [14, 0] })] as const;
