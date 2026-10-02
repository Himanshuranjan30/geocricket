"use client";

import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import { signInWithGoogle } from "@/lib/auth-client";
import { JERSEYS, avatarCode, parseAvatar, type Jersey } from "@/lib/avatar";
import { encodeLook, lookOf, randomLook, type Look } from "@/lib/rig";
import { AvatarEditor } from "./AvatarEditor";
import { CountrySelect } from "./CountrySelect";
import { Avatar } from "./Avatar";
import { COUNTRIES, validateProfile, type Profile } from "@/lib/profile";
import { Flag } from "./Flag";


/** Avatar + handle + country, required before the daily round so every score has a name and a flag. */
export type Account = { name: string; email: string; image: string | null } | null;

const handleFrom = (name?: string) => (name ?? "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 16);

/**
 * guest: handle optional (a random guest handle is assigned), with what signing in unlocks.
 * onboard: first run after sign-up (step 1 of 2), marks the player onboarded. inline: renders as a page section (settings).
 */
export function ProfileSetup({ initial, suggestedCountry, user, googleEnabled, onDone, onCancel, onboard = false, inline = false, intro }: {
  initial: Profile | null; suggestedCountry: string | null; user: Account; googleEnabled: boolean;
  onDone: (p: Profile) => void; onCancel?: () => void; onboard?: boolean; inline?: boolean;
  intro?: string; // why they're here, for people arriving from a link: "@friend invited you to a live 1v1"
}) {
  const guest = !user;
  useEffect(() => {
    if (inline || !onCancel) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [inline, onCancel]);
  const start = parseAvatar(initial?.avatar && !initial.avatar.startsWith("legend:") ? initial.avatar : avatarCode(encodeLook(randomLook()), "india"));
  const [look, setLook] = useState<Look>(() => lookOf(start.seed));
  const [jersey, setJersey] = useState<Jersey>(start.jersey);
  const avatar = avatarCode(encodeLook(look), jersey);
  const [handle, setHandle] = useState(initial?.handle && !(user && initial.handle.startsWith("guest_")) ? initial.handle : guest ? "" : handleFrom(user?.name));
  const [country, setCountry] = useState(initial?.country ?? (suggestedCountry && COUNTRIES.includes(suggestedCountry) ? suggestedCountry : "IN"));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adult, setAdult] = useState(false);
  // 18+ is confirmed when an account is set up (and again before any purchase, server-side). Guests play first, like
  // the guest who's auto-created on /play, so an invite link never opens on a form they must tick to try the game.
  const askAge = !initial && !guest;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = { avatar, handle: handle.trim(), country };
    const invalid = guest && !p.handle ? null : validateProfile(p);
    if (invalid) return setError(invalid);
    if (askAge && !adult) return setError("GeoCricket is for players aged 18 and over. Tick the box to confirm.");
    setSaving(true); setError(null);
    if (askAge) await fetch("/api/me/age", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adult: true }) }).catch(() => {});
    const res = await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...p, onboarded: onboard || undefined }) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error ?? "Couldn't save your profile. Try again.");
    onDone(data.profile);
  }

  return (
    <div className={inline ? "" : "fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgba(3,6,12,.82)] px-4 py-6 backdrop-blur-sm"}
      onMouseDown={(e) => { if (!inline && onCancel && e.target === e.currentTarget) onCancel(); }}>
      <form onSubmit={save} className={`relative w-full ${inline ? "flex flex-col gap-5" : "rise flex max-w-[1060px] flex-col gap-5 rounded-[20px] border border-line bg-panel p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-x-8 lg:gap-y-5 lg:p-7"}`}>
        {!inline && onCancel && (
          <button type="button" onClick={onCancel} aria-label="Close"
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-cream hover:bg-white/20"><X weight="bold" size={18} /></button>
        )}
        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1">
        {!inline && (
          <div>
            {intro && <p className="mb-3 rounded-xl bg-[#F5C000]/15 px-3 py-2 text-sm font-semibold text-[#F5C000]">{intro}</p>}
            <p className="display text-[13px] font-semibold tracking-[.16em] text-muted">{onboard ? "Step 1 of 2 · Create your player" : initial ? "Edit character" : guest ? "Quick setup" : "Before the first ball"}</p>
            <h2 className="display mt-1 text-[34px] font-extrabold leading-none">{onboard ? "Welcome to the crease" : "Walk out to bat"}</h2>
            <p className="mt-2 text-sm text-muted">{onboard ? "Your progress is saved. Pick your look, handle and flag. You can change them any time in Settings." : guest ? "Pick your look and start playing. No account needed." : "Your avatar, handle and flag appear on the leaderboards."}</p>
          </div>
        )}

        {googleEnabled && guest && !inline && (
          <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
            <button type="button" onClick={() => signInWithGoogle()}
              className="flex items-center justify-center gap-2.5 rounded-xl bg-white py-3 font-semibold text-[#1F1F1F]">
              <GoogleMark /> Continue with Google
            </button>
            <ul className="grid grid-cols-3 gap-1 text-center text-[11px] leading-tight text-muted">
              <li>🏆 Get on the leaderboards</li><li>🔥 Keep your streak on any device</li><li>👑 Unlock legends</li>
            </ul>
            <p className="text-center text-xs text-muted">Or set up below and play as a guest. Your scores stay on this device. By playing you agree to the <a href="/terms" target="_blank" className="underline">terms</a> (18+).</p>
          </div>
        )}
        {user && <p className="rounded-xl bg-panel-2 px-3 py-2 text-sm">Signed in as <b>{user.email}</b></p>}
        </div>

        <fieldset className={`flex min-w-0 flex-col gap-3 ${inline ? "" : "lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:rounded-2xl lg:bg-white/[.03] lg:p-4"}`}>
          <legend className="mb-2 text-sm font-semibold">Your player</legend>
          <a href="/locker" className="display relative -mt-1 rounded-xl border border-[#F5C000]/50 bg-[#F5C000]/10 px-3 py-2 text-center text-sm !text-[#F5C000] !no-underline">
            {initial?.avatar.startsWith("legend:") ? "Wearing a legend · change it in the Legends Locker" : <>Or play as a cricket legend → <span className="ml-1.5 inline-block -translate-y-px rounded-full bg-[#FF5A6E] px-2 py-0.5 align-middle text-[10px] tracking-wide text-white shadow-[0_0_12px_rgba(255,90,110,.6)]">🔥 Popular</span></>}
          </a>
          <AvatarEditor look={look} jersey={jersey} onChange={setLook} onRandom={() => setLook(randomLook())} wide={!inline} />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kit colour">
            {(Object.keys(JERSEYS) as Jersey[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={jersey === k} aria-label={JERSEYS[k].label} title={JERSEYS[k].label} onClick={() => setJersey(k)}
                className={`h-8 w-8 rounded-full border-2 transition ${jersey === k ? "scale-110 border-cream" : "border-line"}`}
                style={{ background: `#${JERSEYS[k].shirt}` }} />
            ))}
          </div>
          <p className="text-xs text-muted">Kit: {JERSEYS[jersey].label}</p>
        </fieldset>

        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-2 lg:self-end">
        <div className="flex flex-col gap-2">
          <label htmlFor="handle" className="text-sm font-semibold">Handle</label>
          <div className="flex items-center rounded-xl border border-line bg-deep focus-within:border-ok">
            <span className="pl-3 text-muted">@</span>
            <input id="handle" value={handle} onChange={(e) => setHandle(e.target.value.replace(/\s/g, ""))} maxLength={16} autoComplete="nickname"
              placeholder="CoverDrive_07" className="min-w-0 flex-1 bg-transparent px-1.5 py-3 outline-none" />
          </div>
          <p className="text-xs text-muted">{guest ? "Optional for guests. Leave it blank and we'll pick one." : "3–16 letters, numbers or underscores."}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="country" className="text-sm font-semibold">Country</label>
          <CountrySelect id="country" value={country} onChange={setCountry} />
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-panel-2 px-3 py-2.5">
          <Avatar code={avatar} size={40} />
          <span className="min-w-0 flex-1 truncate font-semibold">@{handle || (guest ? "guest" : "yourhandle")}</span>
          <Flag code={country} size={20} />
        </div>

        {askAge && (
          <label className="flex items-start gap-2.5 text-sm leading-snug">
            <input type="checkbox" required checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#46C27A]" />
            <span>I&apos;m 18 or older and agree to the <a href="/terms" target="_blank" className="text-ok underline">terms</a> and <a href="/privacy" target="_blank" className="text-ok underline">privacy policy</a>.</span>
          </label>
        )}
        {error && <p role="alert" className="text-sm text-[#FF8F9C]">{error}</p>}
        <div className="flex gap-2.5">
          {onCancel && <button type="button" onClick={onCancel} className="btn-ghost px-4">{onboard ? "Later" : "Back"}</button>}
          <button className="btn-primary flex-1 py-3.5 text-xl" disabled={saving}>{saving ? "Saving…" : onboard ? "Next: pick a legend →" : initial ? "Save" : guest ? "Play as guest →" : "Take guard →"}</button>
        </div>
        </div>
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
