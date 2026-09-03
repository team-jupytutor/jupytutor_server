#!/bin/sh
# One-time GCP project setup for running the Jupytutor server on Cloud Run:
# the state bucket, the service account the app runs as, and its secrets.
# Safe to re-run. See README "Google Cloud Run".
set -eu

PROJECT="${PROJECT:-cs61a-140900}"
REGION="${REGION:-us-west1}"
BUCKET="gs://${BUCKET_NAME:-$PROJECT-jupytutor}"
SA_NAME=jupytutor-app
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"

# A just-created service account can take a few seconds to become bindable.
retry() {
  for attempt in 1 2 3 4 5 6; do
    if "$@" >/dev/null; then return 0; fi
    echo "  (retrying in 5s)"; sleep 5
  done
  "$@" >/dev/null
}

echo "=== APIs ==="
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com \
  generativelanguage.googleapis.com --project "$PROJECT"

echo "=== Bucket (private, uniform access; mounted at /data by the service) ==="
gcloud storage buckets describe "$BUCKET" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud storage buckets create "$BUCKET" --project "$PROJECT" --location "$REGION" \
    --uniform-bucket-level-access --public-access-prevention

echo "=== Service account (reads/writes the bucket, reads its secrets) ==="
gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" \
    --display-name "Jupytutor server" \
    --description "Identity of the jupytutor Cloud Run service"
retry gcloud storage buckets add-iam-policy-binding "$BUCKET" --project "$PROJECT" \
  --member "serviceAccount:$SA" --role roles/storage.objectAdmin

echo "=== Secrets ==="
# Generated once: the HMAC key for pseudo-anonymous student ids (must stay
# stable so ids remain joinable), the admin panel password, and the admin
# session-signing secret (rotate to log admins out).
for secret in jupytutor-hmac-key jupytutor-admin-password jupytutor-admin-session-secret; do
  if ! gcloud secrets describe "$secret" --project "$PROJECT" >/dev/null 2>&1; then
    gcloud secrets create "$secret" --project "$PROJECT" --replication-policy automatic
    openssl rand -hex 32 | tr -d '\n' | \
      gcloud secrets versions add "$secret" --project "$PROJECT" --data-file=-
  fi
done
# The Gemini API key (Generative Language API) is added by hand:
#   printf %s 'THE-KEY' | gcloud secrets versions add jupytutor-gcp-api-key --project cs61a-140900 --data-file=-
gcloud secrets describe jupytutor-gcp-api-key --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud secrets create jupytutor-gcp-api-key --project "$PROJECT" --replication-policy automatic
for secret in jupytutor-gcp-api-key jupytutor-hmac-key jupytutor-admin-password jupytutor-admin-session-secret; do
  retry gcloud secrets add-iam-policy-binding "$secret" --project "$PROJECT" \
    --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor
done

echo "Done. Remaining manual step (once): add the Gemini API key version with"
echo "  printf %s 'THE-KEY' | gcloud secrets versions add jupytutor-gcp-api-key --project $PROJECT --data-file=-"
echo "Admin panel password:"
echo "  gcloud secrets versions access latest --secret jupytutor-admin-password --project $PROJECT"
