"use client";

import { ArrowSquareOut, CheckCircle, Copy, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { IN_APP_EVENT } from "@/lib/auth-client";
import { track } from "./Analytics";

/**
 * Site-wide sign-in helpers, mounted once in the root layout:
 * - in an in-app browser (X, Instagram, WhatsApp…), "Continue with Google" opens this sheet instead: open the page in
 *   Chrome/Safari, where Google allows sign-in. Android gets a one-tap intent link; iOS gets the menu steps + copy link.
 * - after Google sends the player back (?welcome=1 on any page), a "Signed in, progress saved" toast, and the param
 *   is removed from the address bar.
 */
export function AuthLayer() {
  const [sheet, setSheet] = useState(false);
  const [copied, setCopied] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);

  useEffect(() => {
    const open = () => { setSheet(true); track("signin_in_app_blocked"); };
    window.addEventListener(IN_APP_EVENT, open);
    const u = new URL(window.location.href);
    if (u.searchParams.has("welcome")) {
      u.searchParams.delete("welcome");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      // Only once the session is real: the player may have cancelled on Google's screen and come back signed out.
      fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((m) => {
        if (!m?.user) return;
        setWelcome(m.merged ? "Signed in. Everything you played as a guest is now in your account." : "Signed in. Your scores, streak and XP are saved to your account.");
        track("signin_completed", { merged: !!m.merged });
      }, () => {});
    }
    return () => window.removeEventListener(IN_APP_EVENT, open);
  }, []);
  useEffect(() => { if (!welcome) return; const t = setTimeout(() => setWelcome(null), 5000); return () => clearTimeout(t); }, [welcome]);

  const url = typeof window === "undefined" ? "" : window.location.href;
  const android = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const intent = url && `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;end`;

  return (
    <>
      {welcome && (
        <p role="status" className="rise fixed inset-x-4 top-[calc(env(safe-area-inset-top)+12px)] z-[60] mx-auto flex max-w-[460px] items-center gap-2 rounded-2xl bg-[#1E6B45] px-4 py-3 text-sm shadow-2xl ring-1 ring-white/20" onClick={() => setWelcome(null)}>
          <CheckCircle weight="fill" size={20} className="shrink-0 text-ok" />{welcome}
        </p>
      )}
      {sheet && (
        <div className="fixed inset-0 z-[70] grid place-items-end bg-black/70 p-3 sm:place-items-center" onClick={() => setSheet(false)}>
          <div role="dialog" aria-label="Open in your browser to sign in" className="rise relative w-full max-w-md rounded-3xl bg-panel p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Close" onClick={() => setSheet(false)} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/10"><X size={16} /></button>
            <p className="display px-8 text-2xl">Open in your browser to sign in</p>
            <p className="mt-2 text-sm text-muted">Google doesn&apos;t allow sign-in inside this app&apos;s browser. Open this page in {android ? "Chrome" : "Safari"} and sign in there: everything you play from then on is saved to your account. (Anything played here as a guest stays in this app&apos;s browser.)</p>
            {android ? (
              <a href={intent} onClick={() => track("signin_in_app_open", { via: "intent" })} className="btn-primary mt-4 flex items-center justify-center gap-2 py-3 text-lg !no-underline"><ArrowSquareOut weight="bold" />Open in Chrome</a>
            ) : (
              <ol className="mt-4 flex flex-col gap-1.5 rounded-2xl bg-white/5 p-3 text-left text-sm">
                <li>1. Tap the <b>⋯</b> or share icon in this app&apos;s browser bar</li>
                <li>2. Choose <b>Open in Safari</b> (or Open in browser)</li>
                <li>3. Tap <b>Continue with Google</b> there</li>
              </ol>
            )}
            <button onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }, () => {}); track("signin_in_app_open", { via: "copy" }); }}
              className="btn-ghost mt-2 flex w-full items-center justify-center gap-2 py-3 font-semibold"><Copy weight="bold" />{copied ? "Link copied: paste it in your browser" : "Copy link"}</button>
            <p className="mt-2 text-xs text-muted">Or keep playing as a guest. Your scores stay on this device.</p>
          </div>
        </div>
      )}
    </>
  );
}
