"use client";

import { tierOf } from "./game";

export type Result = { xp?: number; test?: boolean; rival?: { handle: string; points: number } | null; points: number; km: number; mult: number; guess: [number, number]; answer: { id: string; name: string; when: string; story: string; lat: number; lng: number; source: string } };

// Safe during server rendering too (no window there): falls back to the production origin.
export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? (typeof window !== "undefined" ? window.location.origin : "https://geocricket.app");
export const siteHost = () => siteUrl().replace(/^https?:\/\//, "").replace(/\/$/, "");
export const totalOf = (rs: Result[]) => rs.reduce((s, r) => s + r.points * r.mult, 0);

function store<T>(key: string, value?: T): T | null {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) ?? "null");
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  return value ?? null;
}
export { store };

export function shareText(number: number, dateLabel: string, rs: Result[], streak: number) {
  const total = totalOf(rs);
  return `🏏 GeoCricket #${number} · ${dateLabel}\n${total}/1000${streak ? ` · 🔥${streak}` : ""}\n${rs.map((r) => tierOf(r.points).emoji).join("")}\nBeat me → ${siteHost()}/c/${total}`;
}

export const fmtDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

let actx: AudioContext | null = null;
/** Sound is on unless the player muted it. */
export const soundOn = () => store<boolean>("pm_sound") !== false;
export const setSoundOn = (on: boolean) => store("pm_sound", on);
const ctx = () => { actx ??= new AudioContext(); if (actx.state === "suspended") void actx.resume(); return actx; };

/** One synthesized note: frequency (optionally sliding), length, waveform, volume, start offset in seconds. */
function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.25, at = 0, slideTo?: number) {
  const a = ctx(), t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}

/** Game sound effects (synthesized, nothing to download). Silent when muted or before the first user gesture. */
export function sfx(name: "tick" | "go" | "lock" | "hit" | "hurt" | "win" | "lose" | "draw") {
  if (!soundOn()) return;
  try {
    if (name === "tick") tone(880, 0.08, "square", 0.08);
    else if (name === "go") { tone(660, 0.12, "square", 0.12); tone(1320, 0.25, "square", 0.12, 0.12); }
    else if (name === "lock") { tone(520, 0.06, "triangle", 0.2); tone(780, 0.1, "triangle", 0.2, 0.06); }
    else if (name === "hit") { crack(); tone(220, 0.35, "sawtooth", 0.18, 0, 70); tone(880, 0.15, "square", 0.1, 0.05, 1760); }
    else if (name === "hurt") { tone(300, 0.5, "sawtooth", 0.22, 0, 60); tone(90, 0.4, "sine", 0.35, 0.02, 45); }
    else if (name === "win") [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.16, "triangle", 0.22, i * 0.13));
    else if (name === "lose") [392, 330, 262, 196].forEach((f, i) => tone(f, i === 3 ? 0.7 : 0.2, "triangle", 0.2, i * 0.18));
    else tone(440, 0.25, "triangle", 0.15);
  } catch {}
}

/** Short synthesized bat-crack. Only plays after a user gesture and when sound is on. */
export function crack() {
  if (!soundOn()) return;
  try {
    actx = ctx();
    const len = actx.sampleRate * 0.12, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain();
    bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 1.2; g.gain.value = 0.9;
    src.buffer = buf; src.connect(bp).connect(g).connect(actx.destination); src.start();
  } catch {}
}
export const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch {} };

/** 1080x1350 scorecard image for WhatsApp Status / Instagram Stories. */
export async function shareImage(number: number, dateLabel: string, rs: Result[], streak: number) {
  await document.fonts?.ready;
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
  const g = c.getContext("2d")!;
  const display = getComputedStyle(document.documentElement).getPropertyValue("--font-body") || "Impact";
  const bg = g.createRadialGradient(540, 520, 60, 540, 620, 900);
  bg.addColorStop(0, "#3A2FA0"); bg.addColorStop(1, "#120E3A"); g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  g.textAlign = "center"; g.fillStyle = "#FFFFFF"; g.font = `800 120px ${display}`; g.fillText("GEOCRICKET", 540, 210);
  g.fillStyle = "#8FA0BF"; g.font = `600 40px ${display}`; g.fillText(`NO. ${number} · ${dateLabel.toUpperCase()}`, 540, 280);
  const s = String(totalOf(rs)).padStart(3, "0"), tw = 170, gap = 16, x0 = 540 - (s.length * tw + (s.length - 1) * gap) / 2;
  [...s].forEach((ch, i) => {
    const x = x0 + i * (tw + gap);
    g.fillStyle = "#0D0A2B"; g.beginPath(); g.roundRect(x, 380, tw, 230, 18); g.fill();
    g.strokeStyle = "#3A3290"; g.lineWidth = 3; g.stroke();
    g.fillStyle = "#FFFFFF"; g.font = `700 200px ${display}`; g.fillText(ch, x + tw / 2, 570);
    g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(x, 494, tw, 3);
  });
  g.fillStyle = "#8FA0BF"; g.font = `600 48px ${display}`; g.fillText("/ 1000", 540, 690);
  rs.forEach((r, i) => { g.fillStyle = tierOf(r.points).color; g.beginPath(); g.arc(540 - 240 + i * 120, 810, 42, 0, Math.PI * 2); g.fill(); });
  if (streak) { g.fillStyle = "#FFFFFF"; g.font = `600 52px sans-serif`; g.fillText(`🔥 ${streak} day streak`, 540, 960); }
  g.fillStyle = "#F2B53A"; g.font = `800 64px ${display}`; g.fillText("CAN YOU BEAT ME?", 540, 1110);
  g.fillStyle = "#8FA0BF"; g.font = `500 40px sans-serif`; g.fillText(`${siteHost()}/c/${totalOf(rs)}`, 540, 1180);
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
}

/** Make sure this browser has a player (a guest one if needed), like the Daily does. Returns false if that failed. */
export async function ensurePlayer() {
  const m = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
  if (m?.profile) return true;
  const { avatarCode } = await import("./avatar"), { encodeLook, randomLook } = await import("./rig");
  const r = await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: "", avatar: avatarCode(encodeLook(randomLook()), "india"), country: m?.suggestedCountry ?? "IN" }) }).catch(() => null);
  return !!r?.ok;
}
