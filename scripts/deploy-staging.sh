#!/usr/bin/env sh
# Deploy a Preview build (own Neon branch, team-only access) and point the stable staging URL at it.
set -e
url=$(vercel deploy --yes 2>/dev/null | grep -oE 'https://pitchmap-[a-z0-9]+-[a-z0-9-]+\.vercel\.app' | head -1)
[ -n "$url" ] || { echo "Deploy failed"; exit 1; }
vercel alias set "$url" pitchmap-staging.vercel.app
echo "Staging: https://pitchmap-staging.vercel.app"
