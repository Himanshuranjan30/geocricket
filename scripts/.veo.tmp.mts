// One-off reel shots: Veo image-to-video via Gemini API key (GOOGLE_API_KEY). Usage: tsx .veo.tmp.mts <prompt.txt> <start.jpg> <out.mp4>
import { GoogleGenAI } from "@google/genai";
import { readFileSync, writeFileSync } from "node:fs";

const [promptFile, startImg, out] = process.argv.slice(2);
const KEY = process.env.GOOGLE_API_KEY; if (!KEY) throw new Error("GOOGLE_API_KEY not set (source scratchpad keys.env)");
const ai = new GoogleGenAI({ apiKey: KEY });
const prompt = readFileSync(promptFile, "utf8");
const imageBytes = readFileSync(startImg).toString("base64");
for (const model of (process.env.VEO_MODELS ?? "veo-3.1-generate-preview,veo-3.1-fast-generate-preview").split(",")) {
  try {
    let op = await ai.models.generateVideos({ model, prompt, image: { imageBytes, mimeType: "image/jpeg" }, config: { aspectRatio: "9:16", durationSeconds: 8, numberOfVideos: 1, personGeneration: process.env.PG ?? "allow_adult" } });
    console.log("started", model);
    while (!op.done) { await new Promise((r) => setTimeout(r, 8000)); op = await ai.operations.getVideosOperation({ operation: op }); }
    const v = op.response?.generatedVideos?.[0]?.video;
    if (!v?.videoBytes && !v?.uri) { console.log("no video", model, JSON.stringify(op.response ?? op.error).slice(0, 300)); continue; }
    writeFileSync(out, v.videoBytes ? Buffer.from(v.videoBytes, "base64") : Buffer.from(await (await fetch(v.uri!, { headers: { "x-goog-api-key": KEY } })).arrayBuffer()));
    console.log("saved", model, out);
    break;
  } catch (e) { console.log("fail", model, String((e as Error).message).slice(0, 300)); }
}
