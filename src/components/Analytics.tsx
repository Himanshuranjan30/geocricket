"use client";

import Script from "next/script";
import { useEffect } from "react";
import { useMe } from "@/lib/useMe";

// Google Analytics 4. Page views (including client-side navigations), scrolls and outbound clicks come from the
// stream's enhanced measurement; game events go through track(). Set only in Vercel Production, so previews and
// local dev send nothing. Consent Mode v2: storage is denied by default in the EEA, UK and Switzerland until the
// player accepts Google's consent message (AdSense Privacy & messaging), which updates the consent state itself;
// until then GA gets cookieless pings and models the rest.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const CONSENT_REGIONS = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "CH"];

// Queues straight into dataLayer (gtag needs the arguments object), so calls made before the tag loads aren't lost.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) {
  if (!GA_ID || typeof window === "undefined") return;
  const w = window as unknown as { dataLayer?: unknown[] };
  // eslint-disable-next-line prefer-rest-params
  (w.dataLayer ??= []).push(arguments);
}

// GA4's own event names where one exists, so the built-in reports (sharing, logins) fill in.
const GA_NAMES: Record<string, string> = { share_clicked: "share", signed_in: "login" };

export function track(event: string, props?: Record<string, unknown>) {
  gtag("event", GA_NAMES[event] ?? event, props);
}

export function Analytics() {
  const [me] = useMe();
  // One player = one GA user across reloads and devices: a keyed hash of the player id (never the id itself).
  useEffect(() => {
    if (!me?.aid) return;
    gtag("set", { user_id: me.aid });
    gtag("set", "user_properties", { signed_in: me.guest ? "no" : "yes", level: me.level?.level ?? 1, player_country: me.profile?.country ?? "", streak: me.streak ?? 0 });
    try { if (me.user && !sessionStorage.getItem("pm_login")) { sessionStorage.setItem("pm_login", "1"); track("signed_in", { method: "Google" }); } } catch {}
  }, [me]);
  useEffect(() => {
    const onError = (e: ErrorEvent) => gtag("event", "exception", { description: String(e.message).slice(0, 150), fatal: false });
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);
  if (!GA_ID) return null;
  return (
    <>
      <Script id="ga-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', region: ${JSON.stringify(CONSENT_REGIONS)}, wait_for_update: 500 });
        gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
        gtag('js', new Date());
        gtag('config', '${GA_ID}');
      `}</Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
    </>
  );
}
