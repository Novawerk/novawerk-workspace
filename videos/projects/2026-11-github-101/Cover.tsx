import { useContext } from "react";

import { Lockup, Note, Rich } from "../../kit/brand";
import { Dancer } from "../../kit/dancer";
import { monoFamily } from "../../kit/fonts";
import { Stage } from "../../kit/motion";
import { copies } from "./copy";
import { FINAL } from "./shots/moves";
import { FilmLang } from "./shots/parts";
import { color } from "./theme";

// The cover, 1080 × 1440: lockup, the three words and the beaver on white, the title on an ink panel.
export function Cover() {
  const lang = useContext(FilmLang);
  const c = copies[lang];
  return (
    <Stage>
      <div style={{ position: "absolute", left: 72, top: 64 }}>
        <Lockup height={58} />
      </div>
      <div style={{ position: "absolute", right: 72, top: 78, fontFamily: monoFamily, fontSize: 30, fontWeight: 600, letterSpacing: 3, color: color.muted }}>{c.series}</div>
      {c.cover.chips.map((chip, i) => (
        <Note key={chip} style={{ position: "absolute", left: [90, 380, 170][i], top: 250 + i * 170, fontSize: 76, padding: "22px 40px", transform: `rotate(${[-4, 3, -2][i]}deg)` }}>
          {chip}
        </Note>
      ))}
      <Dancer pose={FINAL[0]!} x={884} floor={820} height={300} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 600, background: color.ink, color: color.paper, padding: "70px 72px" }}>
        {c.cover.title.map((line) => (
          <div key={line} style={{ fontSize: lang === "en" ? 104 : 112, fontWeight: 900, lineHeight: 1.2, letterSpacing: -3, whiteSpace: "nowrap" }}>
            <Rich text={line} accent={color.signal} />
          </div>
        ))}
      </div>
    </Stage>
  );
}
