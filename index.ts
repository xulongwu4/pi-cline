import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { API_BASE_URL, loadModelGroups } from "./models.ts";

type ProviderRegistrar = {
  registerProvider(name: string, config: ProviderConfig): void;
};

export async function registerClineProviders(
  pi: ProviderRegistrar,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const models = await loadModelGroups(fetcher);
  const common = {
    baseUrl: API_BASE_URL,
    apiKey: "$CLINE_API_KEY",
    authHeader: true,
    api: "openai-completions" as const,
  };

  pi.registerProvider("cline", {
    ...common,
    name: "Cline",
    models: models.cline,
  });
  pi.registerProvider("cline-pass", {
    ...common,
    name: "ClinePass",
    models: models.clinePass,
  });
}

export default registerClineProviders as (pi: ExtensionAPI) => Promise<void>;
