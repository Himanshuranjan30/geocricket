import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GeoCricket challenge";

// Link preview for WhatsApp/X when someone shares their score.
export default async function Image({ params }: { params: Promise<{ score: string }> }) {
  const score = Math.max(0, Math.min(1000, Number.parseInt((await params).score, 10) || 0));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(circle at 50% 40%, #3A2FA0, #120E3A 75%)", color: "#FFFFFF", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 44, letterSpacing: 8, color: "#8FA0BF", fontWeight: 700 }}>GEOCRICKET</div>
        <div style={{ display: "flex", gap: 14, marginTop: 30 }}>
          {String(score).padStart(3, "0").split("").map((d, i) => (
            <div key={i} style={{ width: 130, height: 180, background: "#0D0A2B", border: "3px solid #3A3290", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 150, fontWeight: 800 }}>{d}</div>
          ))}
        </div>
        <div style={{ fontSize: 56, fontWeight: 800, color: "#F2B53A", marginTop: 36 }}>Can you beat me?</div>
        <div style={{ fontSize: 30, color: "#8FA0BF", marginTop: 10 }}>5 cricket moments · tap where it happened</div>
      </div>
    ),
    size,
  );
}
