"use client";

// Browser side of web push: register the service worker, subscribe, and tell the server.
const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export const pushSupported = () => typeof window !== "undefined" && !!key && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
/** iPhone/iPad Safari only allows push from a home-screen app. */
export const needsInstall = () => typeof window !== "undefined" && /iPhone|iPad/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;

const b64 = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission (must be called from a tap) and subscribe. Returns true when reminders are on. */
export async function enableReminders() {
  if (!pushSupported()) return false;
  if ((await Notification.requestPermission()) !== "granted") return false;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key!) }));
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  return res.ok;
}

export async function disableReminders() {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe();
}
