import "server-only";

// DataFast revenue attribution (datafa.st/docs/api-create-payment): report a paid order against the visitor's marketing
// channel. The visitor id comes from the checkout metadata (api/pay/order). Skipped without DATAFAST_API_KEY; the
// transaction id makes retries (webhook redeliveries) idempotent on DataFast's side.
export async function reportSale(p: { transactionId: string; minorAmount: number; currency: string; visitorId?: string; email?: string; customerId?: string }) {
  const key = process.env.DATAFAST_API_KEY;
  if (!key || !p.minorAmount) return;
  const decimals = new Intl.NumberFormat("en", { style: "currency", currency: p.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const res = await fetch("https://datafa.st/api/v1/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: p.minorAmount / 10 ** decimals, currency: p.currency, transaction_id: p.transactionId,
      ...(p.visitorId ? { datafast_visitor_id: p.visitorId } : {}), ...(p.email ? { email: p.email } : {}), ...(p.customerId ? { customer_id: p.customerId } : {}) }),
  }).catch((e) => { console.error("datafast", e); return null; });
  if (res && !res.ok) console.error("datafast", res.status, await res.text().catch(() => ""));
}
