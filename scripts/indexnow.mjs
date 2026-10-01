// Tells Bing (and through it ChatGPT Search, Copilot, Perplexity) about every URL in the live sitemap via IndexNow.
// Google doesn't use IndexNow: submit the sitemap in Search Console instead. Usage: node scripts/indexnow.mjs [siteUrl]
const SITE = process.argv[2] ?? "https://geocricket.app";
const KEY = "226875f9571c2db3ddb3b93372fbc630"; // also served at /${KEY}.txt (public/)
const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (let i = 0; i < urls.length; i += 10000) {
  const r = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls.slice(i, i + 10000) }) });
  console.log(`IndexNow: ${urls.slice(i, i + 10000).length} URLs → ${r.status} ${r.statusText}`);
}
