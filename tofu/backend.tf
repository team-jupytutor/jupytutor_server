terraform {
  backend "azurerm" {
    resource_group_name  = "jupytutor"
    storage_account_name = "iacjupytutortfstate"
    container_name       = "tfstate"
    key                  = "iac-jupytutor.tfstate"
  }
}
