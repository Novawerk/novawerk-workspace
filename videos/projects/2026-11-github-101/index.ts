import { registerRoot } from "remotion";

import { loadFonts } from "../../kit/fonts";
import { allText } from "./copy";
import { Root } from "./Root";

loadFonts(allText());
registerRoot(Root);
