import { ImageResponse } from "next/og";
import { whoSet } from "@/lib/who";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Mystery Cricketer creator challenge";

// Link preview for X/WhatsApp: the challenge title, its host, and one "?" silhouette per cricketer.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const set = /^[a-z0-9-]{2,30}$/.test(slug) ? await whoSet(`c:${slug}`) : null;
  const title = set?.challenge?.title ?? "Mystery Cricketer", host = set?.challenge?.hostHandle, n = set?.puzzles.length ?? 3;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(circle at 50% 40%, #3A2FA0, #120E3A 75%)", color: "#FFFFFF", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 30, letterSpacing: 8, color: "#F5C000", fontWeight: 700 }}>GEOCRICKET · MYSTERY CRICKETER</div>
        <div style={{ fontSize: 76, fontWeight: 800, marginTop: 24, maxWidth: 1050, textAlign: "center", lineHeight: 1.05 }}>{title}</div>
        {host && <div style={{ fontSize: 36, color: "#CFC8F5", marginTop: 14 }}>{`Hosted by @${host}`}</div>}
        <div style={{ display: "flex", gap: 22, marginTop: 40 }}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} style={{ width: 110, height: 110, borderRadius: 999, border: "5px solid #F5C000", background: "#241a7a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64, fontWeight: 800, color: "#B9AEFF" }}>?</div>
          ))}
        </div>
        <div style={{ fontSize: 44, fontWeight: 800, color: "#F2B53A", marginTop: 40 }}>Can you name them? Beat the host.</div>
      </div>
    ),
    size,
  );
}
