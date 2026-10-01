"use client";

import { useEffect, useState } from "react";

// The contact address, in pieces: it's assembled in the browser, so it never appears in the page's HTML for scrapers.
const PARTS = ["himanshuranjan30", "gmail.com"];

/** A "mailto" link whose address stays hidden: visitors see `children`, the address is built after the page loads. */
export function EmailLink({ subject, children }: { subject?: string; children: React.ReactNode }) {
  const [href, setHref] = useState("#contact");
  useEffect(() => {
    const t = setTimeout(() => setHref(`mailto:${PARTS.join("@")}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`), 0);
    return () => clearTimeout(t);
  }, [subject]);
  return <a href={href} rel="nofollow">{children}</a>;
}
