variable "project" {
  description = "GCP project that hosts the service."
  type        = string
  default     = "cs61a-140900"
}

variable "region" {
  description = "Region for Cloud Run, Artifact Registry, and the state bucket."
  type        = string
  default     = "us-west1"
}

variable "service_name" {
  description = "Cloud Run service name; also the Artifact Registry repository name."
  type        = string
  default     = "jupytutor"
}

variable "bucket_name" {
  description = "Cloud Storage bucket mounted at /data (scrape cache + interaction logs). Defaults to <project>-<service_name>."
  type        = string
  default     = null
}

variable "labels" {
  description = "Labels applied to all supported resources."
  type        = map(string)
  default = {
    app        = "jupytutor"
    managed-by = "opentofu"
  }
}

variable "image" {
  description = "Container image the service was first deployed with. scripts/deploy-cloud-run.sh owns image updates afterwards (OpenTofu ignores image changes)."
  type        = string
  default     = null
}

variable "memory" {
  description = "Container memory limit."
  type        = string
  default     = "1Gi"
}

variable "timeout_seconds" {
  description = "Request timeout; streamed chat responses can take tens of seconds."
  type        = number
  default     = 300
}

variable "min_instances" {
  description = "Instances kept warm so a student's first chat after idle isn't a cold start."
  type        = number
  default     = 1
}

variable "gcp_model" {
  description = "Gemini model used for completions (GCP_MODEL)."
  type        = string
  default     = "gemini-3.8-flash"
}

variable "gcp_base_url" {
  description = "Gemini OpenAI-compatible endpoint (GCP_BASE_URL)."
  type        = string
  default     = "https://generativelanguage.googleapis.com/v1beta/openai/"
}

variable "scrape_allowed_domains" {
  description = "Comma-separated domains seeded as allowed in the scrape whitelist (SCRAPE_ALLOWED_DOMAINS)."
  type        = string
  default     = "inferentialthinking.com"
}

variable "allowed_origins" {
  description = "Extra CORS origins beyond DataHub and localhost (ALLOWED_ORIGINS); empty for none."
  type        = string
  default     = ""
}

variable "gemini_api_key" {
  description = "Generative Language API key stored as the jupytutor-gcp-api-key secret. Leave empty to add the secret version by hand instead."
  type        = string
  default     = ""
  sensitive   = true
}

variable "extra_env_vars" {
  description = "Additional plain environment variables for the service."
  type        = map(string)
  default     = {}
  sensitive   = true
}
