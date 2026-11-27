#!/usr/bin/env bash
# Sets Relay's Worker secrets without printing any value.
# Generated secrets go straight into `wrangler secret put`; SEED_SECRET and INTERNAL_SECRET are also
# saved in the macOS Keychain (service "relay", account = the name) because later steps need them.
# AWS keys come from Secrets Manager (/relay/workers/aws-access-key, ap-south-1), the relay-workers user.
# Re-running replaces every secret; skip a name with SKIP="NAME1 NAME2".
set -euo pipefail
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null || { echo "missing: $1" >&2; exit 1; }; }
need openssl; need aws; need security; need npx; need python3

skip() { [[ " ${SKIP:-} " == *" $1 "* ]]; }
put() { npx wrangler secret put "$1" >/dev/null; echo "set $1"; }
keep() { security add-generic-password -U -s relay -a "$1" -w "$2"; echo "saved $1 in Keychain (relay)"; }

for name in BETTER_AUTH_SECRET SEED_SECRET INTERNAL_SECRET WEBHOOK_SECRET_KEY UNSUBSCRIBE_SECRET; do
  skip "$name" && { echo "skip $name"; continue; }
  value=$(openssl rand -base64 32)
  printf '%s' "$value" | put "$name"
  if [[ $name == SEED_SECRET || $name == INTERNAL_SECRET ]]; then keep "$name" "$value"; fi
  if [[ $name == INTERNAL_SECRET ]] && command -v gh >/dev/null; then
    printf '%s' "$value" | gh secret set INTERNAL_SECRET --repo a6n-ai/relay >/dev/null && echo "set GitHub secret INTERNAL_SECRET"
  fi
  unset value
done

if ! skip AWS; then
  json=$(aws secretsmanager get-secret-value --region ap-south-1 --secret-id /relay/workers/aws-access-key --query SecretString --output text)
  printf '%s' "$json" | python3 -c "import sys,json;sys.stdout.write(json.load(sys.stdin)['accessKeyId'])" | put AWS_ACCESS_KEY_ID
  printf '%s' "$json" | python3 -c "import sys,json;sys.stdout.write(json.load(sys.stdin)['secretAccessKey'])" | put AWS_SECRET_ACCESS_KEY
  unset json
fi

echo "done. Read a saved one later with: security find-generic-password -s relay -a SEED_SECRET -w"
