#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOFU_DIR="$ROOT_DIR/tofu"
ENV_PATH="${ENV_PATH:-$ROOT_DIR/.env}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

tofu_output() {
  (cd "$TOFU_DIR" && tofu output -raw "$1")
}

require_command tofu

if [ ! -d "$TOFU_DIR" ]; then
  echo "Missing tofu directory: $TOFU_DIR" >&2
  exit 1
fi

if [ -f "$ENV_PATH" ]; then
  backup_path="$ENV_PATH.$(date +%Y%m%d%H%M%S).bak"
  cp "$ENV_PATH" "$backup_path"
  chmod 600 "$backup_path"
  echo "Backed up existing .env to $backup_path"
fi

tmp_path="$(mktemp)"
cleanup() {
  rm -f "$tmp_path"
}
trap cleanup EXIT

umask 077
cat >"$tmp_path" <<EOF
NODE_ENV=development
PORT=${PORT:-3000}
ALLOWED_ORIGINS=http://localhost:${PORT:-3000},http://127.0.0.1:${PORT:-3000}

COSMOS_DB_ENDPOINT=$(tofu_output cosmos_endpoint)
COSMOS_DB_MASTER_KEY=$(tofu_output cosmos_master_key)
COSMOS_DB_DATABASE_NAME=$(tofu_output cosmos_database_name)
COSMOS_DB_CONTAINER_NAME=$(tofu_output cosmos_container_name)
COSMOS_DB_SCRAPES_CONTAINER_NAME=$(tofu_output cosmos_scrapes_container_name)

AZURE_FOUNDRY_API_KEY=$(tofu_output azure_foundry_api_key)
AZURE_FOUNDRY_ENDPOINT=$(tofu_output azure_foundry_endpoint)
AZURE_FOUNDRY_BASE_URL=$(tofu_output azure_foundry_base_url)
AZURE_FOUNDRY_DEPLOYMENT=$(tofu_output azure_foundry_deployment)

HMAC_KEY=$(tofu_output hmac_key)
ADMIN_PASSWORD=$(tofu_output admin_password)
ADMIN_SESSION_SECRET=$(tofu_output admin_session_secret)
SCRAPE_CACHE_TTL_DAYS=14
EOF

mv "$tmp_path" "$ENV_PATH"
chmod 600 "$ENV_PATH"
trap - EXIT

echo "Wrote $ENV_PATH"
