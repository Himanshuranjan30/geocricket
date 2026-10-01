import { notFound } from "next/navigation";
import { ReelGlobe } from "./ReelGlobe";

// Development-only: a bare globe for recording marketing reels (no game UI). 404 in production.
export default function DevGlobe() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ReelGlobe />;
}
