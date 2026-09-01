#!/usr/bin/env bash
#
# One-shot production deploy of Continuum to Cloud Run.
#
#   1. ensures the Artifact Registry repo exists
#   2. creates/updates the gemini-api-key and firebase-private-key secrets
#      from your local env, and grants the runtime service account access
#   3. builds + pushes the image via Cloud Build (baking in the public
#      NEXT_PUBLIC_FIREBASE_* client config)
#   4. deploys the Cloud Run service with the server-side env + secrets
#
# Reads configuration from .env.local then .env (same files the app uses).
# Requires: gcloud (authenticated), billing enabled on the project, and the
# APIs from README step 1 enabled.
#
# Usage:
#   bash scripts/deploy.sh [--project=<id>] [--region=<r>] [--service=<name>] [--repo=<name>]
#
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-continuum}"
REPO="${REPO:-continuum}"

for arg in "$@"; do
  case "$arg" in
    --project=*) PROJECT_ID="${arg#*=}" ;;
    --region=*) REGION="${arg#*=}" ;;
    --service=*) SERVICE_NAME="${arg#*=}" ;;
    --repo=*) REPO="${arg#*=}" ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

command -v gcloud >/dev/null 2>&1 || { echo "gcloud not found on PATH." >&2; exit 1; }

# --- load env files -------------------------------------------------------
load_env() {
  [ -f "$1" ] || return 0
  echo "Loading $1"
  set -a
  # shellcheck disable=SC1090
  . "$1"
  set +a
}
load_env .env
load_env .env.local

[ -n "$PROJECT_ID" ] || PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
[ -n "$PROJECT_ID" ] || { echo "No project. Pass --project=<id> or run 'gcloud config set project <id>'." >&2; exit 1; }

require() {
  local name="$1"
  [ -n "${!name:-}" ] || { echo "Missing required value '$name' (set it in .env or .env.local)." >&2; exit 1; }
}
for v in \
  GEMINI_API_KEY GEMINI_MODEL \
  FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY \
  SESSION_SECRET CRON_SECRET \
  NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID \
  NEXT_PUBLIC_FIREBASE_APP_ID
do require "$v"; done

if [ "${SESSION_SECRET}" = "change-me-in-production" ] || [ "${CRON_SECRET}" = "change-me-in-production" ]; then
  echo "SESSION_SECRET / CRON_SECRET still hold the placeholder value — generate real ones (openssl rand -base64 32)." >&2
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE_NAME}:$(date +%Y%m%d-%H%M%S)"

echo
echo "Project:  $PROJECT_ID ($PROJECT_NUMBER)"
echo "Region:   $REGION"
echo "Service:  $SERVICE_NAME"
echo "Image:    $IMAGE"
echo "Runtime SA: $RUNTIME_SA"
echo

# --- 1. Artifact Registry repo ------------------------------------------
if ! gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Creating Artifact Registry repo '$REPO'..."
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker --location "$REGION" --project "$PROJECT_ID"
fi

# --- 2. secrets --------------------------------------------------------
put_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    if [ "$(gcloud secrets versions access latest --secret "$name" --project "$PROJECT_ID" 2>/dev/null || true)" != "$value" ]; then
      echo "Adding new version of secret '$name'..."
      printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project "$PROJECT_ID"
    fi
  else
    echo "Creating secret '$name'..."
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --project "$PROJECT_ID"
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/secretmanager.secretAccessor \
    --project "$PROJECT_ID" --condition=None >/dev/null
}
put_secret gemini-api-key       "$GEMINI_API_KEY"
put_secret firebase-private-key "$FIREBASE_PRIVATE_KEY"

echo "Ensuring runtime SA can read Firestore..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/datastore.user \
  --condition=None >/dev/null

# --- 3. build + push --------------------------------------------------
echo "Building image via Cloud Build..."
gcloud builds submit --project "$PROJECT_ID" --config cloudbuild.yaml \
  --substitutions "_IMAGE=${IMAGE},_NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY},_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN},_NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID},_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:-},_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:-},_NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}"

# --- 4. deploy ------------------------------------------------------
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" --region "$REGION" \
  --image "$IMAGE" \
  --allow-unauthenticated \
  --set-env-vars "DEMO_MODE=false,GEMINI_MODEL=${GEMINI_MODEL},FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL},SESSION_SECRET=${SESSION_SECRET},CRON_SECRET=${CRON_SECRET}" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,FIREBASE_PRIVATE_KEY=firebase-private-key:latest"

URL="$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
HOST="${URL#https://}"

cat <<EOF

Deployed: $URL

Next:
  1. Firebase console -> Authentication -> Settings -> Authorized domains:
     add  $HOST
  2. Provision the background check-in schedule:
     npm run setup:scheduler -- --secret="$CRON_SECRET" --project="$PROJECT_ID" --region="$REGION"
  3. Smoke test:
     curl $URL/api/health
EOF
