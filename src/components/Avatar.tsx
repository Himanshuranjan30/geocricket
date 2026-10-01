import { legendOf } from "@/lib/legends";
import { RigHead } from "./RigImage";
import { Toon, type Mood } from "./Toon";

/** A player's avatar: a legend caricature ("legend:<id>") or a head crop of their own full-body character. `mood` animates it. */
export function Avatar({ code, size = 32, className = "", mood }: { code: string | null | undefined; size?: number; className?: string; mood?: Mood }) {
  const legend = legendOf(code);
  if (legend) return <Toon legend={legend} size={size} mood={mood} className={`rounded-full ${className}`} />;
  return <RigHead code={code} size={size} mood={mood} className={className} />;
}
