# Jupytutor Server

Node/Express API for the Jupytutor JupyterLab extension. It handles chat requests, Cosmos DB logging, server-side page scraping, and the `/admin` scrape management PWA.

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

Populate `.env` from the deployed infrastructure:

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
