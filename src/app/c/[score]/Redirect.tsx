"use client";

import { useEffect } from "react";

/** Shared-result links keep their rich preview (this page's metadata), then drop the visitor straight into today's round. */
export function PlayRedirect({ score }: { score: number }) {
  useEffect(() => { window.location.replace(`/play?c=${score}&from=share`); }, [score]);
  return <main className="night-sky grid min-h-screen place-items-center text-muted">Loading today&apos;s round…</main>;
}
