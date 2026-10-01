"use client";

import { Bug, ChatCircleText, Lightbulb } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { track } from "./Analytics";

const KINDS = [
  { id: "bug", label: "Report a bug", icon: Bug, hint: "What happened, and what did you expect? Which mode were you playing?" },
  { id: "idea", label: "Suggest an idea", icon: Lightbulb, hint: "What would make GeoCricket better for you?" },
  { id: "other", label: "Something else", icon: ChatCircleText, hint: "Questions, a wrong answer on a question, anything." },
] as const;

/** Bug reports and ideas, stored for the daily triage in /admin/feedback. `from` = the page the player was on. */
export function FeedbackForm({ from, initialKind }: { from: string | null; initialKind: string | null }) {
  const [kind, setKind] = useState<string>(KINDS.some((k) => k.id === initialKind) ? initialKind! : "bug");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  const hint = KINDS.find((k) => k.id === kind)!.hint;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending"); setErr(null);
    const r = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, message, page: from, viewport: `${window.innerWidth}x${window.innerHeight}` }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) { setErr(d?.error ?? "Couldn't send. Check your connection and try again."); setState("idle"); return; }
    track("feedback_sent", { kind });
    setState("sent");
  }

  if (state === "sent") return (
    <div className="glass flex flex-col items-start gap-3 rounded-3xl p-6">
      <p className="display text-2xl">Thanks, got it! 🏏</p>
      <p>We read every message. If you&apos;re signed in, we may reply by email.</p>
      <div className="flex gap-3">
        <button className="btn-ghost px-4 py-2 text-sm" onClick={() => { setMessage(""); setState("idle"); }}>Send another</button>
        <Link href={from && from.startsWith("/") ? from : "/"} className="btn-primary px-4 py-2 text-sm !no-underline">Back to the game</Link>
      </div>
    </div>
  );

  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Type" className="grid gap-2 sm:grid-cols-3">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
            className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm ring-1 transition ${kind === k.id ? "bg-white/15 text-cream ring-[#F5C000]" : "bg-white/5 text-muted ring-white/10 hover:bg-white/10"}`}>
            <k.icon size={20} weight="duotone" />{k.label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-2">
        <span className="sr-only">Your message</span>
        <textarea required minLength={5} maxLength={2000} rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={hint}
          className="rounded-2xl bg-white/5 p-4 text-cream ring-1 ring-white/15 placeholder:text-muted focus:outline-none focus:ring-[#F5C000]" />
        <span className="text-right text-xs text-muted">{message.length}/2000</span>
      </label>
      {err && <p role="alert" className="text-sm text-ball">{err}</p>}
      <button type="submit" disabled={state === "sending" || message.trim().length < 5} className="btn-primary self-start px-6 py-3 text-lg disabled:opacity-50">
        {state === "sending" ? "Sending…" : "Send"}
      </button>
      <p className="text-xs text-muted">We attach the page you came from and your device type so we can reproduce bugs. No personal details unless you write them.</p>
    </form>
  );
}
