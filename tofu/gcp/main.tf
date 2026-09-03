locals {
  bucket_name = coalesce(var.bucket_name, "${var.project}-${var.service_name}")
  image       = coalesce(var.image, "${var.region}-docker.pkg.dev/${var.project}/${var.service_name}/app")
  apis = [
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "generativelanguage.googleapis.com",
  ]
  secrets = {
    gcp_api_key          = "${var.service_name}-gcp-api-key"
    hmac_key             = "${var.service_name}-hmac-key"
    admin_password       = "${var.service_name}-admin-password"
    admin_session_secret = "${var.service_name}-admin-session-secret"
  }
  # Plain environment. If you add or rename settings here, update the README's
  # environment table so local development stays in sync.
  env = merge(
    {
      DATA_DIR               = "/data"
      NODE_ENV               = "production"
      GCP_MODEL              = var.gcp_model
      GCP_BASE_URL           = var.gcp_base_url
      SCRAPE_ALLOWED_DOMAINS = var.scrape_allowed_domains
    },
    var.allowed_origins == "" ? {} : { ALLOWED_ORIGINS = var.allowed_origins },
    var.extra_env_vars,
  )
  secret_env = {
    GCP_API_KEY          = local.secrets.gcp_api_key
    HMAC_KEY             = local.secrets.hmac_key
    ADMIN_PASSWORD       = local.secrets.admin_password
    ADMIN_SESSION_SECRET = local.secrets.admin_session_secret
  }
}

resource "google_project_service" "main" {
  for_each           = toset(local.apis)
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  repository_id = var.service_name
  location      = var.region
  format        = "DOCKER"
  labels        = var.labels
  depends_on    = [google_project_service.main]
}

# Mounted at /data: the scrape cache, admin whitelist, and interaction logs.
resource "google_storage_bucket" "state" {
  name                        = local.bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.labels

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account" "app" {
  account_id   = "${var.service_name}-app"
  display_name = "Jupytutor server"
  description  = "Identity of the ${var.service_name} Cloud Run service"
}

resource "google_storage_bucket_iam_member" "app_state" {
  bucket = google_storage_bucket.state.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app.email}"
}

# ─── Secrets ─────────────────────────────────────────────────────────

resource "google_secret_manager_secret" "main" {
  for_each  = local.secrets
  secret_id = each.value
  labels    = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.main]
}

resource "google_secret_manager_secret_iam_member" "app" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.main[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}

# Generated once and kept in state (treat state as sensitive). HMAC_KEY must
# stay stable so pseudo-anonymous student ids remain joinable.
resource "random_password" "hmac_key" {
  length = 64
}

resource "random_password" "admin_password" {
  length = 64
}

resource "random_password" "admin_session_secret" {
  length = 64
}

resource "google_secret_manager_secret_version" "hmac_key" {
  secret      = google_secret_manager_secret.main["hmac_key"].id
  secret_data = random_password.hmac_key.result
}

resource "google_secret_manager_secret_version" "admin_password" {
  secret      = google_secret_manager_secret.main["admin_password"].id
  secret_data = random_password.admin_password.result
}

resource "google_secret_manager_secret_version" "admin_session_secret" {
  secret      = google_secret_manager_secret.main["admin_session_secret"].id
  secret_data = random_password.admin_session_secret.result
}

# The Gemini API key comes from terraform.tfvars (gemini_api_key). With it
# empty, add a version by hand:
#   printf %s 'THE-KEY' | gcloud secrets versions add jupytutor-gcp-api-key --data-file=-
resource "google_secret_manager_secret_version" "gcp_api_key" {
  count       = var.gemini_api_key == "" ? 0 : 1
  secret      = google_secret_manager_secret.main["gcp_api_key"].id
  secret_data = var.gemini_api_key
}

# ─── Cloud Run ───────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region
  labels   = var.labels

  template {
    service_account = google_service_account.app.email
    timeout         = "${var.timeout_seconds}s"

    # max 1 is load-bearing: the file store on the mounted bucket and
    # in-flight scrape tracking assume a single process.
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = 1
    }

    containers {
      image = local.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1000m"
          memory = var.memory
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = local.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      volume_mounts {
        name       = "state"
        mount_path = "/data"
      }
    }

    volumes {
      name = "state"
      gcs {
        bucket = google_storage_bucket.state.name
      }
    }
  }

  lifecycle {
    # scripts/deploy-cloud-run.sh deploys new images; OpenTofu owns everything else.
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_secret_manager_secret.main,
    google_secret_manager_secret_iam_member.app,
    google_storage_bucket_iam_member.app_state,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
