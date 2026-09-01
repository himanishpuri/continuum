#!/usr/bin/env bash
#
# Provisions (creates or updates) the Cloud Scheduler HTTP job that drives
# Continuum's background check-in evaluator in production by calling
# POST /api/cron/run-due-checkins on a schedule (see lib/background/
# runDueCheckins.ts and app/api/cron/run-due-checkins/route.ts).
#
# Usage:
#   npm run setup:scheduler -- --secret=<CRON_SECRET> [options]
#   bash scripts/setup-cloud-scheduler.sh --secret=<CRON_SECRET> [options]
#
# Every option can also be set as an env var of the same name; flags win.
#
#   --project     PROJECT_ID   GCP project id           (default: `gcloud config get-value project`)
#   --region      REGION       Cloud Scheduler/Run region (default: us-central1)
#   --service     SERVICE_NAME Cloud Run service name    (default: continuum)
#   --url         SERVICE_URL  Skip service lookup, use this base URL directly
#   --secret      CRON_SECRET  Shared secret — REQUIRED, must match the Cloud
#                               Run service's own CRON_SECRET env var
#   --schedule    SCHEDULE     Cron expression           (default: "0 * * * *", hourly)
#   --job-name    JOB_NAME     Scheduler job name         (default: continuum-run-due-checkins)
#
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-continuum}"
SERVICE_URL="${SERVICE_URL:-}"
CRON_SECRET="${CRON_SECRET:-}"
SCHEDULE="${SCHEDULE:-0 * * * *}"
JOB_NAME="${JOB_NAME:-continuum-run-due-checkins}"

for arg in "$@"; do
  case "$arg" in
    --project=*) PROJECT_ID="${arg#*=}" ;;
    --region=*) REGION="${arg#*=}" ;;
    --service=*) SERVICE_NAME="${arg#*=}" ;;
    --url=*) SERVICE_URL="${arg#*=}" ;;
    --secret=*) CRON_SECRET="${arg#*=}" ;;
    --schedule=*) SCHEDULE="${arg#*=}" ;;
    --job-name=*) JOB_NAME="${arg#*=}" ;;
    -h|--help)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg (see --help)" >&2
      exit 1
      ;;
  esac
done

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Error: gcloud CLI is not installed or not on PATH. Install the Google Cloud SDK first." >&2
  exit 1
fi

if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [ -z "$PROJECT_ID" ]; then
  echo "Error: no GCP project resolved. Pass --project=<id> or run 'gcloud config set project <id>' first." >&2
  exit 1
fi

if [ -z "$CRON_SECRET" ]; then
  echo "Error: --secret (or CRON_SECRET env var) is required. It must match the CRON_SECRET" >&2
  echo "       env var already set on the Cloud Run service, or every scheduled call will get a 401." >&2
  exit 1
fi

if [ -z "$SERVICE_URL" ]; then
  echo "Resolving Cloud Run service URL for '$SERVICE_NAME' in $REGION..."
  SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)')"
  if [ -z "$SERVICE_URL" ]; then
    echo "Error: could not resolve the URL for Cloud Run service '$SERVICE_NAME' in region '$REGION'." >&2
    echo "       Pass --url=https://your-service-url directly instead." >&2
    exit 1
  fi
fi

TARGET_URI="${SERVICE_URL%/}/api/cron/run-due-checkins"

echo "Enabling Cloud Scheduler API (no-op if already enabled)..."
gcloud services enable cloudscheduler.googleapis.com --project "$PROJECT_ID"

if gcloud scheduler jobs describe "$JOB_NAME" \
    --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
  echo "Job '$JOB_NAME' already exists — updating it."
  gcloud scheduler jobs update http "$JOB_NAME" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --schedule="$SCHEDULE" \
    --uri="$TARGET_URI" \
    --http-method=POST \
    --headers="X-Cron-Secret=$CRON_SECRET" \
    --time-zone=UTC
else
  echo "Creating job '$JOB_NAME'."
  gcloud scheduler jobs create http "$JOB_NAME" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --schedule="$SCHEDULE" \
    --uri="$TARGET_URI" \
    --http-method=POST \
    --headers="X-Cron-Secret=$CRON_SECRET" \
    --time-zone=UTC
fi

cat <<EOF

Done. "$JOB_NAME" now POSTs to:
  $TARGET_URI
on schedule "$SCHEDULE" (UTC).

Trigger it immediately to confirm it works, rather than waiting for the schedule:
  gcloud scheduler jobs run "$JOB_NAME" --project "$PROJECT_ID" --location "$REGION"
EOF
