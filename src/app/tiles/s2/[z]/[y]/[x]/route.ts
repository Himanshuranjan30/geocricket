// Satellite tiles (EOX Sentinel-2 cloudless, CC BY 4.0) proxied through our domain so Vercel's CDN caches them next
// to players: the first request fetches from EOX (Austria), every later one is served from the nearest edge.
const UPSTREAM = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g";

export async function GET(_req: Request, { params }: RouteContext<"/tiles/s2/[z]/[y]/[x]">) {
  const { z, y, x } = await params;
  const [Z, Y, X] = [z, y, x.replace(/\.jpg$/, "")].map(Number);
  if (![Z, Y, X].every(Number.isInteger) || Z < 0 || Z > 14 || Y < 0 || X < 0 || Y >= 2 ** Z || X >= 2 ** Z) return new Response("Bad tile", { status: 400 });
  const r = await fetch(`${UPSTREAM}/${Z}/${Y}/${X}.jpg`, { cache: "force-cache" });
  if (!r.ok) return new Response(null, { status: r.status });
  return new Response(r.body, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=604800, s-maxage=31536000, immutable" } });
}
