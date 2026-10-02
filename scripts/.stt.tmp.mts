import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";
const KEY = process.env.GOOGLE_API_KEY; if (!KEY) throw new Error("GOOGLE_API_KEY not set (source scratchpad keys.env)");
const ai = new GoogleGenAI({ apiKey: KEY });
for (const f of process.argv.slice(2)) {
  const res = await ai.models.generateContent({ model: "gemini-2.5-pro", contents: [{ role: "user", parts: [{ inlineData: { mimeType: "video/mp4", data: readFileSync(f).toString("base64") } },
    { text: "Transcribe every spoken line verbatim with precise start-end seconds (two decimals) and speaker (single person on camera). Also list key visual moments with times (head turns, smile, phone tap, cheer, hug, father appears). Output plain lines: 0.30-2.90 | blue | text" }] }] });
  console.log("==", f.split("/").pop()); console.log(res.text);
}
