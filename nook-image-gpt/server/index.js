#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";

const API_KEY = process.env.IMAGE_API_KEY;
if (!API_KEY) {
  console.error("IMAGE_API_KEY environment variable is required");
  process.exit(1);
}

const API_BASE = process.env.IMAGE_API_BASE || "https://sub.jarodfund.xyz";
const GEN_URL = `${API_BASE}/v1/images/generations`;
const MODEL = "gpt-image-2";

const server = new Server(
  { name: "nook-image-gpt", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_image",
      description: `Generate images using ${MODEL} via the relay API. Supports 1K to 4K resolutions.`,
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Text description of the image to generate.",
          },
          size: {
            type: "string",
            description: "Image resolution: 1024x1024 (1K), 2048x2048 (2K), 2048x1152 (2K wide), 3840x2160 (4K wide), 2160x3840 (4K tall)",
            default: "1024x1024",
          },
          n: {
            type: "number",
            description: "Number of images (default 1, max 10)",
            default: 1,
          },
          save_to_dir: {
            type: "string",
            description: "Directory to save PNG images. If unset, returns base64.",
          },
        },
        required: ["prompt"],
      },
    },
  ],
}));

async function callApi(prompt, size, n) {
  const response = await fetch(GEN_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, size, n, response_format: "b64_json" }),
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try { const p = JSON.parse(text); detail = p.error?.message || p.error || text; } catch {}
    throw new Error(`API error (${response.status}): ${detail}`);
  }
  return response.json();
}

function formatOutput(data, saveToDir) {
  const images = data.data;
  if (saveToDir) {
    const absDir = path.resolve(saveToDir);
    return fs.mkdir(absDir, { recursive: true }).then(async () => {
      const saved = [];
      for (let i = 0; i < images.length; i++) {
        const buf = Buffer.from(images[i].b64_json, "base64");
        const fp = path.join(absDir, `nook_gpt_${Date.now()}_${i}.png`);
        await fs.writeFile(fp, buf);
        saved.push(fp);
      }
      return { content: [{ type: "text", text: JSON.stringify({ saved_to: saved }) }] };
    });
  }
  return {
    content: [
      { type: "text", text: JSON.stringify({ images: images.map(i => ({ b64_json: i.b64_json })) }) },
    ],
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name !== "generate_image") throw new Error(`Unknown tool: ${name}`);

  const prompt = args?.prompt;
  const size = args?.size || "1024x1024";
  const n = Math.min(Math.max(args?.n || 1, 1), 10);
  const saveToDir = args?.save_to_dir;

  if (!prompt || typeof prompt !== "string") throw new Error("prompt is required");

  const data = await callApi(prompt, size, n);
  return formatOutput(data, saveToDir);
});

const transport = new StdioServerTransport();
await server.connect(transport);
