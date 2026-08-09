# 桌面端「新版本升级准备」指引

面向维护者与 Agent：在打 `desktop-v*` 标签**之前**，对「相对上一正式桌面标签的增量」做可勾选、可命令验证的兼容性与打包深化检查。

**与 [`DESKTOP-RELEASE.md`](./DESKTOP-RELEASE.md) 的关系（硬性）**

| 文档 | 角色 |
|------|------|
| **本文** | 发版前的**兼容性 / 打包 / 用户数据 / 更新链**深化检查（Phase C 的操作细化 + 打包编排自检） |
| **`DESKTOP-RELEASE.md` + `desktop-release.mdc`** | **真正发版流程**：Phase A–D → bump → 更新日志 → 打标签 → CI / R2 |

完成本指引后，**仍须**按 `DESKTOP-RELEASE.md` §4.1 与 Phase A–D 走完发版；**禁止**只完成本文就打标签。

**硬性红线**

- ❌ **未 bump** `apps/desktop/package.json` 的 `version` → **不得**打新的 `desktop-v*` 标签
- ❌ 标签名 `desktop-v{version}` 必须与 `version` **完全一致**
- ❌ 禁止在文档或仓库写入签名证书、P12、Token 等 secrets

配套：[`DESKTOP.md`](./DESKTOP.md)、[`.cursor/rules/desktop-release.mdc`](../.cursor/rules/desktop-release.mdc)、[`.cursor/rules/backward-compatibility.mdc`](../.cursor/rules/backward-compatibility.mdc)、[`docs/releases/README.md`](./releases/README.md)。

---

## 0. 使用时机

在以下任一情况运行本清单：

1. 准备从上一 `desktop-v*` 发下一正式版（含 `-dev.N` 预发布）
2. 自上一标签以来含：**托盘 / 计划任务、Hybrid RAG、chat、Skills、原生模块、extraResources、schema、更新源** 等改动
3. Agent 被要求「升级准备 / 发版前兼容检查」但尚未进入打标签确认

当前仓库参考基线（会随发版推进；每次以命令实测为准）：

- 上一正式标签示例：`desktop-v1.2.6`
- 自该标签起常见未发版面：托盘常驻、RAG / doc-library、chat、Skills 等
- 发版前须确认：`market-data` / `user-store` 是否有 schema 变更；门禁须覆盖 **tray 资源** 与 **RAG 原生/资源冒烟**

---

## 1. 范围确认（相对上一 `desktop-v*`）

### 1.1 定位基线与增量

```bash
# 当前桌面版本真源
node -p "require('./apps/desktop/package.json').version"

# 最近桌面标签
git tag -l 'desktop-v*' --sort=-v:refname | head -10

# 相对上一标签的文件变更（将 PREV 换成上一标签，如 desktop-v1.2.6）
PREV=$(git tag -l 'desktop-v*' --sort=-v:refname | head -1)
git diff --stat "${PREV}..HEAD"
git log --oneline "${PREV}..HEAD" | head -40
```

### 1.2 范围勾选

- [ ] 已记录 `PREV` = 上一 `desktop-v*`，且了解 `PREV..HEAD` 主要目录
- [ ] 已标注是否触及：`apps/desktop/**`、`apps/server/**`、`client-ui/**`、`packages/market-data/**`、`packages/user-store/**`、`packages/doc-library/**`、`packages/agent/**`、RAG/引擎脚本、CI `release-desktop.yml`
- [ ] 若仅文档/规则变更、无产品二进制影响 → 可缩短后文检查，但仍须遵循「未 bump 不打新标签」
- [ ] 若含用户可见能力 → 必须走完整 Phase B（更新日志 + onboarding），见 §6

### 1.3 建议分类（便于填交付模板）

| 类别 | 典型路径 | 本指引重点章节 |
|------|----------|----------------|
| 打包 / 主进程 | `apps/desktop/electron/**`、`scripts/*` | §2、§3、§7 |
| Sidecar / API | `apps/server/**`、`runtime-stage` | §2、§3 |
| UI | `client-ui/**` | §6、§7（`check:ui`） |
| 行情库 | `packages/market-data/**` | §4 |
| 用户库 | `packages/user-store/**` | §4 |
| 文档库 / RAG | `packages/doc-library/**`、`resources/llms`、`resources/engines` | §2、§3、§4 |
| 更新链 | updater、`app-update.yml`、R2、签名 | §5 |

---

## 2. 打包编排

对照 `apps/desktop/package.json` → `build`（`files` / `extraResources` / `asarUnpack`）与 `prebuild` 流水线。

### 2.1 图标与托盘

- [ ] 源资源在仓库 `icons/tray/`（mac `trayTemplate*.png`；Win/Linux `tray-color*.png`）
- [ ] 已跑或确认 CI/`prebuild` 会执行 `prepare-icons`：

```bash
node apps/desktop/scripts/prepare-icons.mjs
# 期望：apps/desktop/build/icons/tray/ 含 mac Template、Linux PNG、tray.ico
test -f apps/desktop/build/icons/tray/trayTemplate.png
test -f apps/desktop/build/icons/tray/trayTemplate@2x.png
test -f apps/desktop/build/icons/tray/tray.ico
test -f apps/desktop/build/icons/tray/tray-color.png
test -f apps/desktop/build/icons/tray/tray-color@2x.png
```

- [ ] `build.files` 含 `build/icons/**/*`（托盘进 asar/包体；运行时见 `tray.cjs` → `build/icons/tray`）
- [ ] `audit:desktop-pack` 会断言 `build/icons/tray/` 关键 mac/win/linux tray 文件（缺失即失败）
- [ ] 生产包关窗进托盘行为已在目标平台冒烟计划中（见 [`DESKTOP.md`](./DESKTOP.md)「关窗 = 托盘常驻」）

### 2.2 `extraResources`

当前约定（审计脚本会校验映射名）：

| from | to | 用途 |
|------|-----|------|
| `runtime-stage` | （runtime） | Sidecar + 原生依赖 |
| `resources/sensevoice` | `sensevoice` | 语音 GGUF |
| `resources/llms` | `llms` | Hybrid RAG：e5 + RapidOCR 等 |
| `resources/engines` | `engines` | 引擎 MANIFEST（无 Python wheels） |

```bash
# 静态策略（含 RAG / sensevoice / updater）
OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop
```

- [ ] `audit:desktop-pack` 退出码 0
- [ ] 若改动 RAG：本地已按需执行 `node apps/desktop/scripts/stage-rag-engines.mjs`（及 sensevoice staging），且 `resources/engines/<platform>/MANIFEST.json` 存在、`engines: []`
- [ ] **禁止**在 `resources/engines` 留下 Python worker / wheel

### 2.3 Sidecar：`stage-runtime` / `verify-runtime`

- [ ] 理解：`stage-runtime.mjs` 安装依赖到 `runtime-stage/node_modules`，再改名为 `deps/`（避免 electron-builder 跳过顶层 `node_modules`）；`afterPack` 须再还原为包内 `node_modules`
- [ ] 宿主架构匹配时跑 sidecar 冒烟：

```bash
# 在已 stage 的前提下（或完整 prebuild 后）
npm run verify:runtime -w @opptrix/desktop
```

- [ ] 冒烟使用 `ELECTRON_RUN_AS_NODE=1` 拉起 Electron 二进制执行 sidecar（与生产一致；见 `verify-runtime.mjs`）
- [ ] `verify-runtime` 在同环境断言 Hybrid RAG 原生可 `import`：`sharp`、`onnxruntime-node`、`@lancedb/lancedb`（若 staged 含 `@gutenye/ocr-node` 一并尝试）；缺失不得静默跳过
- [ ] 交叉架构 stage（如 arm64 主机打 x64）允许跳过 live import/health，但仍须产物路径齐全（含上述 RAG 包树 + `better-sqlite3` / `duckdb` / Fastify / Playwright Chromium）
- [ ] `stage-rag-engines.mjs` 的 MANIFEST 平台键尊重 `OPPTRIX_RUNTIME_ARCH`（与 `stage-runtime` 一致，避免 mac-x64 写成 darwin-arm64）

### 2.4 Updater 与 `asarUnpack`

- [ ] Updater 落在 `build/updater-deps/packages/`（**不得**路径段名为 `node_modules`）
- [ ] `asarUnpack` 含：`build/updater-deps/**`、`node-llama-cpp` / `@node-llama-cpp`（RAG 原生）
- [ ] `OPPTRIX_AUDIT_STAGE_UPDATER=1` 已实际 stage updater 依赖（不仅静态读配置）

### 2.5 编排勾选汇总

- [ ] `prepare-icons`（含 tray）OK
- [ ] `extraResources`：runtime-stage / sensevoice / llms / engines OK
- [ ] `stage-runtime` +（可跑时）`verify-runtime` OK
- [ ] updater staging + `asarUnpack` OK
- [ ] `audit:desktop-pack`（含 updater stage）退出码 0

---

## 3. 各平台原生依赖

Sidecar 与 RAG 原生模块按 **构建目标** `platform-arch` 编译/预下载，**不可**假设 Universal 单包覆盖双架构。

### 3.1 矩阵

| 目标 | CI / 本地要点 | 验证 |
|------|---------------|------|
| **macOS arm64** | 原生 runner 直接 stage | `verify-runtime`；安装包内 `.node` 为 arm64 |
| **macOS x64** | Apple Silicon CI 常用 Rosetta / npm `--cpu` 打 x64 原生 | 产物与 host 不一致时可跳过 live health，仍须 artifact 检查 |
| **Windows x64** | 独立 job；注意 Authenticode 与 NSIS | CI `verify-packaged-runtime` / `verify-packaged-updater` |
| **Linux x64** | AppImage + deb；sandbox / ripgrep 等由 stage 脚本处理 | 同上 |

### 3.2 `ELECTRON_RUN_AS_NODE`

- [ ] 生产 sidecar **不**依赖系统 Node；主进程以打包内 Electron + `ELECTRON_RUN_AS_NODE=1` 执行 `runtime-stage` 入口
- [ ] `better-sqlite3` 须按 `build.electronVersion` rebuild / prebuild（ABI 与 Electron 一致）
- [ ] `duckdb` / `@duckdb/node-bindings-*` 按目标平台预置；**勿**对 duckdb 做 Electron ABI 全量 rebuild（见 `stage-runtime.mjs` 注释）
- [ ] `node-llama-cpp` 在 asar 外解包（`asarUnpack`）；改动后至少在一平台做 RAG/本地推理冒烟
- [ ] Hybrid RAG：`sharp` / `onnxruntime-node` / `@lancedb/lancedb`（及可选 `@gutenye/ocr-node`）须在 `runtime-stage` 依赖树中，并由 `verify-runtime` 在 `ELECTRON_RUN_AS_NODE` 下冒烟

### 3.3 平台勾选

- [ ] 已确认本次是否改动原生依赖列表或 Electron 版本；若升级 Electron → 已改 `build.electronVersion` 且计划三端冒烟（`DESKTOP-RELEASE` Phase C5）
- [ ] mac x64 **与** arm64 均在发版计划中（禁止只验本机 arch）
- [ ] Windows / Linux 至少依赖 CI 全绿，或本地等价 verify

---

## 4. 数据库与用户数据

原则见 [`backward-compatibility.mdc`](../.cursor/rules/backward-compatibility.mdc)：幂等迁移、只增不破、失败可诊断、禁止「删库了事」。

### 4.1 库一览

| 存储 | 典型路径 | 版本真源 | 说明 |
|------|----------|----------|------|
| **market-data** | 用户数据根下行情库（SQLite + DuckDB 层） | `packages/market-data/src/schema.ts` → `SCHEMA_VERSION`（须 = `MIGRATION_STEPS.length`） | 跨版本 `migrateSchema` |
| **user-store** | `~/.opptrix/opptrix.db` | `meta` 迁移键 + `CREATE IF NOT EXISTS`；无单一数字 SCHEMA 时常靠标记 | 偏好 / 会话 / 计划任务等 |
| **doc-library** | `~/.opptrix/doc-library/doc-library.db` | `DOC_LIBRARY_SCHEMA_VERSION`（`packages/doc-library`） | 另有 LanceDB / `~/.opptrix/llms`、`engines` 用户副本 |

```bash
# 当前代码中的 schema 版本（发版前记录进交付汇报）
node -e "console.log('market-data', require('./packages/market-data/dist/schema.js').SCHEMA_VERSION)" 2>/dev/null \
  || rg -n "export const SCHEMA_VERSION" packages/market-data/src/schema.ts
rg -n "DOC_LIBRARY_SCHEMA_VERSION" packages/doc-library/src/schema.ts
```

### 4.2 相对 `PREV` 的 schema 检查

```bash
PREV=$(git tag -l 'desktop-v*' --sort=-v:refname | head -1)
git diff "${PREV}..HEAD" -- \
  packages/market-data/src/schema.ts \
  packages/market-data/src/schema-migrate.ts \
  packages/user-store/src \
  packages/doc-library/src/schema.ts \
  packages/doc-library/src/schema-migrate.ts
```

- [ ] **market-data**：无变更 → 勾「无 schema 变更」；有变更 → `SCHEMA_VERSION` 已 bump、`MIGRATION_STEPS` 已注册、迁移测试通过、旧库可升级
- [ ] **user-store**：新表/新 namespace/新迁移键均幂等；旧 `opptrix.db` 可打开
- [ ] **doc-library**：新版本有迁移；旧 `doc-library.db` + 向量目录可升级；bundled `llms`/`engines` 与用户 `~/.opptrix/llms` 查找顺序兼容（见 `packages/doc-library/src/paths.ts`）
- [ ] 若无法自动迁移 → 已在 `docs/releases/{version}.md` 写清手动步骤与备份建议（面向用户、非技术堆砌）

### 4.3 用户数据勾选

- [ ] 相对上一标签：market-data / user-store / doc-library 变更结论已写明
- [ ] 新增库或目录有默认创建与失败提示，不导致主窗白屏
- [ ] 无「升级必须删 `~/.opptrix`」作为唯一路径

---

## 5. 自动更新不断链

细则见 `DESKTOP-RELEASE.md` §4.4 与 Phase C3/C6。

- [ ] 更新通道仍为 `publish.channel: "latest"` + `detectUpdateChannel: false`（避免预发布号生成 `dev-`/`beta-` yml 导致旧客户端断链）
- [ ] **禁止**手动改名安装包或改已发布 `latest-*.yml` 的 `url`/`sha512`/`version` 糊弄版本
- [ ] R2 / `update.opptrix.org`：新版本仍由 CI `sync-r2` 覆盖三份 `latest-*.yml`；旧版至少能升到本版或文档写明的过渡版
- [ ] Windows：签名材料已在 CI secrets 配置（**勿**把证书内容写入仓库或本文）；`publisherName` 与内置验签一致
- [ ] （建议）macOS 公证 / 签名 secrets 已配置

```bash
# 打包与 updater 静态+stage 门禁（同 CI）
OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop

# 发版后（打标签之后）再核：
# gh release view desktop-v{version}
# 确认 latest-mac.yml / latest.yml / latest-linux.yml 与安装包齐全
```

---

## 6. 版本元数据

**未完成本节 bump → 禁止打新 `desktop-v*`。**

- [ ] **Bump** `apps/desktop/package.json` `version`（真源）
- [ ] （若同步 Web UI）bump `client-ui/package.json` `version`
- [ ] 撰写 `docs/releases/{version}.md`（`## 新功能` + `## 修复`；文风见 `desktop-release.mdc`）
- [ ] 更新 `ONBOARDING_RELEASE_BY_VERSION`（键与桌面 version **前缀匹配**）
- [ ] 若改引导流程/协议：同步 bump `ONBOARDING_FLOW_VERSION` / `LEGAL_AGREEMENTS_VERSION`（`packages/shared` 与 `client-ui/.../constants.ts` **双写**）
- [ ] 预览 Release 正文：

```bash
VER=$(node -p "require('./apps/desktop/package.json').version")
OPPTRIX_RELEASE_STRICT=1 node scripts/assemble-release-notes.mjs "$VER"
```

- [ ] 确认计划标签：`desktop-v${VER}` **尚不存在**，且与 `version` 字符串一致

```bash
VER=$(node -p "require('./apps/desktop/package.json').version")
git tag -l "desktop-v${VER}"   # 应为空
```

---

## 7. 门禁命令（发版前最低集）

与 `DESKTOP-RELEASE` Phase A / A5 对齐；**能跑则跑，失败则停止发版**。

```bash
# 包构建
npm run build:packages

# UI（有 client-ui 改动时必跑）
npm run check:ui
npm run build -w opptrix-client

# 桌面打包预检（硬性；含 updater stage、RAG extraResources、sensevoice 等）
OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop

# 托盘资源（prebuild 也会跑；发版前建议显式）
node apps/desktop/scripts/prepare-icons.mjs

# Sidecar 原生冒烟（需已 stage；交叉 arch 可能 skip live）
npm run verify:runtime -w @opptrix/desktop

# 更新日志
OPPTRIX_RELEASE_STRICT=1 node scripts/assemble-release-notes.mjs \
  "$(node -p "require('./apps/desktop/package.json').version")"
```

补充勾选（按增量）：

- [ ] 含 tray / 关窗常驻 → 至少一平台手动：关窗不退出、托盘显示、退出才杀进程
- [ ] 含 RAG / doc-library / `node-llama-cpp` → 本地或 CI 验证模型资源进包 + 一次文档解析/检索冒烟
- [ ] 含 schema → 相关迁移测试已绿（见 `schema-migration` / 包内测试）

---

## 8. 禁止事项

- ❌ **未 bump `apps/desktop/package.json` `version` 就打新 `desktop-v*` 标签**
- ❌ 跳过 `OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack`
- ❌ 只在本机 arch 验证原生模块，却对 mac 双架构 / Win / Linux 发版
- ❌ schema / 用户数据格式变更无幂等迁移
- ❌ 改更新 CDN / yml 规则导致已发布旧版**永久**无法自动更新且无说明
- ❌ 手动改名产物或篡改已发布 `latest-*.yml`
- ❌ 把 P12、私钥、API Token、签名密码写入仓库或文档
- ❌ 更新日志 / Onboarding 写技术实现或纯 UI 打磨（见 `ui-copy-standard.mdc` / `desktop-release.mdc`）
- ❌ 完成本文后**不**走 `DESKTOP-RELEASE` Phase A–D 就宣称「已发布」
- ❌ 只推 GitHub、不同步 Gitee（见 `dual-remote-sync.mdc`；打标签/推 main 时两端 tip 一致）

---

## 9. 交付前汇报模板

复制以下块，填勾选证据后交给用户确认，再进入 `DESKTOP-RELEASE` 打标签步骤：

```markdown
## 升级准备汇报 — 目标版本 {version}

### 基线
- 上一标签：`desktop-v…`
- 当前 `apps/desktop/package.json` version：`…`（是否已 bump：是/否）
- 增量摘要（1–5 条）：…

### 检查结果
| 章节 | 状态 | 证据（命令/结论） |
|------|------|-------------------|
| 1 范围确认 | ✅/❌ | |
| 2 打包编排 | ✅/❌ | prepare-icons / audit / extraResources |
| 3 原生依赖 | ✅/❌ | verify-runtime / CI 计划 |
| 4 数据库/用户数据 | ✅/❌ | schema diff：无变更 / 已迁移 |
| 5 自动更新不断链 | ✅/❌ | audit + 签名 secrets 存在性（无内容） |
| 6 版本元数据 | ✅/❌ | version + releases md + onboarding |
| 7 门禁命令 | ✅/❌ | 列出已跑命令与退出码 |

### 红线
- [ ] 已 bump version（否则 **不打标签**）
- [ ] `desktop-v{version}` 与 version 一致且标签尚未存在
- [ ] `audit:desktop-pack`（`OPPTRIX_AUDIT_STAGE_UPDATER=1`）退出码 0

### 下一步
- [ ] 按 `docs/DESKTOP-RELEASE.md` Phase A–D 打标签并双远程推送
- [ ] 用户确认后再 `git tag` / `git push`
```

---

## 10. 快速索引

| 主题 | 文档 / 命令 |
|------|-------------|
| 发版全流程 | [`DESKTOP-RELEASE.md`](./DESKTOP-RELEASE.md) |
| 架构与托盘 | [`DESKTOP.md`](./DESKTOP.md) |
| 更新日志 | [`releases/README.md`](./releases/README.md) |
| Agent 硬性 Phase | `.cursor/rules/desktop-release.mdc` |
| 兼容 / 迁移 | `.cursor/rules/backward-compatibility.mdc` |
| 打包预检 | `OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop` |
