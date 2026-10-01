"use client";

import { BellRinging, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { store } from "@/lib/client";
import { enableReminders, needsInstall, pushSupported } from "@/lib/notify";
import { useMe } from "@/lib/useMe";
import { track } from "./Analytics";

/** From a player's 2nd day of play: offer an evening reminder so the streak doesn't die. Asked once; dismissible. */
export function StreakOptIn() {
  const [me] = useMe();
  const [state, setState] = useState<"hidden" | "ask" | "install" | "on">("hidden");
  useEffect(() => {
    if (!me || store<boolean>("pm_remind_asked")) return;
    const days = new Set(me.played ?? []).size;
    if (days < 2 && (me.streak ?? 0) < 2) return;
    // Deferred so the check runs after hydration (window APIs) without a synchronous setState in the effect.
    const t = setTimeout(() => {
      if (!pushSupported()) { if (needsInstall()) setState("install"); return; }
      if (Notification.permission === "default") setState("ask");
    }, 0);
    return () => clearTimeout(t);
  }, [me]);
  if (state === "hidden") return null;
  const done = () => { store("pm_remind_asked", true); setState("hidden"); };
  const streak = me?.streak ?? 0;
  return (
    <section className="relative flex items-start gap-3 rounded-2xl border border-[#FF8A3D]/50 bg-[#FF8A3D]/10 p-3 pr-8 text-sm">
      <BellRinging weight="duotone" size={30} className="shrink-0 text-[#FF8A3D]" />
      {state === "on" ? <span><b>Done.</b> We&apos;ll ping you in the evening if your streak needs saving.</span>
        : state === "install" ? <span><b>Keep your streak safe.</b> Add GeoCricket to your Home Screen (Share → Add to Home Screen) to get an evening reminder.</span>
        : (
          <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
            <span><b>{streak >= 2 ? `Protect your ${streak}-day streak` : "Never miss a day"}</b> with an evening reminder, only when it needs saving.</span>
            <button className="display rounded-full bg-[#FF8A3D] px-3 py-1.5 text-xs text-deep"
              onClick={async () => { const ok = await enableReminders(); track("reminder_optin", { ok }); store("pm_remind_asked", true); setState(ok ? "on" : "hidden"); }}>Remind me</button>
          </span>
        )}
      <button aria-label="Dismiss" onClick={done} className="absolute right-2 top-2 text-muted"><X size={14} /></button>
    </section>
  );
}
