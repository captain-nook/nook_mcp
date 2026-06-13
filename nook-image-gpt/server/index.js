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
const API_URL = `${API_BASE}/v1/images/generations`;
const MODEL = "gpt-image-2";

const server = new Server(
  { name: "nook-image-gpt", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_image",
      description: `Generate images using ${MODEL} via the relay API. Supports 1K to 4K resolutions. Returns either base64 (default) or saves to a directory.`,
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Image generation prompt (describe what you want to generate)",
          },
          size: {
            type: "string",
            description: "Image resolution. Options: 1024x1024 (1K), 2048x2048 (2K), 2048x1152 (2K wide), 3840x2160 (4K wide), 2160x3840 (4K tall)",
            default: "1024x1024",
          },
          n: {
            type: "number",
            description: "Number of images to generate (default 1, max 10)",
            default: 1,
          },
          save_to_dir: {
            type: "string",
            description: "Directory to save images as PNG files. If not set, returns base64 data. Recommended for large images to avoid transport issues.",
          },
        },
        required: ["prompt"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "generate_image") {
    throw new Error(`Unknown tool: ${name}`);
  }

  const prompt = args?.prompt;
  const size = args?.size || "1024x1024";
  const n = Math.min(Math.max(args?.n || 1, 1), 10);
  const saveToDir = args?.save_to_dir;

  if (!prompt || typeof prompt !== "string") {
    throw new Error("prompt is required and must be a string");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size,
      n,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let detail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      detail = parsed.error?.message || parsed.error || errorText;
    } catch {}
    throw new Error(`Image API error (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const images = data.data;

  if (saveToDir) {
    const absDir = path.resolve(saveToDir);
    await fs.mkdir(absDir, { recursive: true });
    const savedFiles = [];
    for (let i = 0; i < images.length; i++) {
      const buffer = Buffer.from(images[i].b64_json, "base64");
      const filename = `nook_gpt_${Date.now()}_${i}.png`;
      const filepath = path.join(absDir, filename);
      await fs.writeFile(filepath, buffer);
      savedFiles.push(filepath);
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ saved_to: savedFiles }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          images: images.map((img) => ({
            b64_json: img.b64_json,
          })),
        }),
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
