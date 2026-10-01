// Player avatar codes. An avatar is stored as "<seed>-<jersey>", e.g. "r2031-india": the seed is the look (src/lib/rig.ts)
// and the jersey the kit colour. Legends are "legend:<id>".
import { LEGEND_BY_ID } from "./legends";

export const JERSEYS = {
  india: { label: "Royal blue", shirt: "1c5fd4", bg: "0b2a5c" },
  gold: { label: "Gold", shirt: "f5c000", bg: "4a3a00" },
  green: { label: "Emerald", shirt: "0f8a4f", bg: "07351f" },
  pak: { label: "Forest green", shirt: "01411c", bg: "0d2a1a" },
  navy: { label: "Navy", shirt: "1a2b5f", bg: "0c1430" },
  black: { label: "Black", shirt: "1b1b1b", bg: "2a2f3a" },
  maroon: { label: "Maroon", shirt: "7b1e3a", bg: "3a0d1c" },
  sky: { label: "Sky blue", shirt: "2e8fe0", bg: "103455" },
  orange: { label: "Orange", shirt: "f26522", bg: "4a1e08" },
  white: { label: "Whites", shirt: "f4f0e1", bg: "33415c" },
} as const;
export type Jersey = keyof typeof JERSEYS;

const CODE = /^([a-z0-9]{4,12})-([a-z]+)$/;
export const isAvatar = (code: string) => { if (LEGEND_BY_ID.has(code.replace(/^legend:/, "")) && code.startsWith("legend:")) return true; const m = CODE.exec(code); return !!m && m[2] in JERSEYS; };
export const avatarCode = (seed: string, jersey: Jersey) => `${seed}-${jersey}`;
export const parseAvatar = (code: string | null | undefined): { seed: string; jersey: Jersey } => {
  const m = CODE.exec(code ?? "");
  return m && m[2] in JERSEYS ? { seed: m[1], jersey: m[2] as Jersey } : { seed: code || "pitchmap", jersey: "india" };
};

// Older looks from the retired Avataaars builder: "x" + one base-36 digit per part (index into the list below, or the
// last+1 for "none"). Kept only so src/lib/rig.ts can map them to the nearest character.
export const PARTS = {
  top: { label: "Hair", options: ["shortFlat", "shortWaved", "shortCurly", "shortRound", "theCaesar", "theCaesarAndSidePart", "sides", "shavedSides", "dreads01", "dreads02", "frizzle", "shaggy", "shaggyMullet", "curly", "fro", "froBand", "bob", "bun", "curvy", "longButNotTooLong", "miaWallace", "straight01", "straight02", "straightAndStrand", "bigHair", "frida", "dreads", "hat", "turban", "hijab", "winterHat1", "winterHat02", "winterHat03", "winterHat04"], none: true },
  hairColor: { label: "Hair colour", options: ["2c1b18", "4a312c", "724133", "a55728", "b58143", "d6b370", "e8e1e1", "c93305", "f59797"] },
  skinColor: { label: "Skin", options: ["614335", "ae5d29", "d08b5b", "edb98a", "ffdbb4", "fd9841", "f8d25c"] },
  eyes: { label: "Eyes", options: ["default", "happy", "side", "squint", "wink", "winkWacky", "surprised", "eyeRoll", "hearts", "closed", "cry", "xDizzy"] },
  eyebrows: { label: "Brows", options: ["default", "defaultNatural", "flatNatural", "raisedExcited", "raisedExcitedNatural", "upDown", "upDownNatural", "angry", "angryNatural", "frownNatural", "sadConcerned", "sadConcernedNatural", "unibrowNatural"] },
  mouth: { label: "Mouth", options: ["smile", "default", "twinkle", "tongue", "serious", "eating", "concerned", "disbelief", "grimace", "sad", "screamOpen"] },
  facialHair: { label: "Beard", options: ["beardLight", "beardMedium", "beardMajestic", "moustacheFancy", "moustacheMagnum"], none: true },
  accessories: { label: "Glasses", options: ["prescription01", "prescription02", "round", "sunglasses", "wayfarers", "kurt", "eyepatch"], none: true },
  clothing: { label: "Outfit", options: ["shirtCrewNeck", "shirtVNeck", "shirtScoopNeck", "collarAndSweater", "hoodie", "graphicShirt", "overall", "blazerAndShirt", "blazerAndSweater"] },
} as const;
type Part = keyof typeof PARTS;
const PART_KEYS = Object.keys(PARTS) as Part[];
type Build = Record<Part, number>;

const BUILD = /^x[0-9a-z]{9}$/;
export function decodeBuild(seed: string): Build | null {
  if (!BUILD.test(seed)) return null;
  const b = {} as Build;
  PART_KEYS.forEach((k, i) => { b[k] = Math.min(parseInt(seed[i + 1], 36), PARTS[k].options.length - ("none" in PARTS[k] ? 0 : 1)); });
  return b;
}
