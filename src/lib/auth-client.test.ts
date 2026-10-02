import { describe, expect, it } from "vitest";
import { inAppBrowser } from "./auth-client";

// Real user agents: the apps creator links get opened in, and the browsers where Google sign-in works.
const IN_APP = {
  "X / Twitter (iOS)": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.48",
  "X / Twitter (Android)": "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 TwitterAndroid",
  "Instagram (iOS)": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.3.12.235",
  "Facebook (Android)": "Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.48.109;]",
  "WhatsApp (Android webview)": "Mozilla/5.0 (Linux; Android 12; RMX3371; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 WhatsApp/2.24",
  "LinkedIn (iOS)": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]",
  "Telegram (Android)": "Mozilla/5.0 (Linux; Android 13; 2201117TI; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0 Mobile Safari/537.36 Telegram-Android/10.2",
};
const BROWSERS = {
  "Safari (iOS)": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Chrome (Android)": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  "Chrome (iOS)": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1",
  "Chrome (Mac)": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Samsung Internet": "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  "Firefox (Android)": "Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0",
};

describe("in-app browser detection (Google sign-in is blocked there)", () => {
  for (const [name, ua] of Object.entries(IN_APP)) it(`flags ${name}`, () => expect(inAppBrowser(ua)).toBe(true));
  for (const [name, ua] of Object.entries(BROWSERS)) it(`lets ${name} sign in`, () => expect(inAppBrowser(ua)).toBe(false));
});
