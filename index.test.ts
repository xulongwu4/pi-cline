import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderConfig } from "@earendil-works/pi-coding-agent";
import { registerClineProviders } from "./index.ts";
import { loadModelGroups } from "./models.ts";

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

test("maps the Cline catalog and ClinePass subset", async () => {
  const models = await loadModelGroups(fakeFetch);
  assert.equal(models.cline.length, 2);
  assert.deepEqual(models.cline[0].input, ["text", "image"]);
  assert.equal(models.cline[0].cost.input, 0, "recommended free models have zero cost");
  assert.equal(models.cline[1].cost.input, 1.4, "per-token prices become per-million prices");
  assert.equal(models.clinePass[0].id, "cline-pass/glm-5.3");
  assert.equal(models.clinePass[0].provider, "cline-pass");
  assert.equal(models.clinePass[0].contextWindow, 1_000_000);
});

test("registers cline and cline-pass with shared API-key transport", async () => {
  const providers: Array<{ name: string; config: ProviderConfig }> = [];
  await registerClineProviders(
    { registerProvider: (name, config) => void providers.push({ name, config }) },
    fakeFetch,
  );
  assert.deepEqual(providers.map((provider) => provider.name), ["cline", "cline-pass"]);
  assert.ok(providers.every((provider) => provider.config.apiKey === "$CLINE_API_KEY"));
  assert.ok(providers.every((provider) => provider.config.api === "openai-completions"));
  assert.ok(providers.every((provider) => (provider.config.models?.length ?? 0) > 0));
});

test("keeps both providers usable when discovery fails", async () => {
  const fail = () => Promise.resolve(new Response("down", { status: 503 }));
  const models = await loadModelGroups(fail);
  assert.equal(models.cline[0].id, "anthropic/claude-sonnet-4-6");
  assert.equal(models.clinePass.length, 13);
});
