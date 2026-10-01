import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
const token = execSync("gcloud auth print-access-token --account=himanshuranjan30@gmail.com").toString().trim();
const authClient = new OAuth2Client(); authClient.setCredentials({ access_token: token });
const ai = new GoogleGenAI({ vertexai: true, project: "pitchmap-510208", location: "us-central1", googleAuthOptions: { authClient } });
for (const f of process.argv.slice(2)) {
  const res = await ai.models.generateContent({ model: "gemini-2.5-pro", contents: [{ role: "user", parts: [{ inlineData: { mimeType: "video/mp4", data: readFileSync(f).toString("base64") } },
    { text: "Transcribe every spoken line verbatim with precise start-end seconds (two decimals) and speaker (single person on camera). Also list key visual moments with times (head turns, smile, phone tap, cheer, hug, father appears). Output plain lines: 0.30-2.90 | blue | text" }] }] });
  console.log("==", f.split("/").pop()); console.log(res.text);
}
