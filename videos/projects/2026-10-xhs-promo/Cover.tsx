import { random } from "remotion";

import { Lockup, Note, Rich } from "../../kit/brand";
import { Stage } from "../../kit/motion";
import { useCopy } from "./copy";
import { color } from "./theme";

// The cover, 1080 × 1440: the hook's pile of idea notes, an ink panel with the title, the lockup.
export function Cover() {
  const copy = useCopy();
  const { pile, spread, pileSize } = copy.hook;
  const { title, tag, size } = copy.cover;
  return (
    <Stage>
      <div style={{ position: "absolute", left: 72, top: 64 }}>
        <Lockup height={58} />
      </div>
      {pile.map((idea, k) => (
        <Note
          key={idea}
          style={{
            position: "absolute",
            left: 40 + random(`cx${k}`) * (spread + 40),
            top: 170 + k * 64 + random(`cy${k}`) * 24,
            fontSize: pileSize - 4,
            transform: `rotate(${(random(`cr${k}`) - 0.5) * 16}deg)`,
          }}
        >
          {idea}
        </Note>
      ))}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 640, background: color.ink, color: color.paper, padding: "64px 72px" }}>
        {title.map((line) => (
          <div key={line} style={{ fontSize: size, fontWeight: 900, lineHeight: 1.12, letterSpacing: -4 }}>
            <Rich text={line} accent={color.signal} />
          </div>
        ))}
        <div style={{ marginTop: 40, display: "inline-block", background: color.signal, color: color.ink, fontSize: 46, fontWeight: 900, padding: "12px 24px" }}>{tag}</div>
      </div>
    </Stage>
  );
}
