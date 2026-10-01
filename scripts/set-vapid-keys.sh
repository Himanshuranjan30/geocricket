#!/usr/bin/env bash
# Generates a web-push VAPID key pair and stores it in Vercel (Production + Preview). The private key is never printed.
set -euo pipefail
TOKEN=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/Library/Application Support/com.vercel.cli/auth.json")))["token"])')
read -r PID ORG <<< "$(python3 -c 'import json;d=json.load(open(".vercel/project.json"));print(d["projectId"],d["orgId"])')"
KEYS=$(node -e 'const w=require("web-push");console.log(JSON.stringify(w.generateVAPIDKeys()))')
KEYS="$KEYS" python3 -c '
import json,os
k=json.loads(os.environ["KEYS"])
print(json.dumps([{"key":"NEXT_PUBLIC_VAPID_PUBLIC_KEY","value":k["publicKey"],"type":"plain","target":["production","preview"]},
                  {"key":"VAPID_PRIVATE_KEY","value":k["privateKey"],"type":"encrypted","target":["production","preview"]}]))' |
  curl -s -o /dev/null -w "Vercel: %{http_code}\n" -X POST "https://api.vercel.com/v10/projects/$PID/env?teamId=$ORG&upsert=true" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data @-
unset KEYS
echo DONE
