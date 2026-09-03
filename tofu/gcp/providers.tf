terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0, < 8.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# Credentials: `gcloud auth application-default login`, or for a one-off run
# `export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"`.
provider "google" {
  project = var.project
  region  = var.region
}
