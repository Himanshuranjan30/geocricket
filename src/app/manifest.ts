import type { MetadataRoute } from "next";

// Installable web app (also required for web push on iOS home-screen apps).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GeoCricket", short_name: "GeoCricket", description: "Cricket's greatest moments. Can you pin them all? Daily games, live duels and cups on a 3D globe.",
    start_url: "/", display: "standalone", background_color: "#120E3A", theme_color: "#2A1F7A",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  };
}
