export function getFoundryDeployment(): string {
  const deployment = process.env.AZURE_FOUNDRY_DEPLOYMENT;

  if (!deployment) {
    throw new Error("AZURE_FOUNDRY_DEPLOYMENT must be set.");
  }

  return deployment;
}
