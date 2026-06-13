# nook-image-gpt

MCP Server for GPT Image 2.0 generation. Exposes a single `generate_image` tool that any MCP-compatible agent (opencode, Claude Code, Cursor, Windsurf, etc.) can call.

## How it works

Calls `POST /v1/images/generations` on an OpenAI-compatible relay API, decodes the returned base64, and either returns it to the agent or saves as PNG to a local directory.

## Quick start

```bash
# 1. Install dependencies
cd server && npm install

# 2. Add to your agent's MCP config
#    See SKILL.md for opencode / Claude Code / Cursor examples
```

## Configuration

| Env variable | Required | Default | Description |
|---|---|---|---|
| `IMAGE_API_KEY` | Yes | — | Relay API key |
| `IMAGE_API_BASE` | No | `https://sub.jarodfund.xyz` | Custom relay base URL |

## Tool: `generate_image`

| Parameter | Required | Default | Description |
|---|---|---|---|
| `prompt` | Yes | — | Image description |
| `size` | No | `1024x1024` | Resolution (see references/size-reference.md) |
| `n` | No | 1 | Number of images (max 10) |
| `save_to_dir` | No | — | Save as PNG files to this directory |

## Related

- `SKILL.md` — Full documentation with per-agent config examples
- `references/size-reference.md` — Resolution presets table
- `server/` — MCP Server source code
