"use client";

import { useEffect, useState } from "react";
import { currentSubscription, disableReminders, enableReminders, needsInstall, pushSupported } from "@/lib/notify";

/** Settings toggle for the 7pm reminder. */
export function NotifySettings() {
  const [on, setOn] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!pushSupported()) { if (live) { setOn(false); setNote(needsInstall() ? "On iPhone, add GeoCricket to your Home Screen first (Share → Add to Home Screen)." : "Your browser doesn't support notifications."); } return; }
      const sub = await currentSubscription();
      if (live) setOn(!!sub && Notification.permission === "granted");
    })();
    return () => { live = false; };
  }, []);
  async function toggle() {
    if (on) { await disableReminders(); setOn(false); return; }
    const ok = await enableReminders();
    setOn(ok);
    if (!ok) setNote("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span><b>Streak reminder</b><br /><span className="text-muted">One notification at 7pm IST, only if you haven&apos;t played that day.</span></span>
        <button role="switch" aria-checked={!!on} disabled={on === null || (!pushSupported())} onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-ok" : "bg-white/20"} disabled:opacity-50`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
        </button>
      </label>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
