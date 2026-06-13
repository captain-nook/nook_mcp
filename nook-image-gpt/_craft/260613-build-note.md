# nook-image-gpt build note

Date: 2026-06-13

## Decisions

1. Naming: `nook-image-gpt` (domain-provider pattern), allowing future `nook-image-google`, `nook-image-z` etc.
2. Architecture: MCP Server (`server/`) + SKILL.md wrapper
3. Location: `nook-skills/skills/nook-image-gpt/`, not a separate `mcp/` directory
4. Auth: Injected via MCP config `env.IMAGE_API_KEY`, not hardcoded
5. Distribution: Local via `npm install` in `server/`, future npm package if needed

## TODO

- [ ] Test MCP Server startup and API call
- [ ] Write tests
- [ ] Publish as npm package (optional)
