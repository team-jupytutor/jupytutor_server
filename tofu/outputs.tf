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

output "azure_foundry_endpoint" {
  description = "Azure AI Foundry endpoint."
  value       = azurerm_cognitive_account.foundry.endpoint
}

output "azure_foundry_deployments" {
  description = "Azure AI Foundry deployment names."
  value       = keys(azurerm_cognitive_deployment.foundry)
}
