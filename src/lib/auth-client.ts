"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

// Google refuses to sign in inside embedded browsers ("disallowed_useragent"): the in-app browsers of X, Instagram,
// Facebook, WhatsApp, Snapchat, LinkedIn, Telegram and Android WebViews. Creator links are opened there first.
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Twitter|TwitterAndroid|WhatsApp|Snapchat|LinkedInApp|Line\/|MicroMessenger|Telegram|GSA\/|; wv\)/i;
export const inAppBrowser = (ua = typeof navigator === "undefined" ? "" : navigator.userAgent) => IN_APP.test(ua);
export const IN_APP_EVENT = "pm:in-app-signin";

/** Where to come back to after Google: this exact page (path and query, so ?host=, ?vs=, ?c= survive) plus welcome=1. */
export function here() {
  const u = new URL(window.location.href);
  u.searchParams.set("welcome", "1");
  return u.pathname + u.search + u.hash;
}

/** Sign in with Google and return to `callbackURL` (default: this page). In an in-app browser it asks the player to
 * open the page in their real browser first (InAppSignIn), since Google would refuse there. */
export function signInWithGoogle(callbackURL?: string) {
  if (inAppBrowser()) { window.dispatchEvent(new CustomEvent(IN_APP_EVENT)); return Promise.resolve(); }
  return authClient.signIn.social({ provider: "google", callbackURL: callbackURL ?? here() });
}
// Full reload on purpose: drops all signed-in client state.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
export const signOut = () => authClient.signOut().then(() => window.location.assign("/"));
