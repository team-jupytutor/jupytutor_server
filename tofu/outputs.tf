output "resource_group_name" {
  description = "Azure resource group name."
  value       = azurerm_resource_group.main.name
}

output "web_app_name" {
  description = "Azure Linux Web App name."
  value       = azurerm_linux_web_app.main.name
}

output "web_app_default_hostname" {
  description = "Default hostname for the deployed App Service."
  value       = azurerm_linux_web_app.main.default_hostname
}

output "cosmos_endpoint" {
  description = "Cosmos DB endpoint."
  value       = azurerm_cosmosdb_account.main.endpoint
}

output "cosmos_database_name" {
  description = "Cosmos DB SQL database name."
  value       = azurerm_cosmosdb_sql_database.main.name
}

output "cosmos_container_name" {
  description = "Cosmos DB SQL container name."
  value       = azurerm_cosmosdb_sql_container.interactions.name
}

output "cosmos_scrapes_container_name" {
  description = "Cosmos DB SQL container name for scrape state and content."
  value       = azurerm_cosmosdb_sql_container.scrapes.name
}

output "cosmos_master_key" {
  description = "Cosmos DB primary key for local development."
  value       = azurerm_cosmosdb_account.main.primary_key
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

output "azure_foundry_endpoint" {
  description = "Azure AI Foundry endpoint."
  value       = azurerm_cognitive_account.foundry.endpoint
}

output "azure_foundry_api_key" {
  description = "Azure AI Foundry primary API key for local development."
  value       = azurerm_cognitive_account.foundry.primary_access_key
  sensitive   = true
}

output "azure_foundry_base_url" {
  description = "Azure AI Foundry OpenAI-compatible v1 base URL."
  value       = "${azurerm_cognitive_account.foundry.endpoint}openai/v1/"
}

output "azure_foundry_deployment" {
  description = "Azure AI Foundry deployment name used by the server."
  value       = one(keys(var.azure_foundry_deployments))
}

output "azure_foundry_deployments" {
  description = "Azure AI Foundry deployment names."
  value       = keys(azurerm_cognitive_deployment.foundry)
}

output "hmac_key" {
  description = "Generated HMAC key for pseudo-anonymous student IDs."
  value       = random_password.hmac_key.result
  sensitive   = true
}
