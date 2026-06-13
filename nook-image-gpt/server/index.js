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
const EDITS_URL = `${API_BASE}/v1/images/edits`;

const server = new Server(
  { name: "nook-image-gpt", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_image",
      description: "Generate images using gpt-image-2 via the relay API. Supports text-to-image and image-to-image (single reference, generations endpoint). Supports 1K to 4K resolutions.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Image generation prompt or edit instruction" },
          image_path: { type: "string", description: "Path to a single source image (PNG/JPG/WEBP). For image-to-image." },
          image_paths: { type: "array", items: { type: "string" }, description: "Paths to multiple source images. Use this for multi-image references." },
          size: { type: "string", description: "Output resolution. Options: 1024x1024 (1K), 2048x2048 (2K), 2048x1152 (2K wide), 3840x2160 (4K wide), 2160x3840 (4K tall)", default: "1024x1024" },
          n: { type: "number", description: "Number of images to generate (default 1, max 10)", default: 1 },
          save_to_dir: { type: "string", description: "Directory to save images as PNG. If not set, returns base64." },
        },
        required: ["prompt"],
      },
    },
    {
      name: "edit_image",
      description: "Edit or transform one or more input images using gpt-image-2 via the relay API. Sends multipart image files to the image edits endpoint. Supports up to 16 reference images.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Edit instruction or image-to-image prompt" },
          image_path: { type: "string", description: "Path to a single source image (PNG/JPG/WEBP)" },
          image_paths: { type: "array", items: { type: "string" }, description: "Paths to one or more source images. Use this for multi-image references (up to 16)." },
          mask_path: { type: "string", description: "Optional PNG mask path for targeted edits. Transparent areas are edited." },
          size: { type: "string", description: "Output resolution. Options: 1024x1024 (1K), 2048x2048 (2K), 2048x1152 (2K wide), 3840x2160 (4K wide), 2160x3840 (4K tall)", default: "1024x1024" },
          n: { type: "number", description: "Number of images to generate (default 1, max 10)", default: 1 },
          save_to_dir: { type: "string", description: "Directory to save images as PNG. If not set, returns base64." },
        },
        required: ["prompt"],
      },
    },
  ],
}));

function resolveImages(imagePath, imagePaths) {
  const paths = [];
  if (imagePath) paths.push(imagePath);
  if (imagePaths && Array.isArray(imagePaths)) paths.push(...imagePaths);
  return [...new Set(paths.map((p) => path.resolve(p)))];
}

const MIME_MAP = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

async function callEdits(prompt, imagePaths, maskPath, size, n) {
  const form = new FormData();
  const resolved = resolveImages(imagePaths[0], imagePaths);
  for (const fp of resolved) {
    const ext = path.extname(fp).toLowerCase().replace(".", "");
    const mime = MIME_MAP[ext];
    if (!mime) throw new Error(`Unsupported image format: ${ext}`);
    const buf = await fs.readFile(fp);
    form.append("image", new Blob([buf], { type: mime }), `image.${ext}`);
  }
  if (maskPath) {
    const absMask = path.resolve(maskPath);
    const maskBuf = await fs.readFile(absMask);
    form.append("mask", new Blob([maskBuf], { type: "image/png" }), "mask.png");
  }
  form.append("prompt", prompt);
  form.append("model", "gpt-image-2");
  form.append("n", String(n));
  form.append("size", size);
  form.append("response_format", "b64_json");

  const response = await fetch(EDITS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try { const p = JSON.parse(text); detail = p.error?.message || p.error || text; } catch {}
    throw new Error(`Edits API error (${response.status}): ${detail}`);
  }
  return response.json();
}

async function callGenerations(prompt, imagePaths, size, n) {
  const resolved = resolveImages(imagePaths[0], imagePaths);
  const model = resolved.length > 0 ? "gpt-image-2-2k4k" : "gpt-image-2";
  const body = { model, prompt, size, n, response_format: "b64_json" };
  if (resolved.length > 0) {
    const fp = resolved[0];
    const ext = path.extname(fp).toLowerCase().replace(".", "");
    const mime = MIME_MAP[ext];
    if (!mime) throw new Error(`Unsupported image format: ${ext}`);
    const buf = await fs.readFile(fp);
    const b64 = buf.toString("base64");
    body.image = `data:${mime};base64,${b64}`;
    if (resolved.length > 1) {
      body.images = [];
      for (let i = 1; i < resolved.length; i++) {
        const ext2 = path.extname(resolved[i]).toLowerCase().replace(".", "");
        const mime2 = MIME_MAP[ext2];
        if (!mime2) throw new Error(`Unsupported image format: ${ext2}`);
        const buf2 = await fs.readFile(resolved[i]);
        body.images.push(`data:${mime2};base64,${buf2.toString("base64")}`);
      }
    }
  }
  const response = await fetch(GEN_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try { const p = JSON.parse(text); detail = p.error?.message || p.error || text; } catch {}
    throw new Error(`Generations API error (${response.status}): ${detail}`);
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
      { type: "text", text: JSON.stringify({ images: images.map((img) => ({ b64_json: img.b64_json })) }) },
    ],
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const prompt = args?.prompt;
  const imagePath = args?.image_path;
  const imagePaths = args?.image_paths;
  const maskPath = args?.mask_path;
  const size = args?.size || "1024x1024";
  const n = Math.min(Math.max(args?.n || 1, 1), 10);
  const saveToDir = args?.save_to_dir;

  if (!prompt || typeof prompt !== "string") throw new Error("prompt is required");

  const allPaths = resolveImages(imagePath, imagePaths);

  let data;
  if (name === "edit_image") {
    data = await callEdits(prompt, allPaths, maskPath, size, n);
  } else if (name === "generate_image") {
    data = await callGenerations(prompt, allPaths, size, n);
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }

  return formatOutput(data, saveToDir);
});

const transport = new StdioServerTransport();
await server.connect(transport);