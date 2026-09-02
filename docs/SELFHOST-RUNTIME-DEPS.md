# 自托管运行时依赖矩阵（Docker / 服务器优先）

> **产品方向（2026）**：以 **Docker Compose 自托管 + Linux 服务器** 为唯一主路径；Electron 桌面打包进入**维护模式**，新功能与安全策略以容器镜像为准，不再为桌面 sidecar 捆绑大体积二进制做兼容设计。
>
> 版本 pin 单一来源：`scripts/lib/ci-pins.env`  
> 镜像定义：`Dockerfile` · 用户部署：`docs/SELF-HOSTING.md`  
> Vendor 契约：`@opptrix/system-update` `vendor-fuse`（ABI 钉死集 + **递归拷贝**进 slot；`scripts/lib/runtime-vendor.mjs` 为薄 re-export）

---

## 0. 双源依赖（底座 vendor + 热更 slot）— 零改业务 import

应用包均为 **ESM**。Node 的 `NODE_PATH` **不会**参与 `import 'better-sqlite3'` 解析。

### 融合规则（避免 vendor 隔离树与热更打架）

| 依赖类型 | 热更包 | 生命周期融合（`fuseVendorAbiIntoSlot` / `ensureVendorModuleLinks`） |
|----------|--------|----------------------------------------|
| **ABI 钉死**（原生） | CI/pack **禁止**携带；若误带 | **强制**从 vendor **拷贝**进 slot（替换实目录 / 旧 symlink；**不用 symlink**） |
| **嵌套** `packages/*/node_modules/<ABI>` | 旧包残留 | **scrub 删除**，解析上溯到 slot 根 vendor **拷贝** |
| **普通/新 JS 依赖** | 可打进 slot `node_modules` | **不动**（热更自带优先） |

### 接线点（不改业务代码）

融合发生在 **seed / extract / activate / rollback**（以及 `system-boot` 对 boot/pending 的防御性再拷贝）：

| 路径 | API / 入口 | 目标 slot |
|------|------------|-----------|
| 冷启动 seed | `seedCurrentSlot` | 新 current slot |
| 镜像升底座 | `stageSeedVersionAsPending` | pending slot（seed 或 reuse 后） |
| CDN / CLI / server 解压 | `extractUpdateArchive` | 解压后 **materialize 外链** → ABI fuse → pending slot |
| 热激活 | `activatePending` | 新 current slot |
| 回滚 | `rollbackToBackup` | backup → current slot |
| entrypoint / supervisor | `system-boot ensure` / `activate-pending` | boot（+ pending 可选）；`needsBaseRefresh` 跳过激活时仍 fuse **current** boot |

1. `docker-entrypoint` 导出 `OPPTRIX_VENDOR_NODE_MODULES`（默认 `/opt/opptrix/vendor/node_modules`）
2. Vendor 缺失（裸 Node / 非 Docker）时 **软跳过**（不抛错，返回 `missingInVendor`）
3. 热更新解压出**新 slot** → extract 已融合 → `activate` **再次融合**（按表重建 ABI **拷贝**；保留热更自带的非 ABI 包）

测试见 `tests/runtime-vendor-resolve.test.mjs`、`tests/vendor-fuse-lifecycle.test.mjs`、`tests/materialize-vendor.test.mjs`、`tests/materialize-external-symlinks.test.mjs`。

镜像构建：`scripts/materialize-vendor.mjs` 把 ABI 从 `/app` 挪到 vendor；随后 `fuseVendorAbiIntoSlot('/app')` 再把 ABI 实拷回 `/app/node_modules`。  
Seed：`copySeedTree` 在 `cpSync` 后对外部 workspace 符号链接做 `materializeExternalSymlinks`，再 fuse slot。  
热更解压：`extractUpdateArchive` 在 fuse 前同样 `materializeExternalSymlinks`（防绝对链指回 `/app`）。  
启动：`bootstrap-cdn-runtime.mjs`（可关 `OPPTRIX_BOOT_CDN_CHECK=0`）→ extract/seed → `system-boot ensure/activate` → vendor 融合。  
发版 pack：CI 先 materialize 再 `--assert-no-abi`。

---

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **OS 层交付通用二进制** | ffmpeg、Python、系统工具链由 Debian bookworm **apt** 提供，走发行版安全更新 |
| **npm 层只保留 Node 原生绑定** | better-sqlite3、duckdb、sharp 等必须在 **build stage** 针对 glibc + Node 24 编译，随应用树 COPY 进 runtime |
| **模型与浏览器按需、可持久化** | 大模型走卷 `/opptrix/models`；Playwright Chromium 首用下载或显式预装，**不进镜像默认层** |
| **禁止重复打包** | 镜像构建后剔除 `ffmpeg-static` 等已被 OS 替代的 npm 静态包 |
| **显式 env 优先** | `FFMPEG_PATH`、`OPPTRIX_PYTHON_PATH` 等由 Dockerfile / Compose 注入，代码不假设桌面 `runtime-stage` 布局 |

---

## 2. 依赖分层总览

```
┌─────────────────────────────────────────────────────────────┐
│  Debian bookworm-slim（runtime stage · apt）                 │
│  ffmpeg · python3 · pip · git · build-essential · tini      │
│  Node 24.x（官方 node 镜像）· 可选 nvm Node 22                 │
└────────────────────────────┬────────────────────────────────┘
                             │ FFMPEG_PATH / PATH python3
┌────────────────────────────▼────────────────────────────────┐
│  /app（immutable seed · npm prune --omit=dev）               │
│  原生 .node：better-sqlite3 · duckdb · sharp · onnxruntime   │
│            @lancedb/lancedb · node-llama-cpp（optional）      │
└────────────────────────────┬────────────────────────────────┘
                             │ 卷 / onboarding
┌────────────────────────────▼────────────────────────────────┐
│  /opptrix/models（持久卷）                                     │
│  SenseVoice · E5 · RapidOCR · HY-MT gguf 等                  │
└────────────────────────────┬────────────────────────────────┘
                             │ 首用或 PLAYWRIGHT_BROWSERS_PATH
┌────────────────────────────▼────────────────────────────────┐
│  Playwright Chromium（默认不在镜像内）                        │
│  `playwright install chromium` → 用户数据或 Agent 工作区       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 硬依赖 vs 可抽离依赖

### 3.1 已抽离到 Docker 底层（OS / 镜像 ENV）

| 能力 | 原捆绑方式（桌面 legacy） | 自托管现状 | 硬依赖代码路径 |
|------|---------------------------|------------|----------------|
| **ffmpeg（语音/媒体解码）** | npm `ffmpeg-static` + `stage-runtime` | `apt install ffmpeg` + `FFMPEG_PATH=/usr/bin/ffmpeg`；构建后 `rm node_modules/ffmpeg-static` | `@opptrix/local-inference` → `ffmpeg-runtime.ts`；`/api/speech/*`、新闻 enrichment 转写 |
| **Python（Agent 脚本 / MCP）** | Miniconda 打进 `resources/python` | `apt python3` + `python3-dev`；`resolvePythonRuntime()` 在 `OPPTRIX_DOCKER=1` 时**仅**走系统 Python | `@opptrix/agent-workspace` → `resolve-python.ts`；`builtin-python` MCP；shell 工具 |
| **Node 运行时** | Electron 内嵌 + sidecar | 官方 `node:24.11.1-bookworm-slim`；可选 `/opt/nvm` Node 22 | 全栈；热更新经 `OPPTRIX_SYSTEM_DIR` |

**受影响但非「硬失败」**：上述三项在 Docker 中若缺失，对应能力降级（语音 `ffmpegReady=false`、Python `ready=false`、Node 由镜像保证）。

### 3.2 必须留在 npm 构建树（Node 原生 · 硬依赖）

在 **Docker build stage** 编译，**不能**改为 apt 包（无稳定 Debian 替代品或与 Electron ABI 无关）：

| 包 | 用途 | 消费方 | 缺失后果 |
|----|------|--------|----------|
| **better-sqlite3** | 用户库 / 会话 / 配置 SQLite | `user-store`、`market-data`、`doc-library` | **启动失败** |
| **duckdb** | 行情衍生 / 分析 | `market-data` | 相关查询失败 |
| **sharp** | 图像预处理 | `doc-library`、transformers 链 | RAG / OCR 管线失败 |
| **onnxruntime-node** | 向量 / 推理 | `doc-library`（经 @lancedb / embedding） | 语义检索降级 FTS |
| **@lancedb/lancedb** | 向量索引 | `doc-library` | Hybrid RAG 降级 |
| **node-llama-cpp** | 本地 GGUF（HY-MT 等） | `local-inference`、server optional | 离线翻译不可用，在线 LLM 仍可用 |
| **@gutenye/ocr-node** | RapidOCR | `doc-library` optional | OCR 降级 |

> Dockerfile 注释已列出 build stage 需针对 **linux glibc Node 24** 编译的模块；runtime 保留 `build-essential` 是为 Agent 偶发 `npm install` 原生模块，**不是**为替代上述预编译树。

### 3.3 大体积数据（卷 / onboarding · 硬依赖业务、非镜像）

| 资产 | 体积级 | 交付 |
|------|--------|------|
| SenseVoice q8 + VAD | ~数百 MB | `/opptrix/models/sensevoice` |
| multilingual-e5-small | ~100MB+ | `/opptrix/models/llms/multilingual-e5-small` |
| RapidOCR mobile | ~10MB+ | `/opptrix/models/llms/rapidocr-ppocrv4-mobile` |
| HY-MT GGUF | ~1GB+ | `/opptrix/models/llms/*.gguf` |

镜像 **故意 model-free**；`GET /api/health` 的 `core_models_*` 反映卷内就绪状态。

### 3.4 下一批可抽离候选（尚未默认进镜像）

| 能力 | 当前 | 抽离方向 | 影响面 |
|------|------|----------|--------|
| **Playwright Chromium** | 桌面 `runtime-stage/playwright-browsers` | **`/opt/opptrix/playwright-browsers`**（`playwright install-deps` + `install chromium`） | `@opptrix/agent-browser`、网页预览导出、Agent 浏览器工具 |
| **node-llama-cpp** | npm optional | **build stage 硬依赖**（`cmake` + `libgomp`） | 离线 GGUF 翻译（HY-MT） |
| **ffmpeg-static（开发机）** | 已 optional / 可移除 | 开发机 `brew/apt install ffmpeg` 或 `FFMPEG_PATH` | 仅本地非 Docker 开发 |

### 3.5 已移除（Electron 桌面）

`apps/desktop` 整包已删除：Electron、electron-builder、sidecar staging、Miniconda 打包、桌面自动更新等逻辑不再维护。

---

## 4. 环境变量（安全与可复现）

| 变量 | 默认值（镜像） | 说明 |
|------|----------------|------|
| `FFMPEG_PATH` | `/usr/bin/ffmpeg` | 语音/媒体解码唯一推荐入口 |
| `OPPTRIX_PYTHON_PATH` | （未设，走 `python3`） | 可 pin 到 `/usr/bin/python3` |
| `OPPTRIX_DOCKER` | `1` | 启用 Docker 专用 Python/ffmpeg 解析分支 |
| `OPPTRIX_NODE_PATCH_VERSION` | 见 `ci-pins.env` | CI 与镜像 build-arg 对齐 |
| `PLAYWRIGHT_BROWSERS_PATH` | 未设 | 浏览器二进制持久化目录（可选） |
| `OPPTRIX_SKIP_PLAYWRIGHT_BROWSER` | 未设 | `=1` 禁用自动下载 Chromium |

---

## 5. 开发与 CI 门禁

| 场景 | 命令 / 工作流 |
|------|----------------|
| 本地服务器开发 | `docker compose up` 或 `npm run dev` + 系统 ffmpeg/python |
| 自托管发版预检 | `npm run audit:selfhost-release` |
| CI | `.github/workflows/ci-selfhost-release.yml`（runtime pack + Docker smoke + ffmpeg 断言 + lifecycle smoke） |
| 主 CI | `ci.yml` — packages + client-ui + test（**不含** desktop pack / 模型 staging） |

### Lifecycle smoke（启动 / 热更 / 底座）

对**已构建**镜像跑一轮：命名卷启动 → 同卷热槽激活 → `needsBaseRefresh` 跳过 → 提高 `OPPTRIX_BASE_VERSION` 重建后激活；私有数据 marker 须保留。脚本**不**在内部 `docker build`。

```bash
# 本地（先有镜像 tag）
docker build -t opptrix:local-smoke .
node scripts/smoke-selfhost-lifecycle.mjs
# 或：OPPTRIX_LIFECYCLE_IMAGE=opptrix:ci-smoke node scripts/smoke-selfhost-lifecycle.mjs

# 无镜像时跳过（本地单测）
OPPTRIX_LIFECYCLE_SKIP_IF_NO_IMAGE=1 node scripts/smoke-selfhost-lifecycle.mjs

# 纯 helper 单测（不依赖 Docker）
node --test tests/selfhost-lifecycle-smoke.test.mjs
```

CI：`docker-build-smoke` 在 Smoke inspect 之后对 `opptrix:ci-smoke` 调用同一脚本。

GitHub CI 构建基础镜像走官方 Docker Hub（`NODE_IMAGE_PREFIX=` 空）；国内本机构建默认 `NODE_IMAGE_PREFIX=docker.1ms.run/library/`（见 `packages/selfhost/src/mirrors.mjs`）。国内 `npm ci` 默认华为云 npm；候选列表见 `CN_NPM_REGISTRY_CANDIDATES`（不可达回退官方）。已实测不可用：`npm.aliyun.com`（DNS）、`mirrors.163.com/npm`（404）。

**不再要求**：`audit:desktop-pack`、Electron 签名、三端 desktop 产物通过，方可合并服务器相关 PR。

---

## 6. 相关文档

- [SELF-HOSTING.md](./SELF-HOSTING.md) — 用户部署
- [SYSTEM-UPDATE.md](./SYSTEM-UPDATE.md) — 热更新
- [API.md](./API.md) — `core_models_*`、speech、Python 状态 API
- [AGENTS.md](../AGENTS.md) — Agent 工程规则（服务器优先）
