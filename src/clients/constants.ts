const DEFAULT_GCP_MODEL = "gemini-3.7-flash";

/**
 * True when the server should get completions from Google's Gemini
 * OpenAI-compatible endpoint (GCP mode) instead of Azure AI Foundry.
 * Setting GCP_API_KEY is the single switch.
 */
export function isGcpProvider(): boolean {
  return Boolean(process.env.GCP_API_KEY?.trim());
}

/**
 * The model name sent with every request and recorded in interaction logs:
 * the Azure Foundry deployment, or GCP_MODEL in GCP mode.
 */
export function getFoundryDeployment(): string {
  if (isGcpProvider()) {
    return process.env.GCP_MODEL?.trim() || DEFAULT_GCP_MODEL;
  }

  const deployment = process.env.AZURE_FOUNDRY_DEPLOYMENT;

  if (!deployment) {
    throw new Error("AZURE_FOUNDRY_DEPLOYMENT must be set.");
  }

  return deployment;
}
