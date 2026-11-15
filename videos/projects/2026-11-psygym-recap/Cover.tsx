import { Lockup } from "../../kit/brand";
import { monoFamily } from "../../kit/fonts";
import { useCopy } from "./copy";
import { Headline, Night, Phone, glow } from "./shots/glow";

// The cover, 1080 × 1440, in the film's look: the home screen in a phone, the title.
export function Cover() {
  const f = 400; // a still: everything has landed
  const copy = useCopy();
  return (
    <Night f={f}>
      <div style={{ position: "absolute", left: 72, top: 70 }}>
        <Lockup height={52} tone="dark" />
      </div>
      <div style={{ position: "absolute", left: 72, top: 170, fontFamily: monoFamily, fontSize: 28, fontWeight: 600, letterSpacing: 4, color: glow.lilac }}>{copy.cover.tag}</div>
      <Phone src="screen1.png" width={330} turn={-16} style={{ left: 650, top: 230 }} />
      <Headline f={f} at={0} lines={copy.cover.title} size={132} style={{ position: "absolute", left: 72, right: 40, top: 1010 }} />
    </Night>
  );
}
