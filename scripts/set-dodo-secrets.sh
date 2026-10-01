#!/usr/bin/env bash
# Prompts (hidden) for Dodo keys and stores them in Vercel: live keys → Production, test keys → Preview (staging).
# Values never echo or touch disk.
set -euo pipefail
TOKEN=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/Library/Application Support/com.vercel.cli/auth.json")))["token"])')
read -r PID ORG <<< "$(python3 -c 'import json;d=json.load(open(".vercel/project.json"));print(d["projectId"],d["orgId"])')"
put() { # key target label
  printf '%s: ' "$3"; read -rs V; echo
  [ -z "$V" ] && { echo "  skipped"; return; }
  KEY="$1" TARGET="$2" VAL="$V" python3 -c 'import json,os;print(json.dumps([{"key":os.environ["KEY"],"value":os.environ["VAL"],"type":"encrypted","target":[os.environ["TARGET"]]}]))' |
    curl -s -o /dev/null -w "  $1 ($2): %{http_code}\n" -X POST "https://api.vercel.com/v10/projects/$PID/env?teamId=$ORG&upsert=true" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data @-
  unset V
}
put DODO_PAYMENTS_API_KEY production "LIVE mode API key (Dodo → Developer → API Keys, Live Mode)"
put DODO_PAYMENTS_WEBHOOK_KEY production "LIVE webhook signing secret (Developer → Webhooks → geocricket.app endpoint)"
put DODO_PAYMENTS_API_KEY preview "TEST mode API key (switch Dodo to Test Mode → API Keys)"
put DODO_PAYMENTS_WEBHOOK_KEY preview "TEST webhook signing secret (Test Mode → Webhooks → staging endpoint)"
echo DONE
