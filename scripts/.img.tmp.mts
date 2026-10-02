// One-off: reference still for the reel (Gemini image on Vertex). Usage: tsx .img.tmp.mts <prompt.txt> <out.png>
import { GoogleGenAI, Modality } from "@google/genai";
import { readFileSync, writeFileSync } from "node:fs";
const [pf, out, inImg] = process.argv.slice(2);
const KEY = process.env.GOOGLE_API_KEY; if (!KEY) throw new Error("GOOGLE_API_KEY not set (source scratchpad keys.env)");
const ai = new GoogleGenAI({ apiKey: KEY });
const res = await ai.models.generateContent({ model: "gemini-2.5-flash-image", contents: inImg ? [{ role: "user", parts: [...inImg.split(",").map((f) => ({ inlineData: { mimeType: f.endsWith(".png") ? "image/png" : "image/jpeg", data: readFileSync(f).toString("base64") } })), { text: readFileSync(pf, "utf8") }] }] : readFileSync(pf, "utf8"), config: { responseModalities: [Modality.IMAGE], imageConfig: { aspectRatio: "9:16" } } as never });
const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
if (!data) { console.log("no image", JSON.stringify(res).slice(0, 300)); process.exit(1); }
writeFileSync(out, Buffer.from(data, "base64")); console.log("saved", out);
