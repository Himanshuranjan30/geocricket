"use client";

// Repaints a rig image's two marker colours, keeping each pixel's shading: magenta (shirt, turban, hijab) → kit colour,
// blue (hair, beard) → hair colour. Runs once per image+colours in a canvas (~15 ms for 600×1000), cached as an object URL.
const cache = new Map<string, Promise<string>>();
const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function paintRig(src: string, kitHex: string, hairHex: string) {
  const key = `${src}|${kitHex}|${hairHex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      const px = d.data;
      const kit = rgb(kitHex), hair = rgb(hairHex);
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const r = px[i], gg = px[i + 1], b = px[i + 2];
        const max = Math.max(r, gg, b), min = Math.min(r, gg, b), span = max - min, sat = max ? span / max : 0;
        if (sat < 0.25 || b <= gg) continue; // both markers have blue well above green
        const hue = max === r ? (360 + (60 * (gg - b)) / span) % 360 : max === b ? 240 + (60 * (r - gg)) / span : 120;
        const k = Math.min(1, (sat - 0.25) / 0.15); // soft edge
        let to: number[], shade: number, shine = 0;
        if (hue >= 270 && hue <= 345) { to = kit; shade = max / 185; } // magenta: the rendered shirt peaks around 185–200
        else if (hue >= 200 && hue < 265) { to = hair; shade = max / 170; shine = Math.max(0, shade - 0.8) * 110; } // blue hair; keep highlights on dark colours
        else continue;
        for (let j = 0; j < 3; j++) px[i + j] = px[i + j] * (1 - k) + Math.min(255, to[j] * shade + shine) * k;
      }
      g.putImageData(d, 0, 0);
      c.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("paint failed"))), "image/webp", 0.92);
    };
    img.onerror = reject;
    img.src = src;
  });
  cache.set(key, p);
  return p;
}

/** First candidate that loads, painted (a variant that failed to generate falls back to the next). */
export function paintFirst(srcs: string[], kitHex: string, hairHex: string, i = 0): Promise<string> {
  return paintRig(srcs[i], kitHex, hairHex).catch((e) => (i + 1 < srcs.length ? paintFirst(srcs, kitHex, hairHex, i + 1) : Promise.reject(e)));
}
