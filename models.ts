import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Model, ModelCost, ProviderId } from "@earendil-works/pi-ai";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const API_BASE_URL = "https://api.cline.bot/api/v1";
export const CATALOG_TIMEOUT_MS = 15_000;
const MODELS_URL = `${API_BASE_URL}/ai/cline/models`;
const RECOMMENDED_URL = `${API_BASE_URL}/ai/cline/recommended-models`;
const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

type ClineModel = Model<"openai-completions">;
export type ModelGroups = { cline: ClineModel[]; clinePass: ClineModel[] };
type CatalogEntry = {
  id?: string;
  name?: string;
  context_length?: number;
  top_provider?: { context_length?: number; max_completion_tokens?: number };
  supported_parameters?: string[];
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    input_cache_read?: string | number;
    input_cache_write?: string | number;
  };
  architecture?: { modality?: string; input_modalities?: string[] };
};
type RecommendedEntry = { id?: string; name?: string };
type RecommendedPayload = {
  recommended?: RecommendedEntry[];
  free?: RecommendedEntry[];
  clinePass?: RecommendedEntry[];
};
type PassSeed = {
  id: string;
  name: string;
  cost: ModelCost;
};

// Cline's public ClinePass list is fetched at startup. These documented entries
// keep the subscription provider usable if catalog discovery is unavailable.
const PASS_FALLBACK: PassSeed[] = [
  ["glm-5.3", "GLM-5.3", 1.4, 4.4, 0.26, 0],
  ["glm-5.2", "GLM-5.2", 1.4, 4.4, 0.26, 0],
  ["kimi-k3", "Kimi K3", 3, 15, 0.3, 0],
  ["kimi-k2.7-code", "Kimi K2.7 Code", 0.95, 4, 0.19, 0],
  ["kimi-k2.6", "Kimi K2.6", 0.95, 4, 0.16, 0],
  ["deepseek-v4-pro", "DeepSeek V4 Pro", 0.66, 1.98, 0.022, 0],
  ["deepseek-v4-flash", "DeepSeek V4 Flash", 0.22, 0.66, 0.007, 0],
  ["mimo-v2.5", "MiMo-V2.5", 0.14, 0.28, 0.0028, 0],
  ["mimo-v2.5-pro", "MiMo-V2.5-Pro", 1.74, 3.48, 0.0145, 0],
  ["minimax-m3", "MiniMax M3", 0.3, 1.2, 0.06, 0],
  ["qwen3.8-max", "Qwen3.8 Max", 2, 6, 0.25, 2.5],
  ["qwen3.7-max", "Qwen3.7 Max", 2.5, 7.5, 0.5, 3.125],
  ["qwen3.7-plus", "Qwen3.7 Plus", 0.4, 1.6, 0.04, 0.5],
].map(([id, name, input, output, cacheRead, cacheWrite]) => ({
  id: `cline-pass/${id}`,
  name,
  cost: { input, output, cacheRead, cacheWrite },
})) as PassSeed[];

function perMillion(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed * 1_000_000 : 0;
}

function modelFromCatalog(
  raw: CatalogEntry,
  provider: ProviderId,
  override: Partial<Pick<ClineModel, "id" | "name" | "cost">> = {},
): ClineModel {
  const parameters = raw.supported_parameters ?? [];
  const modalities = raw.architecture?.input_modalities ?? [];
  return {
    id: override.id ?? raw.id!,
    name: override.name ?? raw.name ?? raw.id!,
    api: "openai-completions",
    provider,
    baseUrl: API_BASE_URL,
    reasoning: parameters.includes("reasoning") || parameters.includes("include_reasoning"),
    input:
      modalities.includes("image") || raw.architecture?.modality?.includes("image")
        ? ["text", "image"]
        : ["text"],
    cost: override.cost ?? {
      input: perMillion(raw.pricing?.prompt),
      output: perMillion(raw.pricing?.completion),
      cacheRead: perMillion(raw.pricing?.input_cache_read),
      cacheWrite: perMillion(raw.pricing?.input_cache_write),
    },
    contextWindow: raw.context_length || raw.top_provider?.context_length || 128_000,
    maxTokens: raw.top_provider?.max_completion_tokens || 8_192,
    compat: { supportsDeveloperRole: false, supportsStore: false, maxTokensField: "max_tokens" },
  };
}

function fallbackModel(
  provider: ProviderId,
  id: string,
  name: string,
  cost: ModelCost = ZERO_COST,
): ClineModel {
  return {
    id,
    name,
    api: "openai-completions",
    provider,
    baseUrl: API_BASE_URL,
    reasoning: true,
    input: ["text"],
    cost,
    contextWindow: 128_000,
    maxTokens: 8_192,
    compat: { supportsDeveloperRole: false, supportsStore: false, maxTokensField: "max_tokens" },
  };
}

function cachePath(provider: "cline" | "cline-pass", agentDir: string): string {
  return join(agentDir, provider, "models.json");
}

function loadCachedModels(
  provider: "cline" | "cline-pass",
  agentDir: string,
): ClineModel[] | undefined {
  try {
    const models = JSON.parse(readFileSync(cachePath(provider, agentDir), "utf8")) as ClineModel[];
    if (
      !Array.isArray(models) ||
      models.length === 0 ||
      models.some(
        (model) =>
          typeof model?.id !== "string" ||
          typeof model?.name !== "string" ||
          model.provider !== provider ||
          model.api !== "openai-completions" ||
          !Array.isArray(model.input) ||
          typeof model.contextWindow !== "number" ||
          typeof model.maxTokens !== "number",
      )
    ) {
      return undefined;
    }
    return models;
  } catch {
    return undefined;
  }
}

function writeCachedModels(
  provider: "cline" | "cline-pass",
  models: ClineModel[],
  agentDir: string,
): void {
  try {
    const path = cachePath(provider, agentDir);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(models, null, 2), { mode: 0o600 });
    chmodSync(path, 0o600);
  } catch {
    // A cache write failure must not hide a valid live catalog.
  }
}

export function getFallbackModelGroups(agentDir = getAgentDir()): ModelGroups {
  return {
    cline:
      loadCachedModels("cline", agentDir) ??
      [fallbackModel("cline", "anthropic/claude-sonnet-4-6", "Claude Sonnet 4.6")],
    clinePass:
      loadCachedModels("cline-pass", agentDir) ??
      PASS_FALLBACK.map((seed) => fallbackModel("cline-pass", seed.id, seed.name, seed.cost)),
  };
}

async function getJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function loadModelGroups(
  fetcher: typeof fetch = fetch,
  agentDir = getAgentDir(),
): Promise<ModelGroups> {
  const fallback = getFallbackModelGroups(agentDir);
  const [catalogResult, recommendedResult] = await Promise.allSettled([
    getJson<{ data?: CatalogEntry[] }>(fetcher, MODELS_URL),
    getJson<RecommendedPayload>(fetcher, RECOMMENDED_URL),
  ]);
  const catalog =
    catalogResult.status === "fulfilled"
      ? (catalogResult.value.data ?? []).filter(
          (entry): entry is CatalogEntry & { id: string } =>
            Boolean(entry.id) && (entry.supported_parameters ?? []).includes("tools"),
        )
      : [];
  const recommended = recommendedResult.status === "fulfilled" ? recommendedResult.value : {};
  const freeIds = new Set((recommended.free ?? []).flatMap((entry) => (entry.id ? [entry.id] : [])));

  const cline =
    catalog.length > 0
      ? catalog.map((entry) =>
          modelFromCatalog(entry, "cline", freeIds.has(entry.id) ? { cost: ZERO_COST } : {}),
        )
      : fallback.cline;
  if (catalog.length > 0) writeCachedModels("cline", cline, agentDir);

  const bySlug = new Map(catalog.map((entry) => [entry.id.split("/").at(-1), entry]));
  const passEntries = [...(recommended.clinePass ?? []), ...(recommended.free ?? [])];
  const passSeeds = [
    ...new Map(
      passEntries.flatMap((entry) => {
        if (!entry.id) return [];
        const fallback = PASS_FALLBACK.find((model) => model.id === entry.id);
        const seed: PassSeed = {
          id: entry.id,
          name: entry.name ?? fallback?.name ?? entry.id,
          cost: fallback?.cost ?? ZERO_COST,
        };
        return [[entry.id, seed] as const];
      }),
    ).values(),
  ];
  const clinePass =
    passSeeds.length > 0
      ? passSeeds.map((seed) => {
          const match = bySlug.get(seed.id.split("/").at(-1));
          return match
            ? modelFromCatalog(match, "cline-pass", seed)
            : fallbackModel("cline-pass", seed.id, seed.name, seed.cost);
        })
      : fallback.clinePass;
  if (passSeeds.length > 0) writeCachedModels("cline-pass", clinePass, agentDir);

  return { cline, clinePass };
}
