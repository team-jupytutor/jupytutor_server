terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  resource_provider_registrations = "none"

  features {
    cognitive_account {
      # This deployment identity can delete Cognitive Services accounts, but cannot purge soft-deleted accounts.
      purge_soft_delete_on_destroy = false
    }
  }
}
