// ads.txt: declares Google as an authorised seller of this site's ad inventory (required; unlisted inventory earns less
// or nothing). Built from the AdSense client id (ca-pub-… → pub-…); f08c47fec0942fa0 is Google's certification id.
export const dynamic = "force-static";

export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
  const pub = client.replace(/^ca-/, "");
  const body = pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : "# Ads not configured yet\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
