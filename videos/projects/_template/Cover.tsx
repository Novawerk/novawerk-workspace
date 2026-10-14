import { Lockup, Rich } from "../../kit/brand";
import { Stage } from "../../kit/motion";
import { copy } from "./copy";
import { color } from "./theme";

// The cover, 1080 × 1440: lockup on white, the title on an ink panel.
export function Cover() {
  return (
    <Stage>
      <div style={{ position: "absolute", left: 72, top: 64 }}>
        <Lockup height={58} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 640, background: color.ink, color: color.paper, padding: "64px 72px" }}>
        {copy.cover.title.map((line) => (
          <div key={line} style={{ fontSize: 150, fontWeight: 900, lineHeight: 1.12, letterSpacing: -4 }}>
            <Rich text={line} accent={color.signal} />
          </div>
        ))}
      </div>
    </Stage>
  );
}
