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
| 根 | `opptrix` |
| client-ui | `opptrix-client` |
| apps/server | `@opptrix/server` |
| apps/desktop | `@opptrix/desktop` |
| packages/* | `@opptrix/<name>` |

内部包 scope 仍为 `@opptrix/*`，对外品牌为 **Opptrix**。

## 构建失败：`Cannot find type definition file for 'node'`

说明根目录 **未安装完整 devDependencies**（常见于刚 clone、只装了部分 workspace、或删过 `node_modules`）。

在仓库根目录执行：

```bash
npm install
# 或 CI / 干净环境：
npm ci
```

然后再运行 `npm run build` / `npm run build:packages`。`@types/node` 与 `typescript` 声明在根 `package.json` 的 `devDependencies` 中，必须由根目录安装。

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
| 新增数据源 | `packages/a-stock-layer/src/drivers/`（架构见 [DATA-LAYER.md](./DATA-LAYER.md)，进度见 [DATA-LAYER-PROGRESS.md](./DATA-LAYER-PROGRESS.md)） |
| 新增因子 | `packages/stock-eval/src/factors/` |
| 新页面 / 聊天 UI | `client-ui/src/chat/` 或 `client-ui/src/pages/` |

## LLM 配置

1. 启动 server 后打开 **设置** 页，或
2. 参考 [example/config/app-config.example.json](../example/config/app-config.example.json) 编辑 `apps/server/data/config.json`（旧路径，首次会迁移入库）：

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

对外暴露 **5173**（Web）；8711 仅本机内部，由 Vite 代理 `/api`。

## 测试与 CI

本地快速验证（与 GitHub Actions 一致）：

```bash
npm run build
npm run test:ci
```

日常开发可用 `npm run test`（会先 `build:packages`，再跑全部测试）。

| 脚本 | 说明 |
|------|------|
| `npm run test` | 编译 packages + 冒烟 / 集成测试 |
| `npm run test:ci` | 仅跑测试（CI 在 `build` 之后调用） |
| `npm run typecheck:ui` | 前端 TypeScript 检查（本地可选，暂未纳入 CI） |

测试目录 `tests/`：

- `smoke.test.mjs` — Agent 工具注册表、因子数量等静态检查
- `integration.test.mjs` — SQLite 用户库读写、启动 API 后 `/api/health` 与关注列表往返

集成测试使用临时目录作为 `OPPTRIX_DATA_DIR`，并在随机本地端口启动 server，不会污染本机 `~/.opptrix`。

`tests/package.test.mjs` 覆盖 `.opmd` 基础数据包导出/导入与校验。

CI 工作流见 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)：`push` / `pull_request` 到 `main` 时执行 `npm ci` → `npm run build` → `npm run test:ci`。

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

`~/.opptrix/portfolio.json`，删除该文件可清空账本（请先备份）。

## 从旧版迁移

| 旧版 | 现版 |
|------|------|
| Python `work/` | 已移除 |
| `research-cli` | 使用 `npm run dev` |
| Electron 桌面 | `npm run dev:desktop` / [DESKTOP.md](./DESKTOP.md) |
| `client-ui/package-lock.json` | 根 lockfile only |

**AI 协作者**：请先阅读 [AGENT-GUIDE.md](./AGENT-GUIDE.md) 与 [CONTRIBUTING.md](./CONTRIBUTING.md)。

GitHub 主仓库：**Opptrix**（`Travisun/Opptrix`）。

## 产品规划

- [右侧投研面板升级规划](./RIGHT-PANEL-RESEARCH-PLAN.md) — 关注/发现/行业/组合分期路线图；P0 决策雷达、P1 决策卡已落地。
