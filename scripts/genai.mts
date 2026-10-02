// Shared Gemini image client for the art scripts: rotates across regional Vertex endpoints (the "global" pool is often
// exhausted), retrying a 429 on the next region. Auth: GOOGLE_OAUTH_TOKEN, or gcloud ADC.
import { GoogleGenAI, Modality } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { execSync } from "node:child_process";

// Regional quota is per region, so more regions = more throughput. A region that doesn't serve the model is dropped.
const REGIONS = ["us-central1", "us-east4", "europe-west1", "europe-west4", "us-east1", "us-east5", "us-south1", "us-west1", "us-west4",
  "europe-west2", "europe-west3", "europe-west8", "europe-west9", "europe-north1", "europe-central2", "europe-southwest1"];
const dead = new Set<number>();
// Tokens from gcloud last an hour: with GOOGLE_ACCOUNT set, refresh from gcloud every 30 minutes (and on a 401).
const account = process.env.GOOGLE_ACCOUNT;
const fresh = () => execSync(`gcloud auth print-access-token --account=${account}`).toString().trim();
const token = process.env.GOOGLE_OAUTH_TOKEN ?? (account ? fresh() : undefined);
const authClient = token ? new OAuth2Client() : undefined;
authClient?.setCredentials({ access_token: token });
let refreshedAt = Date.now();
const refresh = () => { if (account && authClient) { authClient.setCredentials({ access_token: fresh() }); refreshedAt = Date.now(); } };
// GEMINI_API_KEY (a Google AI Studio key, its own billing) takes priority over Vertex. Vertex runs only when explicitly
// asked for with USE_VERTEX=1, so no script ever falls back to whatever gcloud account happens to be signed in.
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && !process.env.USE_VERTEX) throw new Error("Set GEMINI_API_KEY (Google AI Studio key) to generate images. Vertex is off unless USE_VERTEX=1.");
const clients = apiKey ? [new GoogleGenAI({ apiKey })]
  : REGIONS.map((location) => new GoogleGenAI({ vertexai: true, project: "pitchmap-510208", location, googleAuthOptions: authClient ? { authClient } : undefined }));
let next = 0;

export async function image(contents: string | object[]): Promise<Buffer> {
  const body = typeof contents === "string" ? contents : [{ role: "user", parts: contents }];
  for (let attempt = 0; attempt < 48; attempt++) {
    if (Date.now() - refreshedAt > 30 * 60_000) refresh();
    let i = next++ % clients.length;
    while (dead.has(i) && dead.size < clients.length) i = next++ % clients.length;
    const ai = clients[i];
    try {
      const res = await ai.models.generateContent({ model: "gemini-2.5-flash-image", contents: body as never, config: { responseModalities: [Modality.IMAGE] } });
      const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
      if (!data) throw new Error(`no image (${res.candidates?.[0]?.finishReason})`);
      return Buffer.from(data, "base64");
    } catch (e) {
      const msg = String((e as Error).message);
      if (/401|UNAUTHENTICATED/.test(msg) && account) { refresh(); continue; }
      if (/404|NOT_FOUND|not supported|PERMISSION_DENIED/.test(msg) && dead.size < clients.length - 1) { dead.add(i); console.log("region off:", REGIONS[i]); continue; }
      if (!/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE/.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, Math.min(20000, 2000 * Math.floor(attempt / REGIONS.length + 1))));
    }
  }
  throw new Error("all regions exhausted");
}

/** Run `fn` over items with `n` at a time. */
export async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()!); }));
}
