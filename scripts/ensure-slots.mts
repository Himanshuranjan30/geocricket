// Creates any missing games (Daily, Morning/Evening Test Match, Evening Daily) for today and the next 7 days, and moves
// not-yet-open rounds onto the fixed drop times. The nightly job does this too (lib/maintenance.ts).
// Usage: pnpm exec tsx --conditions=react-server [--env-file=.env.neon] scripts/ensure-slots.mts
import { ensureSchedule } from "../src/lib/schedule";
console.log(JSON.stringify(await ensureSchedule(), null, 2));
process.exit(0);
