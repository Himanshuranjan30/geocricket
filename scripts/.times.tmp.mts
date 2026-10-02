// One-off: phrase-level speech timings as JSON. Usage: tsx .times.tmp.mts clips...
import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
for (const f of process.argv.slice(2)) {
  const r = await ai.models.generateContent({ model: "gemini-2.5-pro", contents: [{ role: "user", parts: [{ inlineData: { mimeType: "video/mp4", data: readFileSync(f).toString("base64") } }, { text: 'List every spoken phrase with precise start and end seconds (2 decimals) as JSON: [{"t0":n,"t1":n,"text":s}]. Also include the moment the main action happens as {"t0":n,"t1":n,"text":"[action: ...]"} entries (taps, covers face, falls back, buzz, gasp, hug).' }] }], config: { responseMimeType: "application/json" } });
  console.log(f.split("/").pop(), JSON.stringify(JSON.parse(r.text!)));
}
