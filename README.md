# Jupytutor Server

Node/Express API for the Jupytutor JupyterLab extension. It handles chat requests, Cosmos DB logging, server-side page scraping, and the `/admin` scrape management PWA.

It runs on Azure (App Service + Azure AI Foundry + Cosmos DB, the sections below) or, alternatively, on Google Cloud Run with Gemini (see [Google Cloud Run](#google-cloud-run-alternative)).

## Repos

- `jupytutor_server`: this server, Azure infrastructure, admin UI.
- `../jupytutor`: JupyterLab client extension. Its API base URL is configured in `src/config.ts` or by DataHub/user config at `~/.config/jupytutor/config.json`.

## Infrastructure

Infrastructure lives in `tofu/`. OpenTofu/Terraform is the tool that creates and updates Azure resources from code: App Service, Cosmos DB, Azure AI Foundry, app settings, and generated secrets.

First setup:

```bash
cd tofu
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars
tofu init
tofu plan -out plan.out
tofu apply plan.out
```

After changing `tofu/*.tf`, run:

```bash
cd tofu
tofu fmt
tofu validate
tofu plan -out plan.out
tofu apply plan.out
```

Terraform/OpenTofu keeps a state file: a record of which real Azure resources correspond to the resources declared in `tofu/*.tf`, plus generated values like random passwords. This repo is configured to store that state in Azure Blob Storage, not on one developer's local machine.

For handoff, that means the next maintainer should not create new state from scratch. If they have Azure access to the existing state storage account/container, `tofu init` will connect to the existing state and `tofu plan` will compare the checked-out code against the already-deployed infrastructure. Treat state as sensitive; it contains generated secrets.

## Local Development

Populate `.env` from the deployed infrastructure. This reads `tofu show -json`
and writes local development settings that point at the remote Azure AI Foundry
and Cosmos DB resources, so treat the generated file as sensitive:

```bash
scripts/write-local-env-from-tofu.sh
```

Then run:

```bash
npm install
npm run build
npm start
```

The local server defaults to `http://localhost:3000/`. Point the client extension at that URL via `../jupytutor/src/config.ts` or `~/.config/jupytutor/config.json`.

Useful commands:

```bash
npm run build:server
npm run build:admin
```

Admin UI is served by the server at `/admin`.

## Scraping Whitelists

There are two whitelist layers:

- Client config: `remoteContextGathering.whitelist` in the JupyterLab extension decides which notebook links the client will send to `POST /scrapes/resolve` in the first place. Configure this in the notebook/user/DataHub config alongside `api.baseURL`.
- Server data: the admin UI's whitelist controls which domains the server is allowed to scrape. This is stored in Cosmos DB, not in the client config.

The client whitelist is a request filter. The server whitelist is the enforcement layer.

## Deploy

Preferred manual deploy:

```bash
scripts/deploy-app-service.sh
```

The script:

- reads the App Service name/resource group from `tofu output` when available;
- runs `npm install`, `npm run build`, and `npm run test --if-present`;
- packages tracked files with `git ls-files`;
- copies the built `dist/` into the package;
- deploys the zip to Azure App Service.

Because it uses `git ls-files`, stage new/deleted files before deploying:

```bash
git add -A
```

Set `DRY_RUN=true` to build the zip without deploying.

## GitHub Actions

Server repo: `.github/workflows/main_server-jupytutor.yml` builds on `main` pushes and `workflow_dispatch`, then deploys with `azure/webapps-deploy`.

Check before relying on it: the workflow currently targets app name `server-jupytutor` and uses a publish-profile secret. The Tofu-managed app name is output by:

```bash
cd tofu
tofu output -raw web_app_name
```

Client repo: `../jupytutor/.github/workflows/build.yml` builds/tests/packages the JupyterLab extension. Release workflows are separate (`prep-release.yml`, `publish-release.yml`).

## Production Checklist

1. Apply infrastructure: `cd tofu && tofu apply`.
2. Build server locally: `npm run build`.
3. Stage all changed files: `git add -A`.
4. Deploy server: `scripts/deploy-app-service.sh`.
5. Configure/deploy the client with `api.baseURL` pointing at the App Service URL.
6. Verify `/admin`, `/admin/api/session`, and a client chat request.

## Google Cloud Run (alternative)

The same server can run on Google Cloud Run with completions from Gemini's
OpenAI-compatible endpoint — the endpoint and key that the CS 61A `bot-server`
uses — instead of Azure. Nothing about the Azure deployment changes; two
environment variables select the alternative:

| Switch | Effect |
| --- | --- |
| `GCP_API_KEY` set | Completions go to `GCP_BASE_URL` (default `https://generativelanguage.googleapis.com/v1beta/openai/`) using model `GCP_MODEL` (the code defaults to `gemini-3.7-flash`; the deploy script sets `gemini-3.8-flash`). The Azure `AZURE_FOUNDRY_*` variables are ignored. Gemini's endpoint has no Responses API, so `src/clients/responses-compat.ts` translates each request to chat completions and re-emits the stream events the handlers expect; the Azure path calls `client.responses.create` exactly as before. |
| `COSMOS_DB_ENDPOINT` unset | Interaction logs are appended to `${DATA_DIR}/interactions/YYYY-MM-DD.jsonl` and the scrape cache + admin domain whitelist are JSON files under `${DATA_DIR}/scrapes/<type>/<id>.json` (`DATA_DIR` defaults to `data`). `SCRAPE_ALLOWED_DOMAINS` (comma-separated) seeds allowed domains at startup so scraping works before anyone opens `/admin`; edits made in `/admin` persist as files. |

On Cloud Run, `DATA_DIR=/data` is a Cloud Storage bucket mounted as a volume,
so both survive restarts. The service runs with `max-instances 1` because the
file store and in-flight scrape tracking assume a single process.

Environment on Cloud Run (set by `scripts/deploy-cloud-run.sh`):

| Variable | Source |
| --- | --- |
| `GCP_API_KEY` | Secret `jupytutor-gcp-api-key` (Generative Language API key) |
| `HMAC_KEY` | Secret `jupytutor-hmac-key` (pseudo-anonymous student ids; keep stable) |
| `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` | Secrets `jupytutor-admin-password`, `jupytutor-admin-session-secret` |
| `GCP_MODEL`, `GCP_BASE_URL`, `SCRAPE_ALLOWED_DOMAINS`, `ALLOWED_ORIGINS` | Env vars; override when running the script |
| `DATA_DIR=/data` | The mounted bucket |

### Setup and deploy

Defaults target project `cs61a-140900`, region `us-west1`; override with
`PROJECT=... REGION=...`. Both scripts pass `--project` explicitly, so they
work from any active `gcloud` configuration.

```bash
# Once: APIs, the state bucket, the jupytutor-app service account, and secrets.
scripts/setup-cloud-run.sh
# Once: store the Gemini API key.
printf %s 'THE-KEY' | gcloud secrets versions add jupytutor-gcp-api-key --project cs61a-140900 --data-file=-

# Every deploy: Cloud Build the Dockerfile, deploy the `jupytutor` service, print its URL.
scripts/deploy-cloud-run.sh
DRY_RUN=true scripts/deploy-cloud-run.sh   # print the gcloud commands instead
```

Then point the client at the printed `https://jupytutor-....run.app/` URL via
`api.baseURL` (notebook metadata, `~/.config/jupytutor/config.json`, or
`../jupytutor/src/config.ts`), exactly as with the App Service URL. The admin
panel is at `/admin`; its password is
`gcloud secrets versions access latest --secret jupytutor-admin-password --project cs61a-140900`.

### Local development in GCP mode

Instead of `scripts/write-local-env-from-tofu.sh`, write a `.env` like:

```dotenv
PORT=3000
GCP_API_KEY=...
GCP_MODEL=gemini-3.7-flash
DATA_DIR=./data
SCRAPE_ALLOWED_DOMAINS=inferentialthinking.com
HMAC_KEY=<at least 32 characters>
ADMIN_PASSWORD=<anything>
```

Then `npm install && npm run build && npm start` as usual. Logs and scrape
files appear under `./data/` (git-ignored). `docker build -t jupytutor .`
builds the same image Cloud Run runs.
