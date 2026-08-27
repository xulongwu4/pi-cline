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
  modelGroupsEqual,
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
  onCatalogUpdated?: (message: string) => void,
): Promise<boolean> {
  const initial = getFallbackModelGroups(agentDir);
  registerModelGroups(pi, initial);

  return refreshModelCatalog(fetcher, agentDir)
    .then((refreshed) => {
      if (refreshed && !modelGroupsEqual(initial, refreshed)) {
        const message =
          "[pi-cline] Model catalog updated in background. Run /reload to load the full list of models.";
        if (onCatalogUpdated) {
          onCatalogUpdated(message);
        } else {
          console.log(message);
        }
        return true;
      }
      return false;
    })
    .catch((error) => {
      console.warn(`[pi-cline] Model discovery failed: ${String(error)}`);
      return false;
    });
}

export default function clineExtension(pi: ExtensionAPI): void {
  let pendingNotification: string | undefined;
  let sessionCtx: { hasUI: boolean; ui?: { notify(msg: string, type?: string): void } } | undefined;

  function showNotification(msg: string) {
    if (sessionCtx?.hasUI && sessionCtx.ui?.notify) {
      sessionCtx.ui.notify(msg, "info");
    } else if (sessionCtx) {
      console.log(msg);
    } else {
      pendingNotification = msg;
    }
  }

  pi.on("session_start", (_event, ctx) => {
    sessionCtx = ctx;
    if (pendingNotification) {
      showNotification(pendingNotification);
      pendingNotification = undefined;
    }
  });

  void registerClineProviders(pi, fetch, undefined, (message) => {
    showNotification(message);
  });
}
