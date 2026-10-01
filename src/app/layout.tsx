import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import { preconnect, preload, preloadModule } from "react-dom";
import { Analytics } from "@/components/Analytics";
import "./globals.css";

// One chunky rounded family: regular for text, heavy italic for game headings.
// Next's font loader allows one call per family per file, so body and the heavy italic headings share one Rubik.
const rubik = Rubik({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], style: ["normal", "italic"] });

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "GeoCricket: the daily cricket geography game (cricket Wordle)", template: "%s · GeoCricket" },
  description: "Lara's 400. Dhoni's six. Kapil's '83. Can you pin where they happened? The free daily cricket geography game: 4 games a day, live 1v1 duels, leagues and knockout cups.",
  applicationName: "GeoCricket",
  alternates: { canonical: "/" },
  openGraph: { siteName: "GeoCricket", type: "website", locale: "en_IN", url: "/" },
  twitter: { card: "summary_large_image" },
  category: "games",
};

export const viewport: Viewport = { themeColor: "#120E3A", width: "device-width", initialScale: 1, viewportFit: "cover" };

const adsense = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Warm up everything the globe needs while the page is still parsing.
  preconnect("https://tiles.openfreemap.org", { crossOrigin: "anonymous" });
  preload("/world.topo.json", { as: "fetch", crossOrigin: "anonymous" });
  preload("/globe-poster.webp", { as: "image", fetchPriority: "high" });
  preloadModule("/maplibre/maplibre-gl-shared.mjs");
  preloadModule("/maplibre/maplibre-gl-worker.mjs");
  return (
    <html lang="en" className={`${rubik.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        {/* Site-wide structured data: the game (free web app) and the brand. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([
          { "@context": "https://schema.org", "@type": "WebApplication", name: "GeoCricket", url: site, applicationCategory: "GameApplication", operatingSystem: "Any (web browser)",
            description: "A free daily cricket geography game: guess where famous cricket moments happened on a 3D globe.", inLanguage: "en", image: `${site}/opengraph-image`, offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } },
          { "@context": "https://schema.org", "@type": "Organization", name: "GeoCricket", url: site, logo: `${site}/logo-512.png`, image: `${site}/logo-512.png` },
          { "@context": "https://schema.org", "@type": "WebSite", name: "GeoCricket", alternateName: ["Geo Cricket", "GeoCricket game"], url: `${site}/` }, // Google's site name
        ]).replace(/</g, "\\u003c") }} />
        <Analytics />
        {adsense && (
          <>
            {/* Plain async tag (AdSense flags next/script's data-nscript). Test ads outside production so our own traffic never counts.
                The shim gives the games Ad Placement API (adBreak/adConfig: interstitials, rewarded) the same queue. */}
            <script async crossOrigin="anonymous" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense}`}
              data-ad-frequency-hint="120s" {...(process.env.VERCEL_ENV === "production" && !process.env.VERCEL_URL?.includes("staging") ? {} : { "data-adbreak-test": "on" })} />
            <script dangerouslySetInnerHTML={{ __html: "window.adsbygoogle=window.adsbygoogle||[];window.adBreak=window.adConfig=function(o){window.adsbygoogle.push(o)};" }} />
          </>
        )}
      </body>
    </html>
  );
}
