# Jupytutor Google Cloud Infrastructure

OpenTofu configuration for running the server on Google Cloud Run: the
Artifact Registry repository, the state bucket mounted at `/data`, the
service account, Secret Manager secrets, and the Cloud Run service with all of
its settings. It mirrors `../` (Azure): OpenTofu owns the infrastructure and
`scripts/deploy-cloud-run.sh` ships new images, just as
`scripts/deploy-app-service.sh` ships code to App Service.

The Azure configuration's `../.gitignore` applies here too (git ignore rules inherit downward), so there is no separate ignore file to keep in sync.

## Usage

```sh
cd tofu/gcp
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"   # or: gcloud auth application-default login
tofu init
tofu plan -out plan.out
tofu apply plan.out
```

Defaults target project `cs61a-140900`, region `us-west1`, service
`jupytutor`, bucket `<project>-<service_name>`. The Gemini API key goes in
`terraform.tfvars` as `gemini_api_key` (it becomes a version of the
`jupytutor-gcp-api-key` secret); leave it empty to add the version with
`gcloud secrets versions add` instead.

## Image ownership

`google_cloud_run_v2_service.app` ignores changes to the container image
(`lifecycle.ignore_changes`), so `scripts/deploy-cloud-run.sh` can roll out
builds with `gcloud run deploy --image` without OpenTofu trying to revert
them. Every other setting — environment variables, secret bindings, the
`/data` volume, scaling, timeout, memory, the service account — is applied
here. To change the model, edit `gcp_model` and `tofu apply`; that creates a
new revision with no downtime.

## Remote State

State is stored in the `cs61a-140900-tofu-state` bucket (`backend.tf`) under
the `jupytutor` prefix. Bootstrap it once before `tofu init`:

```sh
gcloud storage buckets create gs://cs61a-140900-tofu-state --project cs61a-140900 \
  --location us-west1 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://cs61a-140900-tofu-state --versioning
```

Treat state as sensitive: it holds the generated `HMAC_KEY`, admin password,
admin session secret, and the Gemini API key.

## Adopting existing resources

The current deployment was created with `gcloud` and then imported, so the
state already matches it. For another environment created outside OpenTofu,
`tofu import` each resource (project services, repository, bucket, service
account, bucket IAM member, secrets, secret IAM members, secret versions,
`random_password` values via their payloads, the service, and its
`allUsers` invoker binding) and iterate on the configuration until
`tofu plan` reports no changes before applying. Importing is read-only; a
clean plan guarantees no replacement of the running service.

## Notes

- `max_instance_count` is fixed at 1: the file store on the mounted bucket
  and in-flight scrape tracking assume a single process.
- The bucket has `prevent_destroy`; the service has the provider's default
  `deletion_protection`.
- Rotate the admin session secret by tainting `random_password.admin_session_secret`
  and applying. Do not rotate `random_password.hmac_key`: pseudo-anonymous
  student ids would stop being joinable.
- Express owns CORS in `src/app.ts`; `allowed_origins` only adds origins.
