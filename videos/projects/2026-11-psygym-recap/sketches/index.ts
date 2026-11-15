import { registerRoot } from "remotion";

import { loadFonts } from "../../../kit/fonts";
import { Sketches } from "./Sketches";

// Style sketches for the opener (not part of the film):
//   pnpm exec remotion render projects/2026-11-psygym-recap/sketches/index.ts SketchA-Editorial \
//     projects/2026-11-psygym-recap/out/sketches/a.mp4 --public-dir projects/2026-11-psygym-recap/public
loadFonts("");
registerRoot(Sketches);
