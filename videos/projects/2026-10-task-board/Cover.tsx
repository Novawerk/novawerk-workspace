import { Lockup } from "../../kit/brand";
import { Stage } from "../../kit/motion";
import { C, OUT } from "./collage";
import { Closed } from "./shots/HookD";
import { D } from "./theme";

// The cover (option 1, picked 2026-10-15), in the Memphis collage: the 成员申请 form with the 已关闭
// stamp among patterned panels and stickers, the pink 我们不再接受成员申请了 banner so the cover tells
// the story alone, a small lockup on a white tag.

export function Cover() {
  return (
    <Stage>
      <Closed f={D.slam + 24} banner />
      <div style={{ position: "absolute", right: 40, bottom: 44, background: C.paper, border: `${OUT}px solid ${C.ink}`, boxShadow: `8px 8px 0 ${C.ink}`, padding: "14px 22px" }}>
        <Lockup height={40} />
      </div>
    </Stage>
  );
}
