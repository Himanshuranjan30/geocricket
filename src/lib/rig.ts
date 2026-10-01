// Character engine: one character, everywhere. A look is skin × head × hair colour × beard (+ the kit), and maps to one
// pre-rendered full-body variant in public/rig (<skin>-<head>-<beard>.webp, aligned edits of one master, see
// scripts/rig-parts.mts). The browser repaints its two marker colours: magenta shirt/headwear → kit, blue hair → hair
// colour (src/lib/kitPaint.ts). The round avatar is a head crop of the same image, so face and body always match.
// A look is stored in the avatar code's seed as "r" + one digit per part, e.g. "r2031-india".
import { decodeBuild, JERSEYS, PARTS, parseAvatar } from "./avatar";

export const SKINS = [ // swatches sampled from the renders; ids are the file names
  { id: "medium", label: "Fair", hex: "d7b49d" }, { id: "wheat", label: "Wheatish", hex: "c49a7e" }, { id: "tan", label: "Tan", hex: "b1876b" },
  { id: "brown", label: "Brown", hex: "8a5640" }, { id: "deep", label: "Deep", hex: "693d2e" },
] as const;
export const HEADS = [
  { id: "short", label: "Short" }, { id: "curly", label: "Curly" }, { id: "long", label: "Long" }, { id: "bun", label: "Bun" },
  { id: "bald", label: "Buzz cut" }, { id: "turban", label: "Patka" }, { id: "hijab", label: "Hijab" },
] as const;
export const HAIRS = [
  { id: "black", label: "Black", hex: "1d1814" }, { id: "dark", label: "Dark brown", hex: "3e2a1e" }, { id: "brown", label: "Brown", hex: "6b4428" },
  { id: "auburn", label: "Auburn", hex: "8c3b1f" }, { id: "blonde", label: "Blonde", hex: "c9a060" }, { id: "grey", label: "Grey", hex: "a9a6a2" },
] as const;
export type Look = { skin: number; head: number; hair: number; beard: 0 | 1 };

const LOOK = /^r([0-4])([0-6])([0-5])([01])$/;
export const encodeLook = (l: Look) => `r${l.skin}${l.head}${l.hair}${l.beard}`;
export const randomLook = (): Look => ({ skin: rnd(5), head: rnd(5), hair: rnd(3), beard: rnd(3) === 0 ? 1 : 0 }); // plain cuts, natural dark hair to start
const rnd = (n: number) => Math.floor(Math.random() * n);
/** Headwear covers the hair; a hijab look has no beard. */
export const hairShows = (l: Look) => HEADS[l.head].id !== "turban" && HEADS[l.head].id !== "hijab";

// Older looks: the Avataaars part builder ("x…") and plain random seeds map to the nearest rig look.
const OLD_SKIN: Record<string, number> = { "614335": 4, ae5d29: 3, d08b5b: 2, edb98a: 1, ffdbb4: 0, fd9841: 1, f8d25c: 0 }; // → SKINS index
const OLD_HAIR: Record<string, number> = { "2c1b18": 0, "4a312c": 1, "724133": 2, a55728: 3, b58143: 4, d6b370: 4, e8e1e1: 5, c93305: 3, f59797: 4 };
const OLD_HEAD: Record<string, number> = {
  shortCurly: 1, dreads01: 1, dreads02: 1, frizzle: 1, curly: 1, fro: 1, froBand: 1, dreads: 1,
  shaggy: 2, shaggyMullet: 2, bob: 2, curvy: 2, longButNotTooLong: 2, miaWallace: 2, straight01: 2, straight02: 2, straightAndStrand: 2, bigHair: 2,
  bun: 3, frida: 3, turban: 5, hijab: 6,
};
export function lookOf(seed: string): Look {
  const m = LOOK.exec(seed);
  if (m) return { skin: +m[1], head: +m[2], hair: +m[3], beard: m[4] === "1" ? 1 : 0 };
  const b = decodeBuild(seed);
  if (b) {
    const top = PARTS.top.options[b.top] as string | undefined;
    const head = top ? OLD_HEAD[top] ?? 0 : 4;
    return { skin: OLD_SKIN[PARTS.skinColor.options[b.skinColor]] ?? 1, head, hair: OLD_HAIR[PARTS.hairColor.options[b.hairColor]] ?? 0, beard: b.facialHair < PARTS.facialHair.options.length && head !== 6 ? 1 : 0 };
  }
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { skin: h % 5, head: (h >>> 3) % 5, hair: (h >>> 6) % 3, beard: (h >>> 9) % 3 === 0 ? 1 : 0 };
}

/** Candidate images (best match first: a variant that failed to generate falls back to a plainer one) and paint colours. */
export function rigFor(code: string | null | undefined): { srcs: string[]; kit: string; hair: string; bg: string } {
  const { seed, jersey } = parseAvatar(code);
  const l = lookOf(seed);
  const skin = SKINS[l.skin].id, head = HEADS[l.head].id, beard = head === "hijab" ? 0 : l.beard;
  const srcs = [`${skin}-${head}-${beard}`, `${skin}-${head}-0`, `${skin}-short-0`, "medium-short-0"].map((n) => `/rig/${n}.webp`);
  return { srcs: [...new Set(srcs)], kit: JERSEYS[jersey].shirt, hair: HAIRS[l.hair].hex, bg: JERSEYS[jersey].bg };
}

/** Where the head sits in every rig image (fractions of width/height): the avatar crops to this square. */
export const HEAD_BOX = { x: 0.21, y: 0.05, size: 0.66 };
