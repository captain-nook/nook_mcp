# Agent Deployment Contract

This server is designed so any MCP-capable agent can deploy it from a GitHub link without knowing the user's IDE or CLI in advance.

When the user asks you to "one-click deploy" this repo:

1. Clone or download this repository.
2. `cd` into `nook-image-gpt/`.
3. Run the setup wizard:

   ```bash
   node setup.js
   ```

4. If the wizard asks for an API key and relay URL, ask the user for those values and enter them. Never invent a key.
5. The wizard installs dependencies, creates `.env`, and verifies the server.
6. Register this MCP server in your own MCP configuration as a local stdio server:
   - name: `nook-image-gpt`
   - command: `node`
   - args: absolute path to `server/index.js`
   - env: loaded from `server/.env` (or passed directly in config)
7. Do not put the user's API key in a public config file.
8. Restart or reload MCP servers in your host application.
9. Verify that the `generate_image` tool is visible.
