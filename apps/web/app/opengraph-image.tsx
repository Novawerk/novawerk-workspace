import { ImageResponse } from "next/og";

export const alt = "Novawerk — An open workshop for early ideas.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const OUTER = "M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z";
const CORE = "M50 36 L51.4 48.6 L64 50 L51.4 51.4 L50 64 L48.6 51.4 L36 50 L48.6 48.6 Z";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#ffffff",
          padding: 48,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "2px solid #e3e3e3",
            padding: 64,
            color: "#0f0f0f",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <svg width="64" height="64" viewBox="0 0 100 100">
              <path d={OUTER} fill="#1f7a4a" />
              <path d={CORE} fill="#0a3920" />
            </svg>
            <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: -1.5 }}>Novawerk</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ maxWidth: 660, fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05 }}>
              An open workshop for early ideas.
            </div>
            <div style={{ fontSize: 30, color: "#5c5c5c" }}>An open, non-profit community · novawerk.io</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
