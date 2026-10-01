#!/usr/bin/env bash
# Staging sits behind Vercel Authentication, so Dodo's test webhooks need Vercel's automation-bypass secret in the URL.
# Creates (or reuses) that secret and copies the full webhook URL to the clipboard without printing it.
set -euo pipefail
TOKEN=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/Library/Application Support/com.vercel.cli/auth.json")))["token"])')
read -r PID ORG <<< "$(python3 -c 'import json;d=json.load(open(".vercel/project.json"));print(d["projectId"],d["orgId"])')"
SECRET=$(curl -s -X PATCH "https://api.vercel.com/v1/projects/$PID/protection-bypass?teamId=$ORG" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"generate":{"note":"Dodo test webhooks"}}' | python3 -c 'import json,sys;print(next(iter(json.load(sys.stdin)["protectionBypass"])))')
printf 'https://pitchmap-staging.vercel.app/api/pay/webhook?x-vercel-protection-bypass=%s' "$SECRET" | pbcopy
echo "Staging webhook URL copied to clipboard."
