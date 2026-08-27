import {
  createProvider,
  envApiKeyAuth,
  openAICompletionsApi,
  type Provider,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  API_BASE_URL,
  getFallbackModelGroups,
  refreshModelCatalog,
  type ModelGroups,
} from "./models.ts";

type ProviderRegistrar = {
  registerProvider(provider: Provider): void;
};

function registerModelGroups(pi: ProviderRegistrar, models: ModelGroups): void {
  pi.registerProvider(
    createProvider({
      id: "cline",
      name: "Cline",
      baseUrl: API_BASE_URL,
      auth: { apiKey: envApiKeyAuth("Cline API key", ["CLINE_API_KEY"]) },
      models: models.cline,
      api: openAICompletionsApi(),
    }),
  );
  pi.registerProvider(
    createProvider({
      id: "cline-pass",
      name: "ClinePass",
      baseUrl: API_BASE_URL,
      auth: { apiKey: envApiKeyAuth("Cline API key", ["CLINE_API_KEY"]) },
      models: models.clinePass,
      api: openAICompletionsApi(),
    }),
  );
}

export function registerClineProviders(
  pi: ProviderRegistrar,
  fetcher: typeof fetch = fetch,
  agentDir?: string,
): Promise<void> {
  registerModelGroups(pi, getFallbackModelGroups(agentDir));
  return refreshModelCatalog(fetcher, agentDir)
    .then(() => undefined)
    .catch((error) => {
      console.warn(`[pi-cline] Model discovery failed: ${String(error)}`);
    });
}

export default function clineExtension(pi: ExtensionAPI): void {
  void registerClineProviders(pi);
}
