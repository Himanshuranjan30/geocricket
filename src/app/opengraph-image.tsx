import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GeoCricket: the daily cricket geography game";

// Default link preview (WhatsApp, X, search thumbnails) for every page without its own: the logo, the wordmark and
// the hook. Pages with their own image, like score challenges, override it.
// Rubik (the site's display font) for the wordmark and copy; satori needs the raw font file. Falls back to the default
// sans if Google Fonts can't be reached, so the preview never fails.
async function rubik(weight: number, italic: boolean) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Rubik:ital,wght@${italic ? 1 : 0},${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? { name: "Rubik", data: await (await fetch(url)).arrayBuffer(), weight: weight as 700, style: (italic ? "italic" : "normal") as "italic" } : null;
  } catch { return null; }
}

export default async function Image() {
  const fonts = (await Promise.all([rubik(900, true), rubik(700, false), rubik(500, false)])).filter((f) => !!f);
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/logo-512.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 56, color: "#FFFFFF", fontFamily: "Rubik, sans-serif",
        background: "radial-gradient(circle at 30% 40%, #4B3BB8, #1A1454 55%, #0B0928 100%)", padding: "0 80px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain img */}
        <img src={logo} width={300} height={300} alt="" style={{ borderRadius: 72, boxShadow: "0 0 90px rgba(120,90,255,.55)" }} />
        <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
          <div style={{ display: "flex", fontSize: 112, fontWeight: 900, fontStyle: "italic", letterSpacing: -2, lineHeight: 1 }}>
            <span>GEO</span><span style={{ color: "#FF5A6E" }}>CRICKET</span>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#F5C000", marginTop: 26 }}>Lara&apos;s 400. Dhoni&apos;s six. Kapil&apos;s &apos;83.</div>
          <div style={{ fontSize: 40, fontWeight: 500, color: "#E4E1FA", marginTop: 6 }}>Can you pin where they happened?</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: "#40DC82", marginTop: 30 }}>The free daily cricket geography game</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
