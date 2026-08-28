import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Provider } from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createClinePassProvider, createClineProvider, registerClineProviders } from "./index.ts";
import { CATALOG_TIMEOUT_MS, getFallbackModelGroups, loadModelGroups } from "./models.ts";

const catalog = {
  data: [
    {
      id: "anthropic/claude-test",
      name: "Claude Test",
      context_length: 200_000,
      top_provider: { max_completion_tokens: 16_000 },
      supported_parameters: ["reasoning", "tools"],
      pricing: { prompt: "0.000003", completion: "0.000015" },
      architecture: { input_modalities: ["text", "image"] },
    },
    {
      id: "z-ai/glm-5.3",
      name: "GLM 5.3",
      context_length: 1_000_000,
      top_provider: { max_completion_tokens: 131_072 },
      supported_parameters: ["reasoning", "tools"],
      pricing: { prompt: "0.0000014", completion: "0.0000044" },
    },
  ],
};
const recommended = {
  free: [{ id: "anthropic/claude-test", name: "Claude Test" }],
  clinePass: [{ id: "cline-pass/glm-5.3", name: "GLM-5.3" }],
};

function fakeFetch(input: string | URL | Request): Promise<Response> {
  const body = String(input).endsWith("recommended-models") ? recommended : catalog;
  return Promise.resolve(Response.json(body));
}

test("allows 5 seconds for the live Cline catalog", () => {
  assert.equal(CATALOG_TIMEOUT_MS, 5_000);
});

test("maps the Cline catalog and ClinePass subset", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-cline-map-"));
  try {
    const models = await loadModelGroups(fakeFetch, agentDir);
    assert.equal(models.cline.length, 2);
    assert.deepEqual(models.cline[0].input, ["text", "image"]);
    assert.equal(models.cline[0].cost.input, 0, "recommended free models have zero cost");
    assert.equal(models.cline[1].cost.input, 1.4, "per-token prices become per-million prices");
    assert.equal(models.clinePass[0].id, "cline-pass/glm-5.3");
    assert.equal(models.clinePass[0].provider, "cline-pass");
    assert.equal(models.clinePass[0].contextWindow, 1_000_000);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("registers initial models and refreshes dynamically via fetchModels", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-cline-register-"));
  try {
    const cline = createClineProvider(fakeFetch, agentDir);
    const clinePass = createClinePassProvider(fakeFetch, agentDir);

    // Initial synchronous registration uses baseline/cached models
    assert.equal(cline.id, "cline");
    assert.equal(clinePass.id, "cline-pass");
    assert.equal(cline.getModels().length, 1);
    assert.equal(clinePass.getModels().length, 13);

    // Dynamic refresh via refreshModels / fetchModels updates models in-place
    const mockPublish = async (pub: { update?: () => void }) => {
      pub.update?.();
      return true;
    };

    await cline.refreshModels!({
      allowNetwork: true,
      publish: mockPublish,
      signal: new AbortController().signal,
    });
    await clinePass.refreshModels!({
      allowNetwork: true,
      publish: mockPublish,
      signal: new AbortController().signal,
    });

    assert.ok(cline.getModels().some((m) => m.id === "anthropic/claude-test"));
    assert.ok(cline.getModels().some((m) => m.id === "z-ai/glm-5.3"));
    assert.ok(clinePass.getModels().some((m) => m.id === "cline-pass/glm-5.3"));
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("allows baseUrl overwrite from models.json for cline and cline-pass", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-cline-override-"));
  try {
    const modelsJsonPath = join(agentDir, "models.json");
    writeFileSync(
      modelsJsonPath,
      JSON.stringify({
        providers: {
          cline: { baseUrl: "http://localhost:8789" },
          "cline-pass": { baseUrl: "http://localhost:8789" },
        },
      }),
    );

    const runtime = await ModelRuntime.create({
      modelsPath: modelsJsonPath,
      authPath: join(agentDir, "auth.json"),
    });
    const registry = new ModelRegistry(runtime);

    registerClineProviders(registry, fakeFetch, agentDir);

    const clineProvider = runtime.getProvider("cline");
    const clinePassProvider = runtime.getProvider("cline-pass");
    const clineModels = runtime.getModels("cline");
    const clinePassModels = runtime.getModels("cline-pass");

    assert.equal(clineProvider?.baseUrl, "http://localhost:8789");
    assert.equal(clinePassProvider?.baseUrl, "http://localhost:8789");
    assert.equal(clineModels[0]?.baseUrl, "http://localhost:8789");
    assert.equal(clinePassModels[0]?.baseUrl, "http://localhost:8789");
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("preserves route-marker baseUrl wrapping across dynamic model refreshes", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-cline-route-marker-"));
  try {
    const modelsJsonPath = join(agentDir, "models.json");
    writeFileSync(
      modelsJsonPath,
      JSON.stringify({
        providers: {
          cline: {
            baseUrl: "http://localhost:8788",
            routeMarker: "route_to",
          },
        },
      }),
    );

    process.env.CLINE_API_KEY = "dummy-key";

    const runtime = await ModelRuntime.create({
      modelsPath: modelsJsonPath,
      authPath: join(agentDir, "auth.json"),
    });
    const registry = new ModelRegistry(runtime);

    // Initial registration
    registerClineProviders(registry, fakeFetch, agentDir);

    // Simulate route-marker wrapping on session_start
    const native = registry.getRegisteredNativeProvider("cline")!;
    const routedBaseUrl = "http://localhost:8788/route_to/https://api.cline.bot/api/v1";
    const routedProvider: Provider = {
      ...native,
      baseUrl: routedBaseUrl,
      auth: {
        apiKey: {
          ...native.auth.apiKey!,
          async resolve(input) {
            const res = await native.auth.apiKey!.resolve(input);
            return res ? { ...res, auth: { ...res.auth, baseUrl: routedBaseUrl } } : undefined;
          },
        },
      },
    };
    registry.registerProvider(routedProvider);

    // Verify routed auth before refresh
    const authBefore = await runtime.getAuth("cline");
    assert.equal(authBefore?.auth?.baseUrl, routedBaseUrl);

    // Non-blocking model refresh runs
    const cline = registry.getRegisteredNativeProvider("cline")!;
    const mockPublish = async (pub: { update?: () => void }) => {
      pub.update?.();
      return true;
    };
    await cline.refreshModels!({
      allowNetwork: true,
      publish: mockPublish,
      signal: new AbortController().signal,
    });

    // Verify routed auth is preserved after refresh and live models are present
    const authAfter = await runtime.getAuth("cline");
    assert.equal(authAfter?.auth?.baseUrl, routedBaseUrl);
    assert.ok(runtime.getModels("cline").some((m) => m.id === "anthropic/claude-test"));
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("caches each live provider catalog and reuses it offline", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-cline-cache-"));
  try {
    const live = await loadModelGroups(fakeFetch, agentDir);
    const clinePath = join(agentDir, "cline", "models.json");
    const clinePassPath = join(agentDir, "cline-pass", "models.json");

    for (const path of [clinePath, clinePassPath]) {
      assert.equal(existsSync(path), true);
      assert.equal(statSync(path).mode & 0o777, 0o600);
      assert.ok(Array.isArray(JSON.parse(readFileSync(path, "utf8"))));
    }
    assert.deepEqual(getFallbackModelGroups(agentDir), live);

    const offline = () => Promise.resolve(new Response("down", { status: 503 }));
    assert.deepEqual(await loadModelGroups(offline, agentDir), live);

    writeFileSync(clinePath, "not json");
    const fallback = getFallbackModelGroups(agentDir);
    assert.equal(fallback.cline[0].id, "anthropic/claude-sonnet-4-6");
    assert.deepEqual(fallback.clinePass, live.clinePass);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("keeps both providers usable when discovery fails", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-cline-fallback-"));
  try {
    const fail = () => Promise.resolve(new Response("down", { status: 503 }));
    const models = await loadModelGroups(fail, agentDir);
    assert.equal(models.cline[0].id, "anthropic/claude-sonnet-4-6");
    assert.equal(models.clinePass.length, 13);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});
