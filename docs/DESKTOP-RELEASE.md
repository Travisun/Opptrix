# Opptrix 桌面端发布指南

本文说明 **Electron 桌面端** 如何版本化、构建、经 Actions artifact 同步到 Cloudflare R2，以及 **自动更新（electron-updater）** 对产物的要求。

适用对象：维护者、发布负责人。开发与架构背景见 [DESKTOP.md](./DESKTOP.md)。

---

## 1. 发布模型概览

| 项目 | 说明 |
|------|------|
| 更新方式 | `electron-updater` 全量更新（按平台下载完整安装包，用户确认后重启安装） |
| 更新源 / 安装包分发 | **Cloudflare R2**（`generic` provider；CDN：`update.opptrix.org`） |
| GitHub Release | **仅 Release Notes**（可保持 draft）；**不挂**安装包 / yml / blockmap / CMS 附件 |
| 中转 | GitHub Actions artifact（`desktop-*-*` → `desktop-release-bundle`，约保留 14 天） |
| 版本真源 | `apps/desktop/package.json` 的 `version` 字段 |
| Git 标签 | `desktop-v{version}`，例如 `desktop-v0.6.1` |
| CI 工作流 | [.github/workflows/release-desktop.yml](../.github/workflows/release-desktop.yml) |
| 输出目录 | `apps/desktop/release/`（本地构建） |

**重要**：三端（macOS / Windows / Linux）共用 **同一套语义化版本号**（如 `0.6.1`），但各自产出 **不同格式** 的安装包。客户端只会拉取与当前操作系统匹配的文件。Linux AppImage 可能超过 GitHub Release 单附件 2GB 上限，因此安装包一律走 R2，不经 GitHub 附件。曾试 FTP 镜像因带宽不稳已停用。

---

## 2. 版本号规则

采用 [语义化版本](https://semver.org/lang/zh-CN/)：`a.b.c`（主版本.次版本.修订号）。

### 2.1 各位含义与何时 bump

| 位 | 含义 | 何时 bump | 示例 |
|----|------|-----------|------|
| **a**（主版本） | 重大能力跃迁、不兼容变更或产品里程碑 | 迈入新的产品阶段（如 `0.x` → `1.x`） | `0.7.0` → `1.2.0` |
| **b**（次版本） | 版本内功能增加 | 新功能发版、用户可感知能力上线 | `1.2.0` → `1.3.0` |
| **c**（修订号） | bug 修复、小改进 | 热修、无新功能的结果向修复 | `1.2.0` → `1.2.1` |

预发布号（如 `0.6.0-dev.17`）仍遵循 semver 比较规则；CI 与 `electron-updater` 按完整字符串比较。

### 2.2 真源与对齐（硬性）

1. **版本真源**：`apps/desktop/package.json` 的 `version`（`app-meta.cjs`、侧栏版本、健康检查接口均读取此值）。
2. **同步 bump**（常规发版）：`client-ui/package.json` `version`（Vite 注入 `__OPPTRIX_CLIENT_VERSION__`，触发自托管与引导比对）。
3. **Git 标签**：`desktop-v{version}`，例如 `1.2.0` → `desktop-v1.2.0`。
4. **引导亮点**：`client-ui/src/onboarding/manifest.ts` → `ONBOARDING_RELEASE_BY_VERSION['{version}']` 键须与 `apps/desktop/package.json` `version` **前缀匹配**。
5. **更新日志**：`docs/releases/{version}.md` 文件名与正文版本须与 `apps/desktop/package.json` `version` **完全一致**。

CI 会校验：`desktop-v*` 标签去掉前缀后，必须与 `package.json` 的 `version` **完全一致**，否则构建失败。

贡献者与发版维护者亦见 [`docs/releases/README.md`](./releases/README.md) §版本对齐。

---

## 3. 各平台产物格式与命名

`electron-builder` 的 `productName` 为 **Opptrix**。在版本 `0.6.1`、当前默认配置下，典型文件名如下：

### macOS（分架构：Intel x64 与 Apple Silicon arm64）

**不使用 Universal 单包。** `electron-builder` 虽支持 `arch: ["universal"]`，但 Opptrix 桌面端 sidecar（`runtime-stage`）依赖 **better-sqlite3、node-llama-cpp** 等原生 `.node` 模块；这些模块按**构建机架构**编译进 `extraResources`，Universal 外壳无法让 Intel Mac 运行 arm64 原生库。

因此 CI **分别构建两包**，`electron-updater` 会按用户 CPU 架构下载对应 zip：

| 用途 | 格式 | 典型文件名 | 适用机器 |
|------|------|------------|----------|
| 首次安装 | `.dmg` | `Opptrix-0.6.1-MacOS-x64-Intel-CPU.dmg` / `Opptrix-0.6.1-MacOS-arm64-M-CPU.dmg` | Intel / Apple Silicon |
| **自动更新** | `.zip` | `Opptrix-0.6.1-MacOS-x64-Intel-CPU.zip` / `Opptrix-0.6.1-MacOS-arm64-M-CPU.zip` | 同上 |
| 更新元数据 | `.yml` | `latest-mac.yml`（含多架构条目） | **是** |

> macOS 自动更新依赖 **zip + latest-mac.yml**。在 Apple Silicon CI runner 上打 x64 包时，sidecar 通过 Rosetta 执行 `arch -x86_64 npm install` 安装 x64 原生依赖。

### Windows

| 用途 | 格式 | 典型文件名 | 是否自动更新必需 |
|------|------|------------|------------------|
| 安装包 | NSIS `.exe` | `Opptrix-0.6.1-Windows.exe` | **是** |
| 更新元数据 | `.yml` | `latest.yml` | **是** |
| 差分（可选） | `.blockmap` | `Opptrix-0.6.1-Windows.exe.blockmap` | 建议保留 |

### Linux

| 用途 | 格式 | 典型文件名 | 是否自动更新必需 |
|------|------|------------|------------------|
| 便携运行 | AppImage | `Opptrix-0.6.1-Linux.AppImage` | **是**（AppImage 用户） |
| 包管理器安装 | `.deb` | `opptrix_0.6.1_amd64.deb` | 手动安装；deb 自动更新支持有限 |
| 更新元数据 | `.yml` | `latest-linux.yml` | **是** |

**不要手动改名** 上述由 `electron-builder` 生成的安装包与 `latest-*.yml`。`electron-updater` 通过 yml 内的 `url`、`sha512`、`version` 定位文件；改名会导致已发布客户端无法更新。

---

## 4. 推荐发布流程（CI 自动）

### 4.1 发布前检查

> **Agent**：必须按 `.cursor/rules/desktop-release.mdc` Phase A–D **逐项执行并验证**后再打标签；下列与规则 Checklist 对齐。

**升级准备（兼容性深化）**：相对上一 `desktop-v*` 的打包编排、原生依赖、数据库/用户数据、更新链与门禁，见独立清单 **[DESKTOP-UPGRADE-PREP.md](./DESKTOP-UPGRADE-PREP.md)**（本文件 Phase A–D 仍是打标签与发布的权威流程；**未 bump `version` 不得打新 `desktop-v*`**）。

- [ ] 已在 `main`（或约定发布分支）合并待发布代码
- [ ] **打包预检（硬性）**：`build:packages` → `stage-python` → `OPPTRIX_AUDIT_STAGE_UPDATER=1 OPPTRIX_AUDIT_REQUIRE_STAGED_PYTHON=1 npm run audit:desktop-pack -w @opptrix/desktop` 退出码 0（与 `ci.yml` / `release-desktop.yml` 同序；捕获 updater/`fs-extra`、sidecar `deps/`、托管 Python、证书与自定义验签、workflow 门禁等）
- [ ] 已执行 `npm run build:packages` 与 `npm run build -w opptrix-client` 无错误（CI 会重新构建，本地可先冒烟）
- [ ] 已更新 `apps/desktop/package.json` 的 `version`
- [ ] 已按 `.cursor/rules/onboarding.mdc` 配置引导激活：`ONBOARDING_RELEASE_BY_VERSION` 新版本亮点；若改版引导或协议则 bump `ONBOARDING_FLOW_VERSION` / `LEGAL_AGREEMENTS_VERSION`（`shared` 与 `client-ui/.../constants.ts` 同步）
- [ ] 若同步发布 Web UI，已 bump `client-ui/package.json` 的 `version`（供 `__OPPTRIX_CLIENT_VERSION__` 触发自托管用户引导）
- [ ] 若升级 Electron，已同步修改 `build.electronVersion` 并做三端冒烟
- [ ] **更新日志**已写入 `docs/releases/{version}.md`（复制 `TEMPLATE.md`；必填 `## 新功能` 与 `## 修复`；**仅**面向用户的高级功能/使用结果，禁止技术实现与纯 UI 打磨；见 `desktop-release.mdc` §文案禁写）
- [ ] 本地预览 Release 正文：`OPPTRIX_RELEASE_STRICT=1 node scripts/assemble-release-notes.mjs {version}` 通过
- [ ] **Windows 更新签名材料已配置**：`OPPTRIX_CODE_SIGNING_P12`（或 `WIN_CSC_LINK`）；正式 `desktop-v*` 标签 CI 会要求 secrets 存在（`workflow_dispatch` + `skip_signing` 可跳过）
- [ ] （建议）macOS `CSC_LINK` / Apple 公证 secrets 已配置；未签名时 Gatekeeper 体验差

### 4.2 打标签触发 CI

```bash
# 1. 确认版本号
node -p "require('./apps/desktop/package.json').version"

# 2. 提交版本号变更（若尚未提交）
git add apps/desktop/package.json
git commit -m "chore(desktop): bump version to 0.6.1"

# 3. 推送代码
git push origin main

# 4. 打标签并推送（标签名必须与 version 对应）
git tag desktop-v0.6.1
git push origin desktop-v0.6.1
```

推送 `desktop-v*` 标签后，GitHub Actions 会：

1. **prepare-release**：创建 **notes-only** GitHub Release（可 Draft；正文来自 `docs/releases/{version}.md`）。**不**上传任何安装包附件
2. **stage-shared-models**（ubuntu，只跑一次）：按国外优先源序拉取 SenseVoice / e5 / RapidOCR，写入 cache `desktop-shared-models-v1`，并上传 artifact `desktop-shared-models`
3. **4 个并行 matrix job** 打包（macOS x64 / arm64、Windows、Linux）：`download-artifact` 复用共享模型（`OPPTRIX_SKIP_SHARED_MODEL_STAGE=1`，prebuild 不再重复 stage）；仍各自 stage engines / Python / Playwright 等架构相关资源
4. 各 job 将产物写入 staging，以稳定名上传 Actions artifact：`desktop-win-x64` / `desktop-linux-x64` / `desktop-mac-arm64` / `desktop-mac-x64`（**禁止** `gh release upload`）
5. **finalize-release**：按平台分别下载 artifact（避免误收 `desktop-shared-models`）→ 合并 macOS `latest-mac.yml` → 校验本地资产名列表 → 上传完整包 `desktop-release-bundle`
6. **sync-r2**：下载 `desktop-release-bundle`，校验 coherence → Verify R2 credentials → **硬失败**同步到 Cloudflare R2 → Purge CDN → Verify public update metadata（Draft 只影响 GitHub Notes 页可见性，**不**阻止 R2）


#### 共享模型源序与 Secrets

| 项 | 说明 |
|----|------|
| 源序 | CI 默认 `OPPTRIX_MODEL_SOURCE_ORDER=huggingface,modelscope`（国外优先）；本地开发默认可 ModelScope 优先。**RapidOCR 例外**：仅 ModelScope（+ 可选 `OPPTRIX_RAPIDOCR_DIRECT_URL_PREFIX`），不走 HF |
| `HF_TOKEN` / `HUGGING_FACE_HUB_TOKEN`（可选） | Hugging Face 读 token，提高 e5 / SenseVoice 限额、降低 401 |
| `OPPTRIX_RAPIDOCR_DIRECT_URL_PREFIX`（可选） | RapidOCR ONNX 的稳定直链前缀（如自有 R2）；无则 ModelScope |
| mac 签名 EMFILE | `afterPack` 串行预签 `python/` 与 `runtime-stage/node_modules/` 下 Mach-O，`build.mac.signIgnore` 跳过这些树与 `playwright-browsers` |

**已确认可用的 HF 直链（SenseVoice）**

- `https://huggingface.co/FunAudioLLM/SenseVoiceSmall-GGUF/resolve/main/sensevoice-small-q8.gguf?download=true`
- `https://huggingface.co/FunAudioLLM/fsmn-vad-GGUF/resolve/main/fsmn-vad.gguf?download=true`

**e5**：打包/运行时需要 `Xenova/multilingual-e5-small` 的 `onnx/model_quantized.onnx`（约 118MB）。`nilay-sam-23/multilingual-e5-small-onnx` 仅有完整 `onnx/model.onnx`（约 470MB），**不能直接替换**。

**RapidOCR**：继续只用 ModelScope（或自备 R2 直链）。

#### 草稿 Release Notes

GitHub Release 可保持 Draft（便于先审 Notes 再公开）。自动更新与 QA 安装包以 **R2 / CDN**（`update.opptrix.org`）为准；亦可从对应 Actions run 的 `desktop-release-bundle` 下载。

```bash
# 仅公开 Release Notes 页（可选；与 R2 是否已有安装包无关）
gh release edit desktop-v1.3.4 --draft=false
```

#### Resync Desktop R2（不重新打包）

修复同步脚本、或 CDN/R2 缺文件时：

```bash
# Actions → 手动运行 「Resync Desktop R2」
# 输入 tag（如 desktop-v1.3.4）；可选 run_id 覆盖自动查找
```

工作流按 tag 查找最近一次成功的 `Release Desktop` run，下载 artifact `desktop-release-bundle` 再传 R2（硬失败；无 FTP 镜像）。若找不到或已过期（约 14 天）：请重跑 Release Desktop，或传入仍保留该 artifact 的 `run_id`。

Sidecar 原生依赖由 `apps/desktop/scripts/stage-runtime.mjs` staging；`-dev` 标签默认跳过代码签名（并标记 GitHub prerelease）。

CI 中 `electron-builder` 只本地产出安装包与 `latest-*.yml`（不 `--publish` 到 GitHub）。三端 job 全部成功且 `sync-r2` 绿后，R2/CDN 上应同时存在三套安装包与三份公开 yml。

### 4.3 核对产物（R2 / CDN / Actions）

打开 R2/CDN 或 Actions，确认至少包含：

```text
# macOS（矩阵分架构 → finalize 合并 latest-mac.yml）
Opptrix-{version}-MacOS-x64-Intel-CPU.dmg
Opptrix-{version}-MacOS-x64-Intel-CPU.zip
Opptrix-{version}-MacOS-arm64-M-CPU.dmg
Opptrix-{version}-MacOS-arm64-M-CPU.zip
latest-mac.yml

# Windows
Opptrix-{version}-Windows.exe
latest.yml

# Linux
Opptrix-{version}-Linux.AppImage
opptrix_{version}_amd64.deb
latest-linux.yml
```

（另可有 `.blockmap`、Linux `*.opptrix-cms` 等。）

- **公开下载 / 自动更新**：`https://update.opptrix.org/desktop/`（及同前缀安装包）
- **中转备份**：Actions → 对应 `Release Desktop` run → artifact `desktop-release-bundle`
- **GitHub Release 页**：仅核对 **Release Notes**（新功能 / 修复 / 安装说明）；**无**安装包附件属预期

Release 正文由 CI 从 **`docs/releases/{version}.md`** 组装。细则见 [`docs/releases/README.md`](./releases/README.md) 与 `.cursor/rules/desktop-release.mdc`。

### 4.4 Cloudflare R2 + CDN（`update.opptrix.org`）

桌面客户端的 **检查更新 / 下载更新 / 手动获取安装包** 均走 R2 + 自定义域名 CDN；GitHub Release **只**承载 Release Notes。（曾试 FTP 因带宽不稳已停用，CI **仅** `sync-release-to-r2.mjs`。）

CI 在 `finalize-release` 成功后执行 **`sync-r2`** job（**不因 Draft 跳过**；同步失败则 workflow 失败）：

1. 下载 Actions artifact `desktop-release-bundle`（三端安装包、合并后的三份 `latest-*.yml`、CMS/blockmap 等）；
2. 校验 release coherence（tag / yml / 资产一致）并 Verify R2 credentials；
3. **先上传** 到 R2（安装包 / CMS / blockmap 优先，最后覆盖三份 `latest-*.yml`，避免更新源空窗）；
4. **再删除** `desktop/` 前缀下不属于本版的旧对象；
5. **Purge** Cloudflare 边缘缓存，并校验 `update.opptrix.org` 上 yml（及本版 CMS）可访问。

缺文件时可用手动工作流 **Resync Desktop R2**（`.github/workflows/resync-desktop-r2.yml`）从既有 artifact 重传，无需重新打包。

**远程专家市场（`experts/` 前缀，与 `desktop/` 隔离）**

- 静态 JSON 源文件：仓库根 [`experts/`](../experts/README.md)
- `push` → `main` 且 `experts/**` 变更：`.github/workflows/sync-experts.yml` 同步 R2 前缀 `experts/` 并 purge CDN
- 桌面发版 `release-desktop.yml`：若相对上一 `desktop-v*` 标签含 `experts/**` 变更，旁路执行同一脚本
- 公开 URL：`https://update.opptrix.org/experts/catalog.json` 与各 `{id}.json`

#### 自动更新链路不变量（dev / beta / 正式版通用）

| 环节 | 约定 | 说明 |
|------|------|------|
| **版本号** | `apps/desktop/package.json` `version` **必须**与 tag `desktop-v{version}` 一致 | CI 首步校验 |
| **更新通道** | 固定 `publish.channel: "latest"` + `detectUpdateChannel: false` | 避免 `0.6.0-dev.*` 生成 `dev-*.yml`、避免 `1.0.0-beta.1` 生成 `beta-*.yml` |
| **公开 yml** | `latest-mac.yml` / `latest.yml` / `latest-linux.yml` | 客户端与 R2 CDN 只认这三份 |
| **macOS 分架构** | 矩阵 job 上传 `latest-mac-arm64.yml` + `latest-mac-x64.yml` artifact → finalize 合并 | 合并后 yml 内须同时含 `arm64` 与 `x64` 的 `.zip` |
| **安装包命名** | 仅字母、数字、连字符（如 `MacOS-arm64-M-CPU`） | 禁止空格/括号；须与 yml 中 `url` **逐字一致** |
| **更新源 URL** | 构建时注入 `OPPTRIX_UPDATE_BASE_URL` → 写入 `app-update.yml` | 默认：`https://update.opptrix.org/desktop/`（R2 + CDN） |
| **Updater 组件** | `prebuild` → `stage-updater-deps.mjs` 写入 `build/updater-deps/packages/`（路径中 **不得** 含 `node_modules` 目录名） | electron-builder 会跳过名为 `node_modules` 的子目录；CI 打包后 `verify-packaged-updater.mjs` 校验 |
| **Sidecar 依赖** | `stage-runtime.mjs` 安装后把 `runtime-stage/node_modules` **改名为** `runtime-stage/deps/`；主进程 `NODE_PATH` 指向 `deps` | 同理：`extraResources` 复制时相对路径恰为 `node_modules` 会被跳过，安装包会缺 Fastify 等；CI 用 `verify-packaged-runtime.mjs` 校验 |
| **Sidecar ffmpeg** | `ensureFfmpegStatic` 下载/种子 `ffmpeg-static` 二进制；断言后 `chmod +x` + host 匹配时 `-version` 冒烟；rename 后与 `verify-packaged-runtime` **硬断言**存在且可执行（posix `X_OK`；Windows `.exe`） | 语音/媒体转写依赖；缺失/无执行位不得 warn 后继续；`audit-desktop-pack` 防软失败回归 |
| **托管 Python** | `build:packages` → `stage-python.mjs` → `resources/python/`；`extraResources` → 安装包 `python/`；`OPPTRIX_AUDIT_REQUIRE_STAGED_PYTHON=1` 审计硬门禁 | CI / release 在 audit 前显式 stage；打包后 `verify-packaged-runtime` 校验 `bundle-manifest.json` + 解释器。**翻译 GGUF 不打进包**（用户按需下载） |
| **更新包签名** | 内置 `electron/certs/opptrix-update-root.pem`；Windows 用自签 Authenticode + 自定义 `verifyUpdateCodeSignature`；Linux 可选旁路 `*.opptrix-cms` | Secrets：`OPPTRIX_CODE_SIGNING_P12` / `_PASSWORD` / `_KEY_PEM`。**不依赖**系统信任库；SmartScreen 仍可能提示未知发布者 |
| **R2 同步** | 始终从 `desktop-release-bundle` 上传；仅保留最新一版对象；含全部安装包 + 三份 yml + Linux `*.opptrix-cms` | Draft 不阻止同步；旧客户端靠 semver 比较版本，不靠多通道 |
| **打包预检** | `audit-desktop-pack.mjs`（`npm run audit:desktop-pack`） | `ci.yml` / `release-desktop.yml`：`build:packages` → `stage-python` → `OPPTRIX_AUDIT_REQUIRE_STAGED_PYTHON=1` + `OPPTRIX_AUDIT_STAGE_UPDATER=1`；本地打标签前至少 `OPPTRIX_AUDIT_STAGE_UPDATER=1`（无 python tree 时 warn；设 REQUIRE 则须先 stage） |

**版本升级语义（electron-updater）**

- `0.6.0-dev.17` → `0.6.0-dev.18`：正常增量更新  
- `0.6.0-dev.*` → `1.0.0`：正式版号更大，dev 用户可收到正式版（`allowDowngrade: false`）  
- 旧 GitHub Releases 源安装的客户端：需先手动装一版带 R2 feed 的包，之后走 CDN 自动更新  
- **仅系统验签、无自定义 CA 的旧 Windows 客户端**：无法信任自签更新包 → **须手动安装一次**带 `update-signature` 的新版，之后自动更新才恢复  

**本地/CI 自检**

```bash
# 发版 / 推 main 前：packages → stage-python → 静态策略 + stage updater（含嵌套 fs-extra）
npm run build:packages
node apps/desktop/scripts/stage-python.mjs
OPPTRIX_AUDIT_STAGE_UPDATER=1 OPPTRIX_AUDIT_REQUIRE_STAGED_PYTHON=1 npm run audit:desktop-pack -w @opptrix/desktop

# 仅静态预检（无 python tree 时对 staged python 为 warn，不硬失败）
OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop

npm run verify:release-metadata-policy -w @opptrix/desktop   # 策略常量（改命名/通道后必跑）
node apps/desktop/scripts/verify-release-artifacts.mjs apps/desktop/release  # 构建后 yml ↔ 本地文件
node apps/desktop/scripts/verify-packaged-updater.mjs apps/desktop/release   # 构建后须含 electron-updater
node apps/desktop/scripts/verify-packaged-runtime.mjs apps/desktop/release   # sidecar + ffmpeg 可执行 + python bundle
node apps/desktop/scripts/verify-release-coherence.mjs desktop-vX.Y.Z /path/to/release-assets  # 与 tag 一致
```

策略源码：`apps/desktop/scripts/lib/release-metadata-policy.mjs`（单一事实来源）。

---

#### 第一步：Cloudflare R2（存储 + 自定义域名）

1. **R2 → Create bucket**（名称示例：`opptrix-desktop-releases`）
2. **Settings → Custom Domains → Connect Domain**：`update.opptrix.org`（等待 Active）
3. **Manage R2 API Tokens → Create API token**（Object Read & Write）→ 填入 GitHub：
   - `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ACCOUNT_ID` / `R2_BUCKET`
4. **Zone Cache Purge** API Token + Zone ID → `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID`
5. **`OPPTRIX_UPDATE_BASE_URL`**：公网更新根 URL，**末尾带 `/`**（示例 `https://update.opptrix.org/desktop/`）

打开：**https://github.com/Travisun/Opptrix/settings/secrets/actions → New repository secret**

| Secret 名称 | 填什么 | 示例 |
|-------------|--------|------|
| `R2_ACCOUNT_ID` | Cloudflare Account ID | `a1b2c3d4e5f6...` |
| `R2_ACCESS_KEY_ID` | R2 API Token Access Key ID | `abc123...` |
| `R2_SECRET_ACCESS_KEY` | R2 API Token Secret Access Key | `xyz789...`（仅创建时可见） |
| `R2_BUCKET` | Bucket 名称 | `opptrix-desktop-releases` |
| `CLOUDFLARE_API_TOKEN` | Zone Cache Purge 权限 | （勿提交到仓库） |
| `CLOUDFLARE_ZONE_ID` | `update.opptrix.org` 所在 Zone | （Dashboard → Overview） |
| `OPPTRIX_UPDATE_BASE_URL` | 公网更新根 URL，**末尾带 `/`** | `https://update.opptrix.org/desktop/` |

**已有、无需新增**（CI 自带）：`GITHUB_TOKEN`（创建 Release Notes、下载 artifact）。

**构建阶段也会读** `OPPTRIX_UPDATE_BASE_URL`（写入安装包内 `app-update.yml`），因此 **打 `desktop-v*` 标签前** 必须已配置该 Secret。

#### 验证配置

Secrets 配好后，打 `desktop-v*` 标签，在 Actions 查看 **Sync release to Cloudflare R2** job：coherence → Verify R2 credentials → Sync to R2 → Purge CDN → Verify public metadata 均绿。缺文件时可手动跑 **Resync Desktop R2**。

---

#### 跳过 / 失败行为（便于排查）

| 未配置的 Secret | CI 行为 |
|-----------------|---------|
| `R2_ACCESS_KEY_ID` 等 R2 四项 | **sync-r2 失败**（硬失败，不跳过） |
| `CLOUDFLARE_API_TOKEN` | 跳过 CDN purge（R2 上传仍成功；公开 verify 可能因边缘缓存失败） |
| `OPPTRIX_UPDATE_BASE_URL` | 安装包用占位 URL；公开 verify 跳过 |

#### 客户端如何指向 R2

- CI 构建时通过 `OPPTRIX_UPDATE_BASE_URL` 注入 `electron-builder` 的 `generic` publish URL；
- 打包产物内嵌 `app-update.yml`，`electron-updater` 从该 URL 拉取 yml 与安装包；
- **仍走 GitHub 更新源的旧客户端**，需先手动安装一版新包后，后续才走 R2/CDN。

本地调试 R2 同步：

```bash
export R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=…
export OPPTRIX_UPDATE_BASE_URL=https://update.opptrix.org/desktop/
node apps/desktop/scripts/sync-release-to-r2.mjs /path/to/release-assets
```

---

## 5. 手动构建与上传（备用）

当 CI 不可用或需本地补发某一平台时：

### 5.1 本地构建

```bash
npm ci
npm run build:desktop
# 仅解包目录、不生成安装包时：
npm run build:dir -w @opptrix/desktop
```

产物在 `apps/desktop/release/`。

### 5.2 发布到 GitHub

```bash
# 需设置有 repo 写权限的 token
export GH_TOKEN=ghp_xxxxxxxx

npm run build:desktop -- --publish always
```

或在 [GitHub Releases](https://github.com/Travisun/Opptrix/releases) 手动 **编辑已有** `desktop-v{version}` Release，**拖拽上传** 该平台全部文件（含对应 `latest-*.yml`）。

**手动上传注意：**

1. 所有文件必须挂在 **同一个** `desktop-v{version}` Release 下；
2. 必须上传 **完整一套**（安装包 + 对应 yml），不要只传 exe 不传 `latest.yml`；
3. 不要覆盖其他平台的 yml 文件名（`latest-mac.yml` 与 `latest.yml` 不同）；
4. `version` 字段以 yml 内为准，须与 `package.json` 一致。

---

## 6. 自动更新如何工作（发布后）

已安装的打包版客户端（非 `npm run dev`）会：

1. 启动约 10 秒后后台检查 **R2 上的 `latest-*.yml`**；
2. 读取嵌入在安装包内的 `app-update.yml`（构建时由 `generic` publish + `OPPTRIX_UPDATE_BASE_URL` 生成）；
3. 对比 `latest-*.yml` 中的 `version` 与本地 `apps/desktop/package.json` 版本；
4. 若有新版本：`autoDownload` 后台下载 **当前平台** 整包；
5. 侧栏「设置」上方提示 → 用户点 **重启更新** → 主进程先停 sidecar / 销毁托盘与窗口，再 `quitAndInstall(false, true)`：macOS 由 Squirrel 替换 `.app` 并直接重启应用；Windows / Linux 则唤起已下载的安装包，安装后自动启动。

| 平台 | 实际下载的文件 |
|------|----------------|
| macOS | `Opptrix-*-MacOS-arm64-M-CPU.zip` / `Opptrix-*-MacOS-x64-Intel-CPU.zip` |
| Windows | `Opptrix-*-Windows.exe` |
| Linux | 主要为 `Opptrix-*-Linux.AppImage` |

用户数据（SQLite、配置等）一般在用户目录，整包替换 **不会** 清空对话与设置。

### 自定义链接 `opptrix://`

安装包会在 **macOS / Windows / Linux** 注册 `opptrix://` 协议处理器。示例：

| 链接 | 行为 |
|------|------|
| `opptrix://chat?session={id}` | 打开指定对话 |
| `opptrix://settings?section=news_feed` | 打开设置页 |
| `opptrix://news?article={id}` | 打开新闻中心并选中文章 |

关闭主窗口后应用可**缩到系统托盘**继续运行；更新就绪等事件会尝试发送**本地通知**（需在系统设置中允许通知）。

---

## 7. 平台差异与签名

### macOS

- **分架构发布**（`x64` + `arm64`），Intel 与 Apple Silicon 各一份；**不用 Universal 单包**（见 §3 说明）。
- 同时产出 `dmg`（分发）与 `zip`（更新）；**自动更新只走 zip**（`latest-mac.yml` 指向各架构 zip）。
- `build.dmg.sign` 已启用（`true`），在具备签名证书时会对 DMG 容器本身签名。
- **未配置签名 secrets 时 CI 仍可构建**（产出未签名包，`CSC_IDENTITY_AUTO_DISCOVERY=false`）；正式发布建议配置签名与公证。

#### 在 CI 中配置 Apple 签名（推荐）

1. [Apple Developer](https://developer.apple.com) 账号，创建 **Developer ID Application** 证书，导出 `.p12`。
2. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加：

   | Secret | 说明 |
   |--------|------|
   | `CSC_LINK` | `.p12` 文件的 Base64（`base64 -i cert.p12 \| pbcopy`） |
   | `CSC_KEY_PASSWORD` | 导出 `.p12` 时的密码（**必须与证书匹配**；CI 会先校验，错误则回退 ad-hoc 未签名包） |
   | `APPLE_ID` | 苹果 ID 邮箱（公证） |
   | `APPLE_APP_SPECIFIC_PASSWORD` | [App 专用密码](https://appleid.apple.com) |
   | `APPLE_TEAM_ID` | 开发者团队 10 位 ID |

3. 配置 secrets 后 **无需改 workflow**；未配置 `CSC_LINK` 时 workflow 自动跳过签名并继续构建。
4. CI 会在无 GUI 的 runner 上预建临时钥匙串，并执行 `security set-key-partition-list`，避免 `codesign` 等待钥匙串弹窗导致签名步骤卡住并以 `The operation was canceled` 失败。
5. 项目已内置公证用 entitlements（`apps/desktop/resources/entitlements.mac.plist` 及 `.inherit.plist`），覆盖 Electron 主进程与 sidecar 子进程的原生模块加载；**不要**在签名时移除。
6. 重新打 `desktop-v*` 标签发布。

`electron-builder` 检测到 `CSC_*` 后会自动签名；提供 `APPLE_*` 时会尝试公证。本地 Mac 若 Keychain 已有证书，也可直接 `npm run build:desktop` 无需导 p12。

未签名时：用户可能需 **右键 → 打开**，Mac 自动更新体验也会变差。

#### 提示「已损坏，无法打开」

这通常**不是文件损坏**，而是 macOS Gatekeeper 拦截从未公证/未签名的应用（从 GitHub 下载还会带隔离属性）。

**未签名 / dev 包**（当前 CI 在未配置或跳过证书时）：

```bash
xattr -cr /Applications/Opptrix.app
open /Applications/Opptrix.app
```

或在 Finder 中对该 App **右键 → 打开** 一次。

**正式签名 / 已公证包**仍出现此提示：先核对架构（Intel→x64，M 系列→arm64）；也可能是下载带来的 quarantine——可手动 `xattr -cr /Applications/Opptrix.app`。打包版启动时也会尝试清除本机 `.app` 上的 quarantine（失败不阻塞启动）。

### Windows

- 使用 NSIS 安装器（`oneClick: false`，允许用户选择安装目录）。
- `runAfterFinish: false`：安装完成后不显示「启动应用」勾选，安装器直接结束；用户从桌面/开始菜单快捷方式自行启动（与应用内更新后的 `quitAndInstall` 自动 relaunch 无关）。
- 建议配置 Authenticode 签名，减少 SmartScreen 警告。

### Linux

- AppImage 适合「下载即用」与自动更新；
- `.deb` 供 `dpkg`/`apt` 用户手动安装，与 AppImage 更新通道不同，发布时两种格式可一并提供。

---

## 8. 常见问题

### Q：客户端提示「更新组件不可用，请重新安装…」

- **不是** 用户数据或 CORS 问题；表示安装包内 **未打入** `electron-updater`（`autoUpdater` 加载失败）。
- 常见原因：Updater 被放在 `build/updater-deps/node_modules/` 下被打包工具跳过（dev.19 及更早 CI 产物）。
- 修复版本须含 `build/updater-deps/packages/electron-updater/`；CI 会在打包后运行 `verify-packaged-updater.mjs`。
- 已装旧包的用户需 **手动下载新版 DMG/EXE** 安装一次，之后才能恢复自动更新。

### Q：CI 在 `stage-updater-deps` 报 `electron-updater dependency missing: fs-extra`

- `fs-extra` 常嵌套在 `electron-updater/node_modules/`，从 desktop 根单独 `require.resolve` 会失败。
- `stage-updater-deps.mjs` 必须从 **父 package 目录** 解析嵌套依赖；`@opptrix/desktop` 亦声明直接依赖 `fs-extra` 作兜底。
- 本地复现：`OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop`。

### Q：安装后 sidecar 起不来 / 缺 Fastify

- `electron-builder` 的 `createFilter` 会跳过相对路径恰为 `node_modules` 的目录。
- Sidecar 必须以 `runtime-stage/deps/` 打进 `extraResources`（`stage-runtime` 改名 + `RUNTIME_DEPS_DIR`）；CI 用 `verify-packaged-runtime.mjs` 校验。

### Q：Windows 自动更新报「not signed by the application owner」

- 系统默认 Authenticode 要求 OS `Status === Valid`；自签证书达不到。
- 正式链路：CI 用 `OPPTRIX_CODE_SIGNING_P12` 签名 + 客户端内置根 CA + `update-signature.cjs` 自定义验签。
- **仍停留在旧版（无自定义验签）的客户端须手动升级一次。**

### Q：客户端提示「无法连接更新服务器」

- 本机网络能否访问 `update.opptrix.org`（R2 + CDN）；
- 最近一次发版的 `sync-r2` 是否成功，CDN 上是否已有对应平台 `latest-*.yml`；
- 安装包内 `app-update.yml` 是否指向正确的更新根 URL（非示例域或旧 GitHub 源）。

### Q：有新版但 Mac 不更新

- Release 是否包含 **合并后的** `latest-mac.yml`（含 arm64 + x64 两套 zip/dmg 条目；CI `finalize-release` job 负责合并）；
- zip 文件名须含 `arm64` / `x64` 子串（`electron-updater` 按 URL 过滤架构）；
- yml 内 `version` 是否大于客户端当前版本。

### Q：Intel Mac 和 M 系列 Mac 要发两个包吗？

- **是，应发 x64 与 arm64 两包**（同一 Release 下），客户端按 CPU 自动选。不要用 Universal 单包糊弄原生 sidecar 依赖。
- Universal 只适合几乎没有原生 `.node` 依赖的纯 Electron 应用；Opptrix sidecar 含 SQLite / 本地推理库，Universal 极易在 Intel 上启动失败。

### Q：能否只发 Windows、暂不发 Mac？

- 可以临时改 workflow 矩阵去掉 `macos-latest`；未构建时 Mac 用户收不到自动更新。

### Q：能否只发 Windows、暂不发 Linux？

- 可以临时改 workflow 矩阵去掉 `ubuntu-latest` / `desktop-linux-x64`；未构建时 Linux 用户收不到自动更新。默认矩阵仍包含 Linux。

### Q：版本号写错怎么办

- **不要** 直接改已发布 Release 里的 yml 版本糊弄过去；
- 正确做法：修正 `package.json` → 新发 `desktop-v{新版本}` → 在 Release Notes 说明跳过错误版本。

### Q：Electron 版本要不要随每个应用版本升级？

- 不必每次发版都升；当需要安全补丁或 Chromium 特性时，修改 `build.electronVersion` 后按正常流程发布即可，会自动随整包更新外壳。

---

## 9. 发布清单（可打印）

> **Agent**：完整分阶段清单见 `.cursor/rules/desktop-release.mdc`（Phase A–F）；打标签前至少完成 A–D。

```text
[ ] apps/desktop/package.json version = X.Y.Z
[ ] docs/releases/X.Y.Z.md 已撰写（新功能 + 修复）
[ ] git tag desktop-vX.Y.Z 已推送
[ ] CI macOS（x64 + arm64）/ Windows / Linux job 均成功
[ ] finalize 产出 desktop-release-bundle；sync-r2 成功
[ ] verify-packaged-updater 通过（.app / win-unpacked 内含 electron-updater）
[ ] R2/CDN（或 Actions artifact）含 Mac 双架构 dmg/zip + latest-mac.yml，以及 Win / Linux 产物与 yml
[ ] GitHub Release Notes 已填写（无安装包附件属预期）
[ ] 在目标平台安装旧版 → 检查更新 → 下载 → 重启验证
```

---

## 10. 相关文件索引

| 文件 | 作用 |
|------|------|
| `apps/desktop/package.json` | 版本号、electron-builder 目标格式、GitHub publish 配置 |
| `docs/releases/{version}.md` | 发版更新日志（新功能 / 修复）；CI 组装进 GitHub Release Notes |
| `scripts/assemble-release-notes.mjs` | 更新日志 + 安装说明 → Release 正文 |
| `apps/desktop/electron/updater.cjs` | 自动检查、下载、重启安装 |
| `apps/desktop/scripts/prebuild.mjs` | 构建前编译 packages、UI、打 runtime |
| `.github/workflows/release-desktop.yml` | 标签触发三平台构建 → artifact → R2 |
| `.github/workflows/resync-desktop-r2.yml` | 从 `desktop-release-bundle` 再同步 R2（不重建） |
| [DESKTOP.md](./DESKTOP.md) | 桌面架构与开发命令 |
| [SECURITY.md](../SECURITY.md) | 安全问题反馈方式 |

---

## 11. 快速命令参考

```bash
# 开发
npm run dev:desktop

# 本地打安装包（不上传）
npm run build:desktop

# 本地打安装包并发布到 GitHub（需 GH_TOKEN）
npm run build:desktop -- --publish always

# 仅查看将发布的版本
node -p "require('./apps/desktop/package.json').version"

# 列出桌面相关标签
git tag -l 'desktop-v*' --sort=-v:refname | head
```
