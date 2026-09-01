#!/usr/bin/env bash
#
# Pushes Continuum's config from .env / .env.local into the linked Vercel
# project for all three targets (production, preview, development). Safe to
# re-run — every value is overwritten (--force).
#
#   npx vercel link          # first time only
#   bash scripts/vercel-env.sh
#   npx vercel --prod
#
set -euo pipefail
cd "$(dirname "$0")/.."

VERCEL="${VERCEL:-npx vercel}"

load_env() { [ -f "$1" ] && { echo "Loading $1"; set -a; . "$1"; set +a; }; return 0; }
load_env .env
load_env .env.local

DEMO_MODE=false   # never demo mode server-side in a deployed environment

# name : type   (config = plaintext/inspectable, secret = write-only)
CONFIG_VARS=(
  DEMO_MODE GEMINI_MODEL
  NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_APP_ID
  FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL
)
SECRET_VARS=( GEMINI_API_KEY FIREBASE_PRIVATE_KEY SESSION_SECRET CRON_SECRET )

push() {
  local name="$1" type="$2" value="${!1:-}"
  if [ -z "$value" ]; then echo "  skip $name (empty)"; return; fi
  if { [ "$name" = "SESSION_SECRET" ] || [ "$name" = "CRON_SECRET" ]; } && [ "$value" = "change-me-in-production" ]; then
    echo "ERROR: $name is still the placeholder — generate one: openssl rand -base64 32" >&2; exit 1
  fi
  for env in production preview development; do
    # stdin, not --value: values starting with "-----" (PEM keys) trip flag parsing
    printf '%s' "$value" | $VERCEL env add "$name" "$env" --type "$type" --force --yes >/dev/null 2>&1
  done
  echo "  set $name ($type)"
}

for v in "${CONFIG_VARS[@]}"; do push "$v" config; done
for v in "${SECRET_VARS[@]}"; do push "$v" secret; done

echo
echo "Done. Deploy:  npx vercel --prod"
