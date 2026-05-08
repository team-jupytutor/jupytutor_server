variable "project_name" {
  description = "Consistent prefix used for Azure resource names."
  type        = string
  default     = "iac-jupytutor"

  validation {
    condition     = can(regex("^[a-zA-Z0-9-]{3,40}$", var.project_name))
    error_message = "project_name must be 3-40 characters and contain only letters, numbers, and hyphens."
  }
}

variable "resource_group_name" {
  description = "Resource group name. Resource names still use project_name as their prefix."
  type        = string
  default     = "jupytutor"
}

variable "name_suffix" {
  description = "Suffix used for globally unique Azure resource names such as App Service, Cosmos DB, and Azure OpenAI."
  type        = string
  default     = "dev"

  validation {
    condition     = can(regex("^[a-z0-9-]{2,16}$", var.name_suffix))
    error_message = "name_suffix must be 2-16 lowercase letters, numbers, or hyphens."
  }
}

variable "location" {
  description = "Azure region for workload resources."
  type        = string
  default     = "westus"
}

variable "resource_group_location" {
  description = "Azure region metadata for the resource group. Existing resource groups must keep their current location."
  type        = string
  default     = "eastus"
}

variable "tags" {
  description = "Tags applied to all supported resources."
  type        = map(string)
  default = {
    app       = "jupytutor"
    managedBy = "opentofu"
    Type      = "Project"
  }
}

variable "app_service_sku_name" {
  description = "Linux App Service Plan SKU."
  type        = string
  default     = "B1"
}

variable "node_version" {
  description = "Node runtime version for Azure Linux App Service."
  type        = string
  default     = "22-lts"
}

variable "startup_command" {
  description = "Startup command for the web app."
  type        = string
  default     = "npm start"
}

variable "allowed_origins" {
  description = "CORS origins allowed by Azure App Service. Application-level CORS is still controlled in src/app.ts."
  type        = list(string)
  default = [
    "http://localhost:8888",
    "http://127.0.0.1:8888",
    "http://localhost:8889",
    "http://127.0.0.1:8889",
    "https://datahub.berkeley.edu",
  ]
}

variable "hmac_key" {
  description = "Secret used by the app to pseudo-anonymize student IDs. Must be at least 32 characters."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.hmac_key) >= 32
    error_message = "hmac_key must be at least 32 characters."
  }
}

variable "extra_app_settings" {
  description = "Additional App Service app settings."
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "cosmos_database_name" {
  description = "Cosmos DB SQL database name used by the application."
  type        = string
  default     = "jupytutor"
}

variable "cosmos_container_name" {
  description = "Cosmos DB SQL container name used by the application."
  type        = string
  default     = "Container1"
}

variable "cosmos_partition_key_path" {
  description = "Partition key path for the Cosmos DB SQL container."
  type        = string
  default     = "/student_id"
}

variable "cosmos_serverless" {
  description = "Use Cosmos DB serverless capacity mode."
  type        = bool
  default     = true
}

variable "cosmos_container_throughput" {
  description = "Manual RU/s for the container when cosmos_serverless is false. Leave null for default database/account behavior."
  type        = number
  default     = null
}

variable "azure_openai_deployments" {
  description = "Azure OpenAI model deployments. The app currently uses deployment name gpt-5-mini from src/clients/constants.ts."
  type = map(object({
    model_name    = string
    model_version = string
    sku_name      = optional(string, "GlobalStandard")
    capacity      = optional(number, 1)
  }))
  default = {
    gpt-5-mini = {
      model_name    = "gpt-5-mini"
      model_version = "2025-08-07"
      sku_name      = "GlobalStandard"
      capacity      = 1
    }
  }
}

variable "azure_openai_deployment_name" {
  description = "Azure OpenAI deployment name the App Service should use."
  type        = string
  default     = "gpt-5-mini"
}
