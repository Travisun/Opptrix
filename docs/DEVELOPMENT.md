# 开发指南

## 环境

- **Node.js** ≥ 20
- **npm** workspaces（根目录单一 `package-lock.json`）
- 推荐 macOS / Linux；Windows 需 WSL 或原生 Node

本项目支持 **Web**（浏览器 + `npm run dev`）与 **Electron 桌面**（`npm run dev:desktop`）。二者共用 `client-ui` 与 `apps/server` API。桌面打包见 [DESKTOP.md](./DESKTOP.md)。

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
| apps/server | `@inno-a-stock/server` |
| apps/desktop | `@inno-a-stock/desktop` |
| packages/* | `@inno-a-stock/<name>` |

内部包 scope 仍为 `@inno-a-stock/*`，对外品牌为 **innoAStock**。

## 日常开发

一条命令同时启动 API 后台与 Vite 前端：

```bash
npm run dev
```

浏览器打开 **http://127.0.0.1:5173** 即可。`:8711` 为 API 内部端口，由 Vite 代理 `/api`，**无需在浏览器中访问**。

单独调试 API：`npm run dev:api`  
单独调试前端：`npm run dev:web`（需另开终端运行 `dev:api`）  
桌面开发（Electron）：`npm run dev:desktop`

修改 `packages/*` 后需重新编译对应包（server 的 dev 会 rebuild server；改其他 package 时运行 `npm run build:packages`）。

## 修改代码的常见位置

| 目标 | 文件 |
|------|------|
| 新增 Hub feature | `packages/research-hub/src/hub.ts` |
| 新增 REST | `apps/server/src/index.ts` |
| 新增 Agent tool | `packages/agent/src/tools.ts` |
| 新增数据源 | `packages/a-stock-layer/src/drivers/` |
| 新增因子 | `packages/stock-eval/src/factors/` |
| 新页面 / 聊天 UI | `client-ui/src/chat/` 或 `client-ui/src/pages/` |

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
npm run serve          # API :8711 + Vite preview :5173
```

对外暴露 **5173**（Web）；8711 仅容器/本机内部。Docker：`docker compose up` → http://localhost:5173

## 调试技巧

- **健康检查**：`curl http://127.0.0.1:8711/api/health`
- **单次诊断**：`curl -X POST http://127.0.0.1:8711/api/research -H 'Content-Type: application/json' -d '{"feature":"stock_diagnosis","params":{"code":"600519"}}'`
- **Fastify 日志**：server 启动时 `logger: true`，请求会在终端输出

## 常见问题

### API 未连接（前端状态栏）

确认根目录 `npm run dev` 已运行（会同时启动 API 与 Vite）。不要只开 Vite 而不开 API。

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
| Electron 桌面 | `npm run dev:desktop` / [DESKTOP.md](./DESKTOP.md) |
| `client-ui/package-lock.json` | 根 lockfile only |

**AI 协作者**：请先阅读 [AGENT-GUIDE.md](./AGENT-GUIDE.md) 与 [CONTRIBUTING.md](./CONTRIBUTING.md)。

GitHub 主仓库：**innoAStock**（`Travisun/innoAStock`）。

## 产品规划

- [右侧投研面板升级规划](./RIGHT-PANEL-RESEARCH-PLAN.md) — 关注/发现/行业/组合分期路线图；P0 决策雷达、P1 决策卡已落地。
