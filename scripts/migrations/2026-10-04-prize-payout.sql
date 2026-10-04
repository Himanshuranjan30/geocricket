-- Prize payouts for international winners: a method (upi | paypal | amazon) and where to send it, instead of UPI only.
-- No prize had been claimed when this ran, so the old upi column is dropped. Idempotent.
ALTER TABLE "prizes" ADD COLUMN IF NOT EXISTS "method" text;
ALTER TABLE "prizes" ADD COLUMN IF NOT EXISTS "pay_to" text;
ALTER TABLE "prizes" DROP COLUMN IF EXISTS "upi";
