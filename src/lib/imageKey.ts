// Background removal for generated character art (flat green background → transparent, feet anchored at the bottom).
import sharp from "sharp";

/** Remove the flat background: flood-fill from the image border over pixels close to the corner colour, soft edge. */
/** trim=false keeps the whole frame (rig variants must stay pixel-aligned with each other). */
export async function keyed(buf: Buffer, trim = true) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const bg = [data[0], data[1], data[2]];
  const dist = (p: number) => Math.hypot(data[p] - bg[0], data[p + 1] - bg[1], data[p + 2] - bg[2]);
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const k = stack.pop()!;
    if (seen[k]) continue;
    seen[k] = 1;
    const d = dist(k * 4);
    if (d > 60) continue; // reached the character
    data[k * 4 + 3] = d < 30 ? 0 : Math.round(255 * (d - 30) / 30);
    const x = k % w, y = (k / w) | 0;
    if (x > 0) stack.push(k - 1); if (x < w - 1) stack.push(k + 1);
    if (y > 0) stack.push(k - w); if (y < h - 1) stack.push(k + w);
  }
  // Green left in enclosed gaps (between the legs, inside the grille): the character itself has no bright green.
  for (let p = 0; p < data.length; p += 4) {
    const spill = data[p + 1] - Math.max(data[p], data[p + 2]);
    if (spill > 70) data[p + 3] = 0;
    else if (spill > 25) data[p + 1] = Math.max(data[p], data[p + 2]);
  }
  const img = sharp(data, { raw: info });
  return (trim ? img.trim() : img).resize(600, 1000, { fit: "contain", position: "bottom", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toBuffer();
}

export async function cleanShadow(input: Buffer | string) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const start = Math.floor(info.height * 0.5) * info.width * 4;
  for (let p = start; p < data.length; p += 4) {
    const [r, g, b, a] = [data[p], data[p + 1], data[p + 2], data[p + 3]];
    if (!a) continue;
    const olive = Math.abs(r - g) < 22 && b < g - 18 && g < 190; // muddy yellow-green/brown, not white pads or beige bat
    const greenish = g > r + 6 && g > b + 6; // any green cast left
    if (olive || greenish) data[p + 3] = 0;
  }
  return sharp(data, { raw: info }).webp({ quality: 90 }).toBuffer();
}

