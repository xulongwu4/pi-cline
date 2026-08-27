# pi-cline

Native [Pi](https://pi.dev) providers for Cline and ClinePass.

## Verified mapping

| Pi provider | Cline product | OpenCode analogue | Billing/model set |
|---|---|---|---|
| `cline` | Cline API | `opencode` (Zen) | Usage-billed broad catalog |
| `cline-pass` | ClinePass | `opencode-go` | Flat subscription, curated models |

The analogy is correct at the product level. The transport differs: both Cline products use the same OpenAI-compatible Chat Completions endpoint (`https://api.cline.bot/api/v1`), while OpenCode uses separate Zen/Go URLs and multiple API protocols.

This extension follows the same Pi provider pattern, using Pi's built-in `openai-completions` transport and `CLINE_API_KEY` resolution. It registers the last successful catalogs immediately, then refreshes them from Cline in the background. Successful refreshes are saved with `0600` permissions at `$PI_CODING_AGENT_DIR/cline/models.json` and `$PI_CODING_AGENT_DIR/cline-pass/models.json` (default: `~/.pi/agent/...`). A missing or corrupt cache falls back to the bundled model lists.

## Install and use

Create a key at [app.cline.bot → Settings → API Keys](https://app.cline.bot), then:

```sh
pi install /path/to/pi-cline
export CLINE_API_KEY="your-key"
pi
```

Alternatively, run `/login` and choose **Cline** or **ClinePass**; Pi stores the entered API key.

Select models with `/model`, or:

```sh
pi --provider cline --model <model-id>
pi --provider cline-pass --model cline-pass/glm-5.3
```

## Development

```sh
npm install
npm test
npm run typecheck
```

## Sources

- [Cline API overview](https://github.com/cline/cline/blob/main/docs/api/overview.mdx)
- [Cline API authentication](https://github.com/cline/cline/blob/main/docs/api/authentication.mdx)
- [ClinePass product and model list](https://github.com/cline/cline/blob/main/docs/getting-started/clinepass.mdx)
- [Cline recommended-provider catalog](https://github.com/cline/cline/blob/main/sdk/packages/llms/src/catalog/catalog-cline-recommended.ts)
