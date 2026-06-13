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
const MODEL_TXT = "gpt-image-2";
const MODEL_IMG = "gpt-image-2-2k4k";

const server = new Server(
  { name: "nook-image-gpt", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_image",
      description: `Generate images via relay. Text-to-image uses ${MODEL_TXT}. Image-to-image uses ${MODEL_IMG} (relay requires this variant). Supports 1K to 4K resolutions.`,
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Image generation prompt. For image-to-image, describe what to do with the reference image.",
          },
          image_path: {
            type: "string",
            description: "Local path to a reference image (PNG/JPG/JPEG/WEBP). If provided, uses image-to-image mode with ${MODEL_IMG}.",
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

function readImage(imagePath) {
  const absPath = path.resolve(imagePath);
  const ext = path.extname(absPath).toLowerCase().replace(".", "");
  const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
  const mime = mimeMap[ext];
  if (!mime) throw new Error(`Unsupported image format: ${ext}`);
  return { absPath, mime, ext };
}

async function callApi(prompt, size, n, model, imageDataUri) {
  const body = { model, prompt, size, n, response_format: "b64_json" };
  if (imageDataUri) body.image = imageDataUri;
  const response = await fetch(GEN_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
  const imagePath = args?.image_path;
  const size = args?.size || "1024x1024";
  const n = Math.min(Math.max(args?.n || 1, 1), 10);
  const saveToDir = args?.save_to_dir;

  if (!prompt || typeof prompt !== "string") throw new Error("prompt is required");

  let data;
  if (imagePath) {
    const { absPath, mime } = readImage(imagePath);
    const imgBuffer = await fs.readFile(absPath);
    const b64 = imgBuffer.toString("base64");
    const imageDataUri = `data:${mime};base64,${b64}`;
    data = await callApi(prompt, size, n, MODEL_IMG, imageDataUri);
  } else {
    data = await callApi(prompt, size, n, MODEL_TXT);
  }

  return formatOutput(data, saveToDir);
});

const transport = new StdioServerTransport();
await server.connect(transport);