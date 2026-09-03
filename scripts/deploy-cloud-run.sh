#!/usr/bin/env bash
# Build the image with Cloud Build and roll it out to the Cloud Run service.
# The GCP counterpart of scripts/deploy-app-service.sh: OpenTofu (tofu/gcp)
# owns the infrastructure and every service setting; this script only ships
# a new image. See README "Google Cloud Run".
#
#   scripts/deploy-cloud-run.sh               build + deploy
#   DRY_RUN=true scripts/deploy-cloud-run.sh  print the gcloud commands instead
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOFU_DIR="$ROOT_DIR/tofu/gcp"

PROJECT="${PROJECT:-}"
REGION="${REGION:-}"
SERVICE="${SERVICE:-}"
IMAGE="${IMAGE:-}"
DRY_RUN="${DRY_RUN:-false}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command gcloud

# Read the deployment target from OpenTofu outputs when available.
tofu_output() {
  if command -v tofu >/dev/null 2>&1; then
    (cd "$TOFU_DIR" && tofu output -raw "$1" 2>/dev/null) || true
  fi
}

PROJECT="${PROJECT:-$(tofu_output project)}"
REGION="${REGION:-$(tofu_output region)}"
SERVICE="${SERVICE:-$(tofu_output service_name)}"
IMAGE="${IMAGE:-$(tofu_output image)}"

PROJECT="${PROJECT:-cs61a-140900}"
REGION="${REGION:-us-west1}"
SERVICE="${SERVICE:-jupytutor}"
IMAGE="${IMAGE:-$REGION-docker.pkg.dev/$PROJECT/$SERVICE/app}"

echo "Deploying to Cloud Run service: $SERVICE"
echo "Project: $PROJECT"
echo "Region: $REGION"
echo "Image: $IMAGE"

run() {
  echo "+ $*"
  if [ "$DRY_RUN" != "true" ]; then "$@"; fi
}

cd "$ROOT_DIR"

echo "=== Building and pushing the image ==="
run gcloud builds submit "$ROOT_DIR" --project "$PROJECT" --region "$REGION" \
  --tag "$IMAGE" --quiet

echo "=== Rolling out the new image ==="
# Only the image changes; env vars, secrets, the volume, scaling, and the
# service account stay as OpenTofu configured them.
run gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" --quiet

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
