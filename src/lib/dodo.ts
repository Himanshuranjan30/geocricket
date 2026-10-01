import "server-only";
import DodoPayments from "dodopayments";

// Dodo Payments (merchant of record). Staging uses test mode keys, production live keys:
// DODO_PAYMENTS_API_KEY, DODO_PAYMENTS_WEBHOOK_KEY, DODO_ENV ("test_mode" | "live"), DODO_LEGEND_PRODUCT_ID.
// The product is one-time with localized pricing in the Dodo dashboard: ₹49 in India, $0.99 elsewhere.
export const dodoEnabled = () => !!(process.env.DODO_PAYMENTS_API_KEY && process.env.DODO_LEGEND_PRODUCT_ID);

export function dodo() {
  return new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY,
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
    environment: process.env.DODO_ENV === "live" ? "live_mode" : "test_mode",
  });
}
