# 开发指南

> 文档索引：[docs/README.md](./README.md) · 架构：[ARCHITECTURE.md](./ARCHITECTURE.md) · AI 协作：[AGENT-GUIDE.md](./AGENT-GUIDE.md)

## 环境

- **Node.js** ≥ 20
- **npm** workspaces（根目录单一 `package-lock.json`，**仅在根目录** `npm install` / `npm ci`）
- 推荐 macOS / Linux；Windows 可用 WSL 或原生 Node

支持 **Web**（`npm run dev`）与 **Electron 桌面**（`npm run dev:desktop`），共用 `client-ui` 与 `apps/server`。

## 仓库结构

```bash
npm install          # 根目录
npm run build        # packages + client-ui
npm run clean        # 清理各包 dist
```

### Workspace 包名

| 路径 | npm name |
|------|----------|
| 根 | `opptrix` |
| client-ui | `opptrix-client` |
| apps/server | `@opptrix/server` |
| apps/desktop | `@opptrix/desktop` |
| packages/* | `@opptrix/<name>` |

对外品牌 **Opptrix**；内部 scope `@opptrix/*`。

### 主要 packages（2026）

| 包 | 职责 |
|----|------|
| `shared` | InstrumentRef、市场注册表、类型 |
| `a-stock-layer` | MarketDataEngine、Provider、TDX |
| `market-data-core` / `market-data-store` | 本地库抽象与 SQLite |
| `market-data-providers-*` | 区域 Provider 实现 |
| `provider-sdk` | Provider 开发辅助 |
| `stock-eval` / `institutions` / `t-strategy` / `skills` | 评估、机构、策略、报告 |
| `research-hub` / `search-hub` | Hub 调度与搜索 |
| `news-feed` / `article-enrichment` | 新闻 RSS 与文章 |
| `local-inference` | 桌面本地翻译/推理 |
| `user-store` | 用户 SQLite 持久化 |
| `agent` | LLM + MCP 工具 |

完整列表见 [packages/README.md](../packages/README.md)。

## 构建失败：`Cannot find type definition file for 'node'`

根目录未装全 devDependencies 时会出现。执行：

```bash
npm install   # 或 npm ci
npm run build
```

## 日常开发

```bash
npm run dev              # API + Vite → http://127.0.0.1:5173
npm run dev:api          # 仅 API :8711
npm run dev:web          # 仅 Vite（需另开 dev:api）
npm run dev:desktop      # Electron + HMR
```

修改 `packages/*` 后需 `npm run build:packages` 并重启 API（`dev:api` 会 rebuild server；改其他包时需手动 build）。

## 修改代码的常见位置

| 目标 | 文件 |
|------|------|
| 新增 Hub feature | `packages/research-hub/src/hub.ts` |
| 新增 REST | `apps/server/src/index.ts`（或 routes 模块） |
| 新增 Agent tool | `packages/agent/src/tools.ts` |
| 新增/改 Provider | `packages/a-stock-layer/src/providers/`（见 [DATA-LAYER.md](./DATA-LAYER.md)） |
| 标准数据能力 | `packages/a-stock-layer/src/core/instrument-query.ts` |
| 新增因子 | `packages/stock-eval/src/factors/` |
| 聊天 / 新闻 / 设置 UI | `client-ui/src/chat/`、`pages/` |
| 桌面主进程 | `apps/desktop/electron/` |

## LLM 配置

1. 启动后打开 **设置 → 模型与 API**，或  
2. 参考 [example/config/app-config.example.json](../example/config/app-config.example.json)

未配置 API Key 时，除 Agent 对话外的投研功能（右侧面板、Hub API 等）仍可使用。

## 生产部署（Web 自托管）

```bash
npm run build
npm run serve          # API :8711 + preview :5173
```

对外暴露 **5173**；8711 建议仅本机，由 Vite 代理 `/api`。生产环境请自行配置 HTTPS、防火墙与密钥管理。

## 桌面打包

```bash
npm run build:desktop  # 本地 Electron 发行包
```

发布流程见 [DESKTOP-RELEASE.md](./DESKTOP-RELEASE.md)。

## 测试与 CI

```bash
npm run build
npm run test:ci
```

| 脚本 | 说明 |
|------|------|
| `npm run test` | 编译 packages + 测试 |
| `npm run test:ci` | 仅测试（CI 在 build 后） |
| `npm run typecheck:ui` | 前端 TS 检查（本地可选） |

测试目录 `tests/`：`smoke.test.mjs`、`integration.test.mjs`、`package.test.mjs` 等。集成测试使用临时 `OPPTRIX_DATA_DIR`，不污染本机数据。

CI：[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — `push`/`PR` → `main` 时 `npm ci` → `build` → `test:ci`。

## 调试技巧

```bash
curl http://127.0.0.1:8711/api/health

curl -X POST http://127.0.0.1:8711/api/research \
  -H 'Content-Type: application/json' \
  -d '{"feature":"stock_diagnosis","params":{"code":"600519"}}'
```

桌面开发可选：`ELECTRON_OPEN_DEVTOOLS=1 npm run dev:desktop`

## 常见问题

### API 未连接

确认 `npm run dev` 已运行（同时启动 API 与 Vite），不要只开 Vite。

### 修改 package 后行为未变

`npm run build:packages` 并重启 server。

### 数据源限流

Engine 会自动 Provider 回退；稍后重试或换标的。

### 用户数据位置

默认 `~/.opptrix/`；试用示例可用 `OPPTRIX_DATA_DIR=./example/runtime-local`（见 [example/README.md](../example/README.md)）。

### 桌面 macOS「已损坏」

未签名包常见；`xattr -cr /Applications/Opptrix.app` 或右键打开。见 [DESKTOP-RELEASE.md](./DESKTOP-RELEASE.md)。

## 从旧版迁移

| 旧版 | 现版 |
|------|------|
| Python `work/` | 已移除 |
| `research-cli` | `npm run dev` |
| 仅 JSON 配置 | 主存储 `opptrix.db`，旧 JSON 首次启动迁移 |
| 根目录多 lockfile | 仅根 `package-lock.json` |

**AI 协作者**：[AGENT-GUIDE.md](./AGENT-GUIDE.md) · [CONTRIBUTING.md](./CONTRIBUTING.md)

GitHub：**[Travisun/Opptrix](https://github.com/Travisun/Opptrix)**
