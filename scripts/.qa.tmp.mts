// One-off QA gate for generated reel shots (Gemini 2.5 Pro watches the clip). Usage: tsx .qa.tmp.mts <clip.mp4> <expected.json-entry>
import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";
const [clip, specJson] = process.argv.slice(2); const spec = JSON.parse(specJson);
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
const ask = `You are a strict QA reviewer for a short video clip.
Expected: ${spec.who === "both" ? "exactly two girls on screen" : `exactly one girl (${spec.who}) on screen the whole time`}. Action: ${spec.act}.
Expected speech: ${spec.line ? `"${spec.line}" (Hinglish), spoken by her, nothing else` : "no words at all, only squeals/laughter"}.
Fail if: any word differs in meaning or extra words are spoken; another person appears or a face changes identity; obvious glitches (melting hands, morphing face); any on-screen text or subtitles.
Return JSON: {"pass": boolean, "transcript": string, "speech_start": number, "speech_end": number, "issues": string}. speech_start/end are seconds of the spoken line (0 if none).`;
const r = await ai.models.generateContent({ model: "gemini-2.5-pro", contents: [{ role: "user", parts: [{ inlineData: { mimeType: "video/mp4", data: readFileSync(clip).toString("base64") } }, { text: ask }] }], config: { responseMimeType: "application/json" } });
console.log(r.text);
