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
  loadModelGroups,
} from "./models.ts";

export function createClineProvider(
  fetcher: typeof fetch = fetch,
  agentDir?: string,
): Provider<"openai-completions"> {
  return createProvider({
    id: "cline",
    name: "Cline",
    baseUrl: API_BASE_URL,
    auth: { apiKey: envApiKeyAuth("Cline API key", ["CLINE_API_KEY"]) },
    models: getFallbackModelGroups(agentDir).cline,
    async fetchModels(context) {
      const groups = await loadModelGroups(fetcher, agentDir, context.signal);
      return groups.cline;
    },
    api: openAICompletionsApi(),
  });
}

export function createClinePassProvider(
  fetcher: typeof fetch = fetch,
  agentDir?: string,
): Provider<"openai-completions"> {
  return createProvider({
    id: "cline-pass",
    name: "ClinePass",
    baseUrl: API_BASE_URL,
    auth: { apiKey: envApiKeyAuth("Cline API key", ["CLINE_API_KEY"]) },
    models: getFallbackModelGroups(agentDir).clinePass,
    async fetchModels(context) {
      const groups = await loadModelGroups(fetcher, agentDir, context.signal);
      return groups.clinePass;
    },
    api: openAICompletionsApi(),
  });
}

export function registerClineProviders(
  pi: { registerProvider(provider: Provider): void },
  fetcher: typeof fetch = fetch,
  agentDir?: string,
): void {
  pi.registerProvider(createClineProvider(fetcher, agentDir));
  pi.registerProvider(createClinePassProvider(fetcher, agentDir));
}

export default function clineExtension(pi: ExtensionAPI): void {
  registerClineProviders(pi);

  pi.on("session_start", async (_event, ctx) => {
    await ctx.modelRegistry.refresh({ providers: ["cline", "cline-pass"] }).catch((error) => {
      console.warn(`[pi-cline] Model refresh failed: ${String(error)}`);
    });
  });
}
