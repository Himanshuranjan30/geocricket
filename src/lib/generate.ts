import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { getVercelOidcToken } from "@vercel/oidc";
import { sql } from "drizzle-orm";
import { ExternalAccountClient } from "google-auth-library";
import { z } from "zod";
import { getDb, schema } from "@/db";

// Daily AI drafting. Facts come from sources, never from the model:
//   Wikidata gives the ground and its coordinates → Wikipedia gives the article text →
//   Claude (on Vertex AI) writes questions ONLY from that text, quoting the sentence each one rests on →
//   we reject any draft whose quote isn't in the article verbatim → the rest land as `pending` for human review.

const UA = "GeoCricket/1.0 (question drafting; https://geocricket.app)";
const MODEL = "claude-opus-5";

/** Claude API when ANTHROPIC_API_KEY is set; otherwise Vertex AI. */
function claude() {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : vertex();
}

/** Vertex client. On Vercel: keyless, Vercel's OIDC token exchanged via GCP Workload Identity Federation. Locally: gcloud ADC. */
function vertex() {
  const projectId = process.env.GCP_PROJECT_ID!;
  const pool = process.env.GCP_WIF_PROVIDER; // projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<provider>
  if (!pool) return new AnthropicVertex({ projectId, region: "global" });
  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/${pool}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  })!;
  authClient.scopes = ["https://www.googleapis.com/auth/cloud-platform"];
  return new AnthropicVertex({ projectId, region: "global", authClient });
}

type Ground = { name: string; article: string; lat: number; lng: number; country: string };

/** Internationally notable cricket grounds (≥ 8 Wikipedia language editions) with coordinates. */
async function grounds(): Promise<Ground[]> {
  const q = `SELECT ?gLabel ?article ?c ?countryLabel WHERE {
    ?g wdt:P31 wd:Q682943; wdt:P625 ?c; wikibase:sitelinks ?n. FILTER(?n >= 8)
    OPTIONAL { ?g wdt:P17 ?country. }
    ?article schema:about ?g; schema:isPartOf <https://en.wikipedia.org/>.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA } });
  const rows: { gLabel: { value: string }; article: { value: string }; c: { value: string }; countryLabel?: { value: string } }[] = (await r.json()).results.bindings;
  return rows.flatMap((b) => {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.c.value);
    return m ? [{ name: b.gLabel.value, article: b.article.value, lng: Number(m[1]), lat: Number(m[2]), country: b.countryLabel?.value ?? "" }] : [];
  });
}

async function articleText(url: string) {
  const title = decodeURIComponent(url.split("/wiki/")[1]);
  const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=${encodeURIComponent(title)}`, { headers: { "User-Agent": UA } });
  const pages = (await r.json()).query.pages;
  return String((Object.values(pages)[0] as { extract?: string }).extract ?? "");
}

const Draft = z.object({
  questions: z.array(z.object({
    text: z.string().describe("The prompt shown to players, e.g. 'Where did Brian Lara make 400 not out?' Must not name the ground or city."),
    when: z.string().describe("Year or date of the moment, e.g. '2004'"),
    story: z.string().describe("2-3 sentence reveal told after the guess, using only facts in the article"),
    quote: z.string().describe("The exact sentence from the article this question rests on, copied character for character"),
  })),
});

const SYSTEM = `You write questions for GeoCricket, a cricket geography game: players see a famous cricket moment and tap where on the globe it happened.
You are given one cricket ground's Wikipedia article. Write up to 3 questions about memorable, specific moments that happened AT this ground (records, famous innings, historic firsts, iconic finishes).
Rules:
- Use only facts stated in the article. If the article has no clearly notable moment, return an empty list; an empty list is better than a weak or uncertain question.
- The question must not reveal the ground, city or country.
- "quote" must be copied verbatim from the article, so it can be checked automatically.
- Skip anything that did not happen at this ground (tours, other venues, non-cricket events).`;

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Draft questions from `count` grounds we haven't drafted from before. Returns how many drafts were queued. */
export async function draftDaily(count = 3) {
  const db = await getDb();
  const { questions } = schema;
  const used = new Set((await db.select({ s: questions.source }).from(questions)).map((r) => r.s));
  const pool = (await grounds()).filter((g) => !used.has(g.article));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }

  const client = claude();
  const log: string[] = [];
  let queued = 0;
  for (const g of pool.slice(0, count)) {
    const text = await articleText(g.article);
    if (text.length < 1500) { log.push(`${g.name}: article too short`); continue; }
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: zodOutputFormat(Draft) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Ground: ${g.name} (${g.country})\n\nArticle:\n${text}` }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) { log.push(`${g.name}: no output (${res.stop_reason})`); continue; }

    const flat = text.replace(/\s+/g, " ");
    // Spread drafts across the three pools that must keep growing: Nets, Versus and the daily Test Match ("edition").
    const counts = Object.fromEntries((await db.select({ pool: questions.pool, n: sql<number>`count(*)::int` }).from(questions).groupBy(questions.pool)).map((r) => [r.pool, r.n]));
    const lanes: Record<string, number> = { edition: counts.edition ?? 0, nets: counts.nets ?? 0, versus: counts.versus ?? 0 };
    for (const d of res.parsed_output.questions) {
      if (!flat.includes(d.quote.replace(/\s+/g, " ").trim())) { log.push(`${g.name}: dropped, quote not in article: "${d.text}"`); continue; }
      if (new RegExp(g.name.split(/[ ,]/)[0], "i").test(d.text)) { log.push(`${g.name}: dropped, question names the ground`); continue; }
      const id = `ai-${slug(d.text)}`;
      // Same ground + same year as an existing question (any status) is almost always the same moment.
      const [dupe] = await db.select({ id: questions.id }).from(questions).where(sql`${questions.id} = ${id} or (
        abs(${questions.lat} - ${g.lat}) < 0.05 and abs(${questions.lng} - ${g.lng}) < 0.05 and ${questions.when} like ${`%${d.when.match(/\d{4}/)?.[0] ?? d.when}%`})`);
      if (dupe) { log.push(`${g.name}: dropped, likely duplicate of ${dupe.id}`); continue; }
      const lane = (Object.entries(lanes).sort((a, b) => a[1] - b[1])[0][0]) as "edition" | "nets" | "versus";
      lanes[lane]++;
      await db.insert(questions).values({
        id, text: d.text, answer: `${g.name}${g.country ? `, ${g.country}` : ""}`, when: d.when, lat: g.lat, lng: g.lng, scaleKm: 50,
        story: `${d.story}\n\nSource: "${d.quote}"`, source: g.article, region: g.country === "India" ? "india" : "global",
        pool: lane, status: "pending", origin: "ai",
      });
      queued++;
    }
  }
  return { queued, log };
}
