// One-off reel shots: Veo image-to-video on Vertex (personal project). Usage: tsx .veo.tmp.mts <prompt.txt> <start.jpg> <out.mp4>
import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [promptFile, startImg, out] = process.argv.slice(2);
const token = execSync("gcloud auth print-access-token --account=himanshuranjan30@gmail.com").toString().trim();
const authClient = new OAuth2Client(); authClient.setCredentials({ access_token: token });
const ai = new GoogleGenAI({ vertexai: true, project: "pitchmap-510208", location: "us-central1", googleAuthOptions: { authClient } });
const prompt = readFileSync(promptFile, "utf8");
const imageBytes = readFileSync(startImg).toString("base64");
for (const model of ["veo-3.1-generate-001", "veo-3.1-fast-generate-001"]) {
  try {
    let op = await ai.models.generateVideos({ model, prompt, image: { imageBytes, mimeType: "image/jpeg" }, config: { aspectRatio: "9:16", durationSeconds: 8, generateAudio: true, numberOfVideos: 1, personGeneration: process.env.PG ?? "allow_adult" } });
    console.log("started", model);
    while (!op.done) { await new Promise((r) => setTimeout(r, 8000)); op = await ai.operations.getVideosOperation({ operation: op }); }
    const v = op.response?.generatedVideos?.[0]?.video;
    if (!v?.videoBytes) { console.log("no video", model, JSON.stringify(op.response ?? op.error).slice(0, 300)); continue; }
    writeFileSync(out, Buffer.from(v.videoBytes, "base64"));
    console.log("saved", model, out);
    break;
  } catch (e) { console.log("fail", model, String((e as Error).message).slice(0, 300)); }
}
