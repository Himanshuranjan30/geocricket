// Run the daily AI drafting once. Usage: pnpm draft [count]
import { draftDaily } from "../src/lib/generate";
draftDaily(Number(process.argv[2] ?? 3)).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }, (e) => { console.error(e); process.exit(1); });
