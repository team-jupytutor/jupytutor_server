#!/usr/bin/env bash
# Build the image with Cloud Build and deploy it to Cloud Run.
# The alternative to scripts/deploy-app-service.sh (Azure). Run
# scripts/setup-cloud-run.sh once first. See README "Google Cloud Run".
#
#   scripts/deploy-cloud-run.sh              build + deploy
#   DRY_RUN=true scripts/deploy-cloud-run.sh  print the gcloud commands instead
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROJECT="${PROJECT:-cs61a-140900}"
REGION="${REGION:-us-west1}"
SERVICE="${SERVICE:-jupytutor}"
REPO="${REPO:-jupytutor}"
BUCKET_NAME="${BUCKET_NAME:-$PROJECT-jupytutor}"
SA="jupytutor-app@$PROJECT.iam.gserviceaccount.com"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/app"
DRY_RUN="${DRY_RUN:-false}"

# Runtime settings (all overridable from the environment).
GCP_MODEL="${GCP_MODEL:-gemini-3.8-flash}"
GCP_BASE_URL="${GCP_BASE_URL:-https://generativelanguage.googleapis.com/v1beta/openai/}"
SCRAPE_ALLOWED_DOMAINS="${SCRAPE_ALLOWED_DOMAINS:-inferentialthinking.com}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"
MEMORY="${MEMORY:-1Gi}"
TIMEOUT="${TIMEOUT:-300}"
# Keep one warm instance so a student's first chat after idle isn't a cold start.
MIN_INSTANCES="${MIN_INSTANCES:-1}"

run() {
  echo "+ $*"
  if [ "$DRY_RUN" != "true" ]; then "$@"; fi
}

cd "$ROOT_DIR"

echo "=== Ensuring Artifact Registry repository exists ==="
if [ "$DRY_RUN" = "true" ] || ! gcloud artifacts repositories describe "$REPO" \
    --project "$PROJECT" --location "$REGION" --quiet >/dev/null 2>&1; then
  run gcloud artifacts repositories create "$REPO" --project "$PROJECT" \
    --location "$REGION" --repository-format docker --quiet
fi

echo "=== Building and pushing the image ==="
run gcloud builds submit "$ROOT_DIR" --project "$PROJECT" --region "$REGION" \
  --tag "$IMAGE" --quiet

echo "=== Deploying to Cloud Run ==="
# `^|^` makes | the list separator so SCRAPE_ALLOWED_DOMAINS may contain commas.
ENV_VARS="^|^DATA_DIR=/data|NODE_ENV=production|GCP_MODEL=$GCP_MODEL|GCP_BASE_URL=$GCP_BASE_URL|SCRAPE_ALLOWED_DOMAINS=$SCRAPE_ALLOWED_DOMAINS"
if [ -n "$ALLOWED_ORIGINS" ]; then
  ENV_VARS="$ENV_VARS|ALLOWED_ORIGINS=$ALLOWED_ORIGINS"
fi
# max-instances 1 is load-bearing: the scrape store is files on the mounted
# bucket and in-flight scrapes are tracked in process memory.
run gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" --allow-unauthenticated \
  --memory "$MEMORY" --timeout "$TIMEOUT" \
  --max-instances 1 --min-instances "$MIN_INSTANCES" \
  --service-account "$SA" \
  --set-secrets "GCP_API_KEY=jupytutor-gcp-api-key:latest,HMAC_KEY=jupytutor-hmac-key:latest,ADMIN_PASSWORD=jupytutor-admin-password:latest,ADMIN_SESSION_SECRET=jupytutor-admin-session-secret:latest" \
  --add-volume "name=state,type=cloud-storage,bucket=$BUCKET_NAME" \
  --add-volume-mount "volume=state,mount-path=/data" \
  --set-env-vars "$ENV_VARS" --quiet

echo "=== Deleting untagged images left by earlier builds ==="
# Each build retags `latest`, leaving the previous image as an untagged
# digest that is billed until deleted.
if [ "$DRY_RUN" != "true" ]; then
  gcloud artifacts docker images list "$IMAGE" --include-tags --filter='-tags:*' \
      --format 'value(version)' --quiet 2>/dev/null | while read -r digest; do
    [ -n "$digest" ] && run gcloud artifacts docker images delete "$IMAGE@$digest" --quiet
  done
fi

if [ "$DRY_RUN" != "true" ]; then
  echo
  echo "=== Done ==="
  echo "URL: $(gcloud run services describe "$SERVICE" --project "$PROJECT" \
    --region "$REGION" --format 'value(status.url)')"
  echo "Point the client at it via api.baseURL (trailing slash)."
fi
