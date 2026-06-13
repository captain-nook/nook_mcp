# nook-image-gpt

GPT Image 2.0 生图 MCP 工具。通过中转站 API 生成图片，支持 1K~4K 分辨率。

## 前置条件

- Node.js >= 18
- 中转站 API Key（[用量查询页](https://sub.jarodfund.xyz/key-usage)）

## 安装

```bash
# 在 nook-image-gpt/ 目录下
node setup.js
```

`setup.js` 会引导填写 API Key、安装依赖、验证服务，并打印对应 agent 的配置模板。

## 手动配置

### opencode

```json
{
  "mcp": {
    "nook-image-gpt": {
      "type": "local",
      "command": ["node", "<绝对路径>/nook-image-gpt/server/index.js"],
      "enabled": true,
      "environment": {
        "IMAGE_API_KEY": "sk-你的API密钥"
      }
    }
  }
}
```

### Claude Code

```json
{
  "mcpServers": {
    "nook-image-gpt": {
      "command": "node",
      "args": ["<绝对路径>/nook-image-gpt/server/index.js"],
      "env": {
        "IMAGE_API_KEY": "sk-你的API密钥"
      }
    }
  }
}
```

## 自定义中转站

在 `environment` 中添加 `IMAGE_API_BASE`：

```json
"environment": {
  "IMAGE_API_KEY": "sk-你的API密钥",
  "IMAGE_API_BASE": "https://你的中转站地址"
}
```

## Tool: generate_image

| 参数 | 必填 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| prompt | 是 | string | — | 生图提示词 |
| size | 否 | string | `1024x1024` | 分辨率 |
| n | 否 | number | 1 | 生成数量（最大 10） |
| save_to_dir | 否 | string | — | 保存为 PNG 到该目录 |

**返回：** base64 或文件路径列表。

## 路由

| 场景 | 调用 |
|------|------|
| GPT Image 2.0 中转 | `generate_image` (model: `gpt-image-2`) |
