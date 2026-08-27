import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import {
  API_BASE_URL,
  getFallbackModelGroups,
  loadModelGroups,
  type ModelGroups,
} from "./models.ts";

type ProviderRegistrar = {
  registerProvider(name: string, config: ProviderConfig): void;
};

function registerModelGroups(pi: ProviderRegistrar, models: ModelGroups): void {
  const common = {
    baseUrl: API_BASE_URL,
    apiKey: "$CLINE_API_KEY",
    authHeader: true,
    api: "openai-completions" as const,
  };

  pi.registerProvider("cline", { ...common, name: "Cline", models: models.cline });
  pi.registerProvider("cline-pass", {
    ...common,
    name: "ClinePass",
    models: models.clinePass,
  });
}

export function registerClineProviders(
  pi: ProviderRegistrar,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  registerModelGroups(pi, getFallbackModelGroups());
  return Promise.resolve()
    .then(() => loadModelGroups(fetcher))
    .then((models) => registerModelGroups(pi, models));
}

export default function clineExtension(pi: ExtensionAPI): void {
  void registerClineProviders(pi).catch((error) => {
    console.warn(`[pi-cline] Model discovery failed: ${String(error)}`);
  });
}
