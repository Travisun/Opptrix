# 开发指南

## 环境

- **Node.js** ≥ 20
- **npm** workspaces（根目录单一 `package-lock.json`）
- 推荐 macOS / Linux；Windows 需 WSL 或原生 Node

本项目为 **纯 Web 应用**，不包含 Electron 桌面打包流程。若曾使用 Electron 版，请改用浏览器 + `npm run dev` / `npm start`。

## 仓库结构

```bash
npm install          # 根目录，安装全部 workspace
npm run build        # packages + client-ui
npm run clean        # 删除各包 dist 与 client-ui/dist
```

### Workspace 包名

| 路径 | npm name |
|------|----------|
| 根 | `inno-a-stock` |
| client-ui | `inno-a-stock-client` |
| apps/server | `@ni-k/server` |
| packages/* | `@ni-k/<name>` |

内部包 scope 仍为 `@ni-k/*`，对外品牌为 **innoAStock**。

## 日常开发

**终端 A — API（含 watch 重建 server）**

```bash
npm run dev
```

**终端 B — 前端热更新**

```bash
npm run dev:web
```

浏览器打开 http://127.0.0.1:5173 。修改 `packages/*` 后需重新编译对应包（server 的 dev 脚本会 build server，但不会自动 rebuild 所有 packages — 改 package 源码时运行 `npm run build:packages` 或单包 `npm run build -w @ni-k/a-stock-layer`）。

## 修改代码的常见位置

| 目标 | 文件 |
|------|------|
| 新增 Hub feature | `packages/research-hub/src/hub.ts` |
| 新增 REST | `apps/server/src/index.ts` |
| 新增 Agent tool | `packages/agent/src/tools.ts` |
| 新增数据源 | `packages/a-stock-layer/src/drivers/` |
| 新增因子 | `packages/stock-eval/src/factors/` |
| 新页面 | `client-ui/src/pages/` + `App.tsx` nav |

## LLM 配置

1. 启动 server 后打开 **设置** 页，或
2. 直接编辑 `apps/server/data/config.json`：

```json
{
  "llm": {
    "provider": "DeepSeek",
    "model": "deepseek-chat",
    "api_key": "sk-...",
    "base_url": "https://api.deepseek.com"
  },
  "default_scorecard": "综合评估",
  "default_top_n": 20
}
```

未配置 API Key 时，除 Agent 外的投研功能仍可正常使用。

## 生产部署

```bash
npm run build
STOCK_RESEARCH_PORT=8711 npm start
```

访问 `http://<host>:8711/` 。仅需暴露单一端口；静态资源与 API 同源，无 CORS 配置。

## 调试技巧

- **健康检查**：`curl http://127.0.0.1:8711/api/health`
- **单次诊断**：`curl -X POST http://127.0.0.1:8711/api/research -H 'Content-Type: application/json' -d '{"feature":"stock_diagnosis","params":{"code":"600519"}}'`
- **Fastify 日志**：server 启动时 `logger: true`，请求会在终端输出

## 常见问题

### API 未连接（前端状态栏）

确认 `npm run dev` 已在 8711 端口运行；若只开了 `dev:web`，需同时启动 API。

### 修改 package 后 API 行为未变

运行 `npm run build:packages` 并重启 server。

### TDX / 东财限流

数据层有自动 driver 回退；频繁请求可能触发源站限流，稍后重试或换标的测试。

### 交易账本位置

`~/.a_stock_layer/portfolio.json`，删除该文件可清空账本（请先备份）。

## 从旧版迁移

| 旧版 | 现版 |
|------|------|
| Python `work/` | 已移除 |
| `research-cli` | 使用 `npm run dev` |
| Electron 桌面 | 浏览器 Web |
| `client-ui/package-lock.json` | 根 lockfile only |

GitHub 主仓库：**innoAStock**（`Travisun/innoAStock`）。
