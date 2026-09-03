output "project" {
  description = "GCP project."
  value       = var.project
}

output "region" {
  description = "Region of the service and its image repository."
  value       = var.region
}

output "service_name" {
  description = "Cloud Run service name."
  value       = google_cloud_run_v2_service.app.name
}

output "service_url" {
  description = "Public URL of the service; the client's api.baseURL (add a trailing slash)."
  value       = google_cloud_run_v2_service.app.uri
}

output "image" {
  description = "Image name that scripts/deploy-cloud-run.sh builds and deploys."
  value       = local.image
}

output "bucket_name" {
  description = "Bucket mounted at /data (scrape cache + interaction logs)."
  value       = google_storage_bucket.state.name
}

output "service_account_email" {
  description = "Identity the service runs as."
  value       = google_service_account.app.email
}

output "hmac_key" {
  description = "Generated HMAC key for pseudo-anonymous student ids."
  value       = random_password.hmac_key.result
  sensitive   = true
}

output "admin_password" {
  description = "Generated shared password for the Jupytutor admin pane."
  value       = random_password.admin_password.result
  sensitive   = true
}

output "admin_session_secret" {
  description = "Generated cookie signing secret for the Jupytutor admin pane."
  value       = random_password.admin_session_secret.result
  sensitive   = true
}
