locals {
  normalized_prefix = lower(replace(var.project_name, "/[^a-zA-Z0-9-]/", "-"))
  compact_prefix    = lower(replace(var.project_name, "/[^a-zA-Z0-9]/", ""))
  app_suffix        = "${var.name_suffix}-${random_id.app_service.hex}"
  cosmos_suffix     = "${var.name_suffix}-${random_id.cosmos.hex}"
  foundry_suffix    = "${var.name_suffix}-${random_id.foundry.hex}"
}

resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.resource_group_location
  tags     = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_service_plan" "main" {
  name                = "${local.normalized_prefix}-asp"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  os_type             = "Linux"
  sku_name            = var.app_service_sku_name
  tags                = var.tags
}

resource "random_password" "hmac_key" {
  length  = 64
  special = false
}

resource "random_id" "app_service" {
  byte_length = 3
}

resource "random_id" "cosmos" {
  byte_length = 3
}

resource "random_id" "foundry" {
  byte_length = 3
}

resource "azurerm_linux_web_app" "main" {
  name                = "${local.normalized_prefix}-app-${local.app_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = true
  tags                = var.tags

  site_config {
    always_on        = var.app_service_sku_name != "F1"
    app_command_line = var.startup_command
    ftps_state       = "Disabled"

    application_stack {
      node_version = var.node_version
    }

    dynamic "cors" {
      for_each = length(var.allowed_origins) > 0 ? [1] : []
      content {
        allowed_origins     = var.allowed_origins
        support_credentials = true
      }
    }
  }

  app_settings = merge(
    {
      NODE_ENV                       = "production"
      NPM_CONFIG_PRODUCTION          = "false"
      POST_BUILD_COMMAND             = "npm run build"
      SCM_DO_BUILD_DURING_DEPLOYMENT = "true"
      COSMOS_DB_ENDPOINT             = azurerm_cosmosdb_account.main.endpoint
      COSMOS_DB_MASTER_KEY           = azurerm_cosmosdb_account.main.primary_key
      COSMOS_DB_DATABASE_NAME        = azurerm_cosmosdb_sql_database.main.name
      COSMOS_DB_CONTAINER_NAME       = azurerm_cosmosdb_sql_container.interactions.name
      AZURE_FOUNDRY_API_KEY          = azurerm_cognitive_account.foundry.primary_access_key
      AZURE_FOUNDRY_ENDPOINT         = azurerm_cognitive_account.foundry.endpoint
      AZURE_FOUNDRY_BASE_URL         = "${azurerm_cognitive_account.foundry.endpoint}openai/v1/"
      AZURE_FOUNDRY_DEPLOYMENT       = one(keys(var.azure_foundry_deployments))
      HMAC_KEY                       = random_password.hmac_key.result
    },
    var.extra_app_settings,
  )

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_cosmosdb_account" "main" {
  name                = "${local.normalized_prefix}-cosmos-${local.cosmos_suffix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"
  tags                = var.tags

  public_network_access_enabled    = true
  automatic_failover_enabled       = false
  local_authentication_disabled    = false
  multiple_write_locations_enabled = false

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = var.location
    failover_priority = 0
  }

  dynamic "capabilities" {
    for_each = var.cosmos_serverless ? [1] : []
    content {
      name = "EnableServerless"
    }
  }
}

resource "azurerm_cosmosdb_sql_database" "main" {
  name                = var.cosmos_database_name
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
}

resource "azurerm_cosmosdb_sql_container" "interactions" {
  name                  = var.cosmos_container_name
  resource_group_name   = azurerm_resource_group.main.name
  account_name          = azurerm_cosmosdb_account.main.name
  database_name         = azurerm_cosmosdb_sql_database.main.name
  partition_key_paths   = [var.cosmos_partition_key_path]
  partition_key_version = 2
  throughput            = var.cosmos_serverless ? null : var.cosmos_container_throughput
}

resource "azurerm_cognitive_account" "foundry" {
  name                          = "${local.normalized_prefix}-foundry-${local.foundry_suffix}"
  custom_subdomain_name         = "${substr(local.compact_prefix, 0, 38)}aoai${local.foundry_suffix}"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = var.location
  kind                          = "AIServices"
  sku_name                      = "S0"
  project_management_enabled    = true
  public_network_access_enabled = true
  tags                          = var.tags

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_cognitive_deployment" "foundry" {
  for_each             = var.azure_foundry_deployments
  name                 = each.key
  cognitive_account_id = azurerm_cognitive_account.foundry.id

  model {
    format  = "OpenAI"
    name    = each.value.model_name
    version = each.value.model_version
  }

  sku {
    name     = each.value.sku_name
    capacity = each.value.capacity
  }
}

moved {
  from = azurerm_cognitive_account.openai
  to   = azurerm_cognitive_account.foundry
}

moved {
  from = azurerm_cognitive_deployment.openai
  to   = azurerm_cognitive_deployment.foundry
}
