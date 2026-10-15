import { Lockup } from "../../kit/brand";
import { Stage } from "../../kit/motion";
import { copy } from "./copy";
import { Closed } from "./shots/HookD";
import { D, color } from "./theme";

// The cover (option 1, picked 2026-10-15): 成员申请 with the 已关闭 stamp, ~7 characters.

/** 成员申请 filling the frame, the 已关闭 stamp across it, a small lockup. */
export function Cover() {
  return (
    <Stage>
      <Closed f={D.slam + 20} line={false} />
      <div style={{ position: "absolute", right: 76, bottom: 92 }}>
        <Lockup height={40} />
      </div>
    </Stage>
  );
}

