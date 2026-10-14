import type { CSSProperties, ReactNode } from "react";

import { copy } from "../copy";
import { monoFamily } from "../../../kit/fonts";
import { color } from "../theme";

// A design canvas full of PSYGYM prototype screens, after the team's design canvas
// (claude.ai/artifact/UkqiioLoNiSB618ks8dPvg): its 17 screens in flow order, its zinc palette and
// radii. Drawn, not the real app: text is grey bars. The 18th slot is an empty "+" frame — still
// being designed.

const z = {
  bg: "#FFFFFF",
  ink: "#09090B",
  primary: "#18181B",
  muted: "#F4F4F5",
  border: "#E4E4E7",
  text: "#71717A",
  bar: "#E4E4E7",
  barDark: "#D4D4D8",
} as const;

export const FRAME = { w: 280, h: 580, gapX: 90, gapY: 220 } as const;
export const COLS = 6;
export const ROWS = 3;
export const WORLD = { w: COLS * FRAME.w + (COLS - 1) * FRAME.gapX, h: ROWS * FRAME.h + (ROWS - 1) * FRAME.gapY } as const;

/** Where frame `i` sits on the canvas (top-left), and its centre. */
export function framePos(i: number) {
  const x = (i % COLS) * (FRAME.w + FRAME.gapX);
  const y = Math.floor(i / COLS) * (FRAME.h + FRAME.gapY);
  return { x, y, cx: x + FRAME.w / 2, cy: y + FRAME.h / 2 };
}

const bar = (w: number | string, h = 10, c: string = z.bar, extra?: CSSProperties): CSSProperties => ({ width: w, height: h, borderRadius: h, background: c, flexShrink: 0, ...extra });

function Bars({ widths, c, gap = 8, h = 9 }: { widths: (number | string)[]; c?: string; gap?: number; h?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {widths.map((w, i) => (
        <div key={i} style={bar(w, h, c)} />
      ))}
    </div>
  );
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 20, height: 20, borderRadius: 6, background: z.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, border: `2px solid ${z.bg}` }} />
      </div>
      <div style={bar(70, 10, z.primary)} />
    </div>
  );
}

function Top({ logo = false }: { logo?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
      {logo ? <Logo /> : <div style={bar(90, 12, z.barDark)} />}
      <div style={{ width: 18, height: 18, borderRadius: 9, border: `2.5px solid ${z.primary}` }} />
    </div>
  );
}

const Button = ({ light = false }: { light?: boolean }) => (
  <div style={{ height: 40, borderRadius: 8, background: light ? z.bg : z.primary, border: light ? `1.5px solid ${z.border}` : "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={bar(70, 9, light ? z.barDark : "#52525B")} />
  </div>
);
const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <div style={{ background: z.muted, borderRadius: 12, padding: 12, ...style }}>{children}</div>;
const Spacer = () => <div style={{ flex: 1 }} />;
const Check = ({ on = true }: { on?: boolean }) => (
  <div style={{ width: 16, height: 16, borderRadius: 4, background: on ? z.primary : z.bg, border: `2px solid ${z.primary}`, flexShrink: 0 }} />
);

function Welcome() {
  return (
    <>
      <div style={{ position: "relative", height: 210, marginTop: 34, marginBottom: 22 }}>
        <div style={{ position: "absolute", left: 50, top: 20, width: 140, height: 140, borderRadius: 70, background: z.muted }} />
        <div style={{ position: "absolute", left: 110, top: 64, width: 100, height: 100, borderRadius: 50, border: `5px solid ${z.primary}` }} />
        <div style={{ position: "absolute", left: 76, top: 116, width: 52, height: 52, borderRadius: 12, background: z.primary, transform: "rotate(12deg)" }} />
      </div>
      <div style={{ ...bar(170, 18, z.ink), marginBottom: 12 }} />
      <Bars widths={["100%", 190, 140]} />
      <Spacer />
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 14 }}>
        {[20, 8, 8].map((w, i) => (
          <div key={i} style={bar(w, 8, i ? z.barDark : z.primary)} />
        ))}
      </div>
      <Button />
    </>
  );
}

function Consent() {
  return (
    <>
      <div style={{ ...bar(140, 18, z.ink), margin: "20px 0 16px" }} />
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <Check />
          <Bars widths={[170, [120, 150, 90, 140][i]!]} h={8} gap={6} />
        </Card>
      ))}
      <Spacer />
      <Button />
    </>
  );
}

function Ready() {
  return (
    <>
      <div style={{ ...bar(130, 18, z.ink), margin: "20px 0 22px" }} />
      {[0, 1].map((i) => (
        <div key={i} style={{ marginBottom: 18 }}>
          <div style={{ ...bar(70, 9, z.barDark), marginBottom: 8 }} />
          <div style={{ height: 40, borderRadius: 8, border: `1.5px solid ${z.border}`, display: "flex", alignItems: "center", padding: "0 12px" }}>
            <div style={bar(i ? 120 : 60, 9)} />
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        {[50, 50].map((w, i) => (
          <div key={i} style={{ ...bar(w + 20, 30, i ? z.muted : z.primary), borderRadius: 8 }} />
        ))}
      </div>
      <Spacer />
      <Button />
    </>
  );
}

function Home() {
  return (
    <>
      <Top logo />
      <div style={bar(150, 18, z.ink)} />
      <div style={{ ...bar(190, 9), marginTop: 10, marginBottom: 18 }} />
      <div style={{ background: z.primary, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Bars widths={[110, 150]} c="#52525B" />
        <div style={{ ...bar("100%", 38, z.bg), borderRadius: 8, marginTop: 16 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[0, 1].map((k) => (
          <Card key={k}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: z.border, marginBottom: 12 }} />
            <Bars widths={[80, 56]} />
          </Card>
        ))}
      </div>
      <Spacer />
      <Card style={{ height: 22 }}>
        <div style={bar(170, 8)} />
      </Card>
    </>
  );
}

function Cases() {
  return (
    <>
      <Top />
      <div style={{ ...bar(120, 16, z.ink), marginBottom: 16 }} />
      {[0, 1, 2].map((i) => (
        <Card key={i} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: z.border, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <Bars widths={[120, 140, 80]} gap={7} h={8} />
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {[38, 46, 30].map((w) => (
                <div key={w} style={{ ...bar(w, 14, z.bg), border: `1px solid ${z.border}` }} />
              ))}
            </div>
          </div>
        </Card>
      ))}
    </>
  );
}

function Brief() {
  return (
    <>
      <Top />
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 26, background: z.border }} />
        <Bars widths={[130, 90]} h={10} />
      </div>
      <Card style={{ marginBottom: 12 }}>
        <Bars widths={[80, "100%", 150]} h={8} gap={7} />
      </Card>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <Check />
          <div style={bar([120, 100, 140][i]!, 9)} />
        </div>
      ))}
      <Spacer />
      <Card style={{ marginBottom: 12 }}>
        <Bars widths={["100%", 140]} h={7} gap={6} />
      </Card>
      <Button />
    </>
  );
}

function ChatBody({ dim = false, rows = 5 }: { dim?: boolean; rows?: number }) {
  const all = [
    { me: true, w: [140, 90] },
    { me: false, w: [160, 120, 70] },
    { me: true, w: [150] },
    { me: false, w: [120, 150] },
    { me: true, w: [130, 80] },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: dim ? 0.35 : 1 }}>
      {all.slice(0, rows).map((r, i) => (
        <div key={i} style={{ alignSelf: r.me ? "flex-end" : "flex-start", background: r.me ? z.primary : z.muted, borderRadius: r.me ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "11px 13px" }}>
          <Bars widths={r.w} c={r.me ? "#52525B" : z.barDark} gap={7} h={8} />
        </div>
      ))}
    </div>
  );
}

const Input = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <div style={{ flex: 1, height: 40, borderRadius: 20, border: `1.5px solid ${z.border}` }} />
    <div style={{ width: 40, height: 40, borderRadius: 20, background: z.primary }} />
  </div>
);

function Session() {
  return (
    <>
      <Top />
      <ChatBody />
      <Spacer />
      <Input />
    </>
  );
}

function EndSheet() {
  return (
    <>
      <Top />
      <ChatBody dim rows={3} />
      <Spacer />
      <div style={{ margin: "0 -20px -22px", background: z.bg, borderTop: `1.5px solid ${z.border}`, borderRadius: "18px 18px 0 0", padding: "16px 20px 22px" }}>
        <div style={{ ...bar(40, 5, z.barDark), margin: "0 auto 14px" }} />
        <div style={{ ...bar(140, 14, z.ink), marginBottom: 10 }} />
        <div style={{ ...bar(200, 8), marginBottom: 16 }} />
        <Button />
        <div style={{ height: 8 }} />
        <Button light />
      </div>
    </>
  );
}

function ClientEnded() {
  return (
    <>
      <Top />
      <ChatBody rows={4} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0" }}>
        <div style={{ flex: 1, height: 1.5, background: z.border }} />
        <div style={bar(90, 8, z.barDark)} />
        <div style={{ flex: 1, height: 1.5, background: z.border }} />
      </div>
      <Spacer />
      <Button />
    </>
  );
}

function ErrorState() {
  return (
    <>
      <Top />
      <ChatBody rows={3} />
      <Card style={{ marginTop: 16, border: `1.5px solid ${z.border}`, background: z.bg }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, border: `2.5px solid ${z.primary}` }} />
          <div style={bar(140, 9)} />
        </div>
        <div style={{ ...bar(70, 28, z.primary), borderRadius: 8 }} />
      </Card>
      <Spacer />
      <Input />
    </>
  );
}

function Report() {
  const section = (alt: boolean) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 20, height: 20, borderRadius: 10, background: z.muted, border: `2.5px solid ${z.primary}` }} />
        <div style={bar(90, 12, z.ink)} />
      </div>
      <Card style={{ padding: 10 }}>
        <div style={{ background: z.bg, borderRadius: 10, padding: 10, marginBottom: 8 }}>
          <Bars widths={[150, 110]} h={8} gap={6} />
        </div>
        <Bars widths={[170, 120]} h={7} gap={6} />
        {alt ? (
          <div style={{ background: z.bg, border: `1.5px solid ${z.primary}`, borderRadius: 10, padding: 10, marginTop: 8 }}>
            <Bars widths={[60, 150]} c={z.barDark} h={8} gap={6} />
          </div>
        ) : null}
      </Card>
    </div>
  );
  return (
    <>
      <Top />
      {section(false)}
      {section(true)}
      <Spacer />
      <Button />
    </>
  );
}

function Help() {
  return (
    <>
      <div style={{ ...bar(20, 20, z.barDark), marginBottom: 20 }} />
      <div style={{ ...bar(170, 18, z.ink), marginBottom: 14 }} />
      <Bars widths={["100%", 200, 160]} />
      <div style={{ height: 18 }} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1.5px solid ${z.border}` }}>
          <Bars widths={[[110, 90, 120, 100][i]!, 60]} h={8} gap={6} />
          <div style={{ width: 26, height: 26, borderRadius: 13, background: z.muted }} />
        </div>
      ))}
    </>
  );
}

function Settings() {
  return (
    <>
      <Top />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `1.5px solid ${z.border}` }}>
          <div style={bar([110, 90, 130, 70, 100, 120][i]!, 10)} />
          {i % 2 ? <div style={{ width: 34, height: 20, borderRadius: 10, background: i === 1 ? z.primary : z.barDark }} /> : <div style={bar(12, 12, z.barDark)} />}
        </div>
      ))}
    </>
  );
}

function About() {
  return (
    <>
      <Top />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, margin: "20px 0 26px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: z.primary }} />
        <div style={bar(110, 14, z.ink)} />
        <div style={bar(50, 8)} />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ ...bar(60, 10, z.barDark), marginBottom: 8 }} />
          <Bars widths={["100%", 170]} h={8} gap={6} />
        </div>
      ))}
    </>
  );
}

function Privacy() {
  return (
    <>
      <Top />
      {[0, 1, 2, 3, 4].map((i) => (
        <Card key={i} style={{ marginBottom: 10 }}>
          <div style={{ ...bar([110, 90, 130, 100, 120][i]!, 10, z.ink), marginBottom: 8 }} />
          <Bars widths={["100%", [140, 170, 110, 150, 90][i]!]} h={7} gap={6} />
        </Card>
      ))}
    </>
  );
}

function History() {
  return (
    <>
      <Top />
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Bars widths={[120, 80]} h={8} gap={7} />
          <div style={bar(36, 22, z.bg)} />
        </Card>
      ))}
    </>
  );
}

function Progress() {
  return (
    <>
      <Top />
      <div style={{ ...bar(140, 16, z.ink), marginBottom: 18 }} />
      {[0.8, 0.55, 0.7, 0.35, 0.6].map((v, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ ...bar([100, 80, 120, 90, 110][i]!, 8, z.barDark), marginBottom: 8 }} />
          <div style={{ height: 10, borderRadius: 5, background: z.muted }}>
            <div style={{ width: `${v * 100}%`, height: 10, borderRadius: 5, background: z.primary }} />
          </div>
        </div>
      ))}
    </>
  );
}

// The team's 17 screens in flow order (S1 and R1 side by side, where the answer cards land), then
// an empty frame.
const SCREENS: { kind: () => ReactNode; tall?: boolean }[] = [
  { kind: Welcome },
  { kind: Consent },
  { kind: Ready },
  { kind: Home },
  { kind: Cases },
  { kind: Brief },
  { kind: Session },
  { kind: Report },
  { kind: EndSheet },
  { kind: ClientEnded },
  { kind: ErrorState },
  { kind: Help },
  { kind: Settings },
  { kind: About },
  { kind: Privacy },
  { kind: History },
  { kind: Progress },
];

/** Row titles, as on the team's canvas. */
export function RowTitles() {
  return (
    <>
      {copy.plan.rows.map((title, r) => (
        <div key={title} style={{ position: "absolute", left: 0, top: r * (FRAME.h + FRAME.gapY) - 150, fontSize: 64, fontWeight: 900, color: z.ink, whiteSpace: "nowrap" }}>
          {title}
        </div>
      ))}
    </>
  );
}

/** One prototype screen with its name above, like a design tool's frame. */
export function ProtoFrame({ i }: { i: number }) {
  const { x, y } = framePos(i);
  const screen = SCREENS[i];
  const name = copy.plan.frames[i] ?? copy.plan.newFrame;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: FRAME.w }}>
      <div style={{ position: "absolute", top: -36, fontFamily: monoFamily, fontSize: 20, color: z.text, whiteSpace: "nowrap" }}>{name}</div>
      {screen ? (
        <div style={{ width: FRAME.w, height: FRAME.h, borderRadius: 28, background: z.bg, border: `2px solid ${z.border}`, padding: "24px 20px 22px", boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <screen.kind />
        </div>
      ) : (
        <div style={{ width: FRAME.w, height: FRAME.h, borderRadius: 28, border: `4px dashed ${z.barDark}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 90, fontWeight: 300, color: z.barDark }}>+</div>
      )}
    </div>
  );
}

/** A collaborator's cursor with a name tag. */
export function Cursor({ x, y, name, tint }: { x: number; y: number; name: string; tint: string }) {
  return (
    <div style={{ position: "absolute", left: x, top: y }}>
      <svg width={34} height={40} viewBox="0 0 17 20">
        <path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill={tint} stroke={color.paper} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
      <div style={{ marginLeft: 26, marginTop: -6, background: tint, color: color.paper, fontSize: 26, fontWeight: 700, padding: "6px 14px", borderRadius: 8, whiteSpace: "nowrap" }}>{name}</div>
    </div>
  );
}

export function DotGrid() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color.subtle,
        backgroundImage: `radial-gradient(${color.lineStrong} 1.6px, transparent 1.6px)`,
        backgroundSize: "28px 28px",
      }}
    />
  );
}
