# Jupytutor Azure Infrastructure

OpenTofu configuration for an Azure Linux App Service, Azure OpenAI, and Cosmos DB SQL API.

## Usage

```sh
cd tofu
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars
tofu init
tofu plan -out plan.out
tofu apply plan.out
```

The default resource group is `jupytutor`; resource names are still prefixed with `iac-jupytutor` by default. Override `project_name`, `resource_group_name`, and `name_suffix` in `terraform.tfvars` for another environment. `name_suffix` must make globally named resources unique in Azure.

The resource group location and workload resource location are separate. Keep `resource_group_location` equal to the existing Azure resource group's location, and use `location` for App Service, Cosmos DB, and Azure OpenAI.

## Remote State

State is configured for Azure Blob Storage through the `azurerm` backend in `backend.tf`.

Bootstrap the state container once before `tofu init`:

```sh
az login
az account set --subscription "<subscription-id>"
az group create --name jupytutor --location westus
az storage account create \
  --resource-group jupytutor \
  --name iacjupytutortfstate \
  --location westus \
  --sku Standard_LRS \
  --kind StorageV2 \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false
az storage container create \
  --account-name iacjupytutortfstate \
  --name tfstate \
  --auth-mode login
```

Then initialize with:

```sh
tofu init
```

If you already have local state, OpenTofu will ask whether to migrate it to the Azure Blob backend during init.

Import the existing resource group before applying:

```sh
RESOURCE_GROUP_NAME="jupytutor"
SUBSCRIPTION_ID="$(az account show --query id -o tsv)"

tofu import \
  azurerm_resource_group.main \
  "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP_NAME}"
```

The resource group has `prevent_destroy` enabled so OpenTofu will fail rather than delete it.

## Notes

- The Cosmos database/container defaults match the current server code: `jupytutor` and `Container1`.
- The App Service settings include `COSMOS_DB_ENDPOINT`, `COSMOS_DB_MASTER_KEY`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_DEPLOYMENT`, and `HMAC_KEY`.
- The server builds its Azure OpenAI request URL from `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_VERSION`. Set `AZURE_OPENAI_BASE_URL` only if you need to override the full `/openai/responses?...` URL.
- Azure OpenAI model availability is region dependent. If `gpt-5-mini` is unavailable in the selected location, change `location` or the `azure_openai_deployments` block.
