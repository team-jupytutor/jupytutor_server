#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RESOURCE_GROUP="${RESOURCE_GROUP:-}"
WEBAPP_NAME="${WEBAPP_NAME:-}"
SLOT_NAME="${SLOT_NAME:-Production}"
ARTIFACT_PATH="${ARTIFACT_PATH:-$ROOT_DIR/app-service-package.zip}"
DEPLOY_ASYNC="${DEPLOY_ASYNC:-false}"
DRY_RUN="${DRY_RUN:-false}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command az
require_command git
require_command npm
require_command tar
require_command zip

cd "$ROOT_DIR"

az account show >/dev/null

if [ -z "$RESOURCE_GROUP" ] && command -v tofu >/dev/null 2>&1; then
  RESOURCE_GROUP="$(cd "$ROOT_DIR/tofu" && tofu output -raw resource_group_name 2>/dev/null || true)"
fi

if [ -z "$WEBAPP_NAME" ] && command -v tofu >/dev/null 2>&1; then
  WEBAPP_NAME="$(cd "$ROOT_DIR/tofu" && tofu output -raw web_app_name 2>/dev/null || true)"
fi

RESOURCE_GROUP="${RESOURCE_GROUP:-jupytutor}"
WEBAPP_NAME="${WEBAPP_NAME:-iac-jupytutor-app-dev}"

echo "Deploying to Azure App Service: $WEBAPP_NAME"
echo "Resource group: $RESOURCE_GROUP"
echo "Slot: $SLOT_NAME"
echo "Artifact: $ARTIFACT_PATH"

npm install
npm run build --if-present
npm run test --if-present

stage_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$stage_dir"
}
trap cleanup EXIT

git ls-files -z | tar --null -T - -cf - | tar -xf - -C "$stage_dir"

if [ -d "$ROOT_DIR/dist" ]; then
  rm -rf "$stage_dir/dist"
  cp -a "$ROOT_DIR/dist" "$stage_dir/dist"
fi

rm -f "$ARTIFACT_PATH"
(
  cd "$stage_dir"
  zip -qr "$ARTIFACT_PATH" .
)

if [ "$DRY_RUN" = "true" ]; then
  echo "Dry run enabled; skipping Azure deployment."
  exit 0
fi

deploy_args=(
  --resource-group "$RESOURCE_GROUP"
  --name "$WEBAPP_NAME"
  --src-path "$ARTIFACT_PATH"
  --type zip
)

if [ "$DEPLOY_ASYNC" = "true" ]; then
  deploy_args+=(--async true)
fi

if [ "$SLOT_NAME" != "Production" ]; then
  deploy_args+=(--slot "$SLOT_NAME")
fi

az webapp deploy "${deploy_args[@]}"
