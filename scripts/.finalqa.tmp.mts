// One-off: whole-reel QA by Gemini 2.5 Pro. Usage: tsx .finalqa.tmp.mts <reel.mp4>
import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
const r = await ai.models.generateContent({ model: "gemini-2.5-pro", contents: [{ role: "user", parts: [{ inlineData: { mimeType: "video/mp4", data: readFileSync(process.argv[2]).toString("base64") } }, { text: `Strict QA of this Instagram reel. Report as a numbered list:
1. Every spoken line with timestamp and which girl says it (curly hair/lilac hoodie = Riya, ponytail/glasses = Meher).
2. Any moment where the audio does not match the lips of the person on screen (lip-sync errors) - with timestamps. Say "none" if none.
3. Any on-screen caption that does not match what is said.
4. Any visual glitches (faces changing identity, extra people, morphing hands), awkward cuts, silences or audio dropouts.
5. Does the story make sense to a first-time viewer? One line.` }] }] });
console.log(r.text);
