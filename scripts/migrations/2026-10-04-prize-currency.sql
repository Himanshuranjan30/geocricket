-- Prize value in the winner's own currency (from their profile country at settlement), so the admin knows what to pay.
ALTER TABLE "prizes" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'INR' NOT NULL;
ALTER TABLE "prizes" ADD COLUMN IF NOT EXISTS "amount" real DEFAULT 100 NOT NULL;
