# pi-cline

Native [Pi](https://pi.dev) provider for ClinePass.

The extension registers only `cline-pass`, using Pi's built-in `openai-completions` transport and `CLINE_API_KEY` resolution. It loads the last successful catalog immediately, refreshes it from Cline without blocking startup, and caches successful refreshes with `0600` permissions at `$PI_CODING_AGENT_DIR/cline-pass/models.json` (default: `~/.pi/agent/cline-pass/models.json`). A missing or corrupt cache falls back to the bundled ClinePass model list.

## Install and use

**Upgrade note:** the `cline` provider was removed; use `cline-pass` instead.

Create a key at [app.cline.bot → Settings → API Keys](https://app.cline.bot), then:

```sh
pi install /path/to/pi-cline
export CLINE_API_KEY="your-key"
pi
```

Alternatively, run `/login` and choose **ClinePass**. Pi stores the entered API key.

Select models with `/model`, or:

```sh
pi --provider cline-pass --model cline-pass/glm-5.3
```

## Development

```sh
npm install
npm test
npm run typecheck
```

## Sources

- [Cline API authentication](https://github.com/cline/cline/blob/main/docs/api/authentication.mdx)
- [ClinePass product and model list](https://github.com/cline/cline/blob/main/docs/getting-started/clinepass.mdx)
- [Cline recommended-provider catalog](https://github.com/cline/cline/blob/main/sdk/packages/llms/src/catalog/catalog-cline-recommended.ts)
