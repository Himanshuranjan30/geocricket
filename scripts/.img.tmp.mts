// One-off: reference still for the reel (Gemini image on Vertex). Usage: tsx .img.tmp.mts <prompt.txt> <out.png>
import { GoogleGenAI, Modality } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const [pf, out, inImg] = process.argv.slice(2);
const token = execSync("gcloud auth print-access-token --account=himanshuranjan30@gmail.com").toString().trim();
const authClient = new OAuth2Client(); authClient.setCredentials({ access_token: token });
const ai = new GoogleGenAI({ vertexai: true, project: "pitchmap-510208", location: "global", googleAuthOptions: { authClient } });
const res = await ai.models.generateContent({ model: "gemini-2.5-flash-image", contents: inImg ? [{ role: "user", parts: [...inImg.split(",").map((f) => ({ inlineData: { mimeType: f.endsWith(".png") ? "image/png" : "image/jpeg", data: readFileSync(f).toString("base64") } })), { text: readFileSync(pf, "utf8") }] }] : readFileSync(pf, "utf8"), config: { responseModalities: [Modality.IMAGE], imageConfig: { aspectRatio: "9:16" } } as never });
const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
if (!data) { console.log("no image", JSON.stringify(res).slice(0, 300)); process.exit(1); }
writeFileSync(out, Buffer.from(data, "base64")); console.log("saved", out);
