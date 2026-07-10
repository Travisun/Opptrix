# Opptrix 桌面端发布指南

本文说明 **Electron 桌面端** 如何版本化、构建、上传到 GitHub Releases，以及 **自动更新（electron-updater）** 对产物的要求。

适用对象：维护者、发布负责人。开发与架构背景见 [DESKTOP.md](./DESKTOP.md)。

---

## 1. 发布模型概览

| 项目 | 说明 |
|------|------|
| 更新方式 | `electron-updater` 全量更新（按平台下载完整安装包，用户确认后重启安装） |
| 更新源 | **Cloudflare R2**（`generic` provider；CI 构建时写入 `app-update.yml`） |
| 手动下载 | GitHub Releases（安装包与 Release Notes 仍发布在 GitHub） |
| 版本真源 | `apps/desktop/package.json` 的 `version` 字段 |
| Git 标签 | `desktop-v{version}`，例如 `desktop-v0.6.1` |
| CI 工作流 | [.github/workflows/release-desktop.yml](../.github/workflows/release-desktop.yml) |
| 输出目录 | `apps/desktop/release/`（本地构建） |

**重要**：三端（macOS / Windows / Linux）共用 **同一套语义化版本号**（如 `0.6.1`），但各自上传 **不同格式** 的安装包。客户端只会拉取与当前操作系统匹配的文件。

---

## 2. 版本号规则

1. 采用 [语义化版本](https://semver.org/lang/zh-CN/)：`主版本.次版本.修订号`（如 `0.6.1`）。
2. **只改** `apps/desktop/package.json` 中的 `version`（`app-meta.cjs`、侧栏版本、健康检查接口均读取此值）。
3. 发布前打标签，标签名 **必须** 为：

   ```text
   desktop-v{version}
   ```

   示例：版本 `0.6.1` → 标签 `desktop-v0.6.1`。

4. CI 会校验：`desktop-v*` 标签去掉前缀后，必须与 `package.json` 的 `version` **完全一致**，否则构建失败。

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

- [ ] 已在 `main`（或约定发布分支）合并待发布代码
- [ ] 已执行 `npm run build:packages` 与 `npm run build -w opptrix-client` 无错误（CI 会重新构建，本地可先冒烟）
- [ ] 已更新 `apps/desktop/package.json` 的 `version`
- [ ] 若升级 Electron，已同步修改 `build.electronVersion` 并做三端冒烟
- [ ] Release Notes 已起草（面向用户：新功能、修复、已知问题）
- [ ] （可选）macOS 代码签名 / Windows 签名证书已配置（未签名时更新可能触发系统安全提示）

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

1. **prepare-release**：创建 GitHub Release（`desktop-v{version}`）
2. **4 个并行 job** 打包（macOS x64 / arm64、Windows、Linux）
3. 各 job 用 `gh release upload` 上传安装包（`electron-builder --publish never`，避免 CI 内自动 publish/签名冲突）
4. **finalize-release** 合并 macOS 双架构 `latest-mac.yml` 并校验 yml 与 Release 附件一致
5. **sync-r2** 将当前 Release 产物同步至 Cloudflare R2（purge 旧版 + 上传），供客户端加速更新

Sidecar 原生依赖由 `apps/desktop/scripts/stage-runtime.mjs` staging；`-dev` 标签默认跳过代码签名。

`electron-builder` 会：

1. 构建当前平台安装包（Mac 为 **x64 与 arm64 各一包**）；
2. 生成 `latest-mac.yml` / `latest.yml` / `latest-linux.yml`；
3. 创建或更新 **同名 GitHub Release**（与标签 `desktop-v0.6.1` 关联）；
4. 上传该平台产物与 yml。

三端 job 全部成功后，Release 上应同时存在三套安装包与三份 yml。

### 4.3 在 GitHub 上核对 Release

打开：`https://github.com/Travisun/Opptrix/releases/tag/desktop-v0.6.1`

确认附件至少包含：

```text
# macOS（CI 自动，分架构 → finalize 合并 latest-mac.yml）
Opptrix-{version}-MacOS-x64-Intel-CPU.dmg
Opptrix-{version}-MacOS-x64-Intel-CPU.zip
Opptrix-{version}-MacOS-arm64-M-CPU.dmg
Opptrix-{version}-MacOS-arm64-M-CPU.zip
latest-mac.yml

# Windows（CI 自动）
Opptrix-{version}-Windows.exe
latest.yml

# Linux（CI 自动）
Opptrix-{version}-Linux.AppImage
opptrix_{version}_amd64.deb
latest-linux.yml
```

（另可有 `.blockmap` 等辅助文件。）

编辑 Release 说明，补充 **面向用户** 的更新内容。

### 4.4 Cloudflare R2 + CDN（`update.opptrix.org`）

桌面客户端的 **检查更新 / 下载更新** 走 R2 + 自定义域名 CDN；GitHub Release 仍用于手动下载与 Release Notes。

CI 在 `finalize-release` 成功后执行 **`sync-r2`** job：

1. 从 GitHub Release 下载当前标签的全部安装包与 `latest-*.yml`；
2. **删除** R2 bucket 内 `desktop/` 前缀下的旧对象（仅保留最新一版）；
3. 上传当前版本全部产物到 R2；
4. 校验 `update.opptrix.org` 上 yml 可访问；
5. **Purge** Cloudflare 边缘缓存中的三个 `latest-*.yml`（安装包文件名带版本号，无需 purge）。

---

#### 第一步：Cloudflare R2（存储 + 自定义域名）

1. **R2 → Create bucket**  
   名称示例：`opptrix-desktop-releases`

2. **Settings → Custom Domains → Connect Domain**  
   - 域名：`update.opptrix.org`（`opptrix.org` 须在同一 Cloudflare 账号）  
   - 等待状态 **Active**

3. **Settings → Public Development URL → Disable**  
   输入 `disallow`，避免攻击者绕过 CDN 直打 `r2.dev`

4. **Manage R2 API Tokens → Create API token**（给 GitHub 上传用）  
   | 项 | 值 |
   |----|-----|
   | Token name | `github-opptrix-release` |
   | Permissions | **Object Read & Write** |
   | Specify bucket | 仅 `opptrix-desktop-releases` |
   | TTL | 可选「无过期」或 1 年 |

   创建后**立即复制**（Secret 只显示一次）：
   - **Access Key ID** → GitHub `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → GitHub `R2_SECRET_ACCESS_KEY`

5. **Account ID**（Dashboard 右侧 Overview）→ GitHub `R2_ACCOUNT_ID`

---

#### 第二步：Cloudflare API Token（给 GitHub 刷新 CDN 缓存）

与 R2 Token **分开**创建（权限不同）：

1. **My Profile → API Tokens → Create Token**
2. 可用模板 **「Edit zone DNS」** 改权限，或 **Create Custom Token**：
   | 项 | 值 |
   |----|-----|
   | Token name | `github-opptrix-cdn-purge` |
   | Permissions | **Zone → Cache Purge → Purge** |
   | Zone Resources | **Include → Specific zone → opptrix.org** |

3. 创建后复制 Token → GitHub `CLOUDFLARE_API_TOKEN`

4. **Zone ID**（`opptrix.org` → Overview 右侧）→ GitHub `CLOUDFLARE_ZONE_ID`  
   > 注意：Zone 是 **`opptrix.org`**，不是 `update.opptrix.org` 子域。

---

#### 第三步：GitHub Repository Secrets

打开：**https://github.com/Travisun/Opptrix/settings/secrets/actions → New repository secret**

| Secret 名称 | 填什么 | 示例 |
|-------------|--------|------|
| `R2_ACCOUNT_ID` | Cloudflare Account ID | `a1b2c3d4e5f6...` |
| `R2_ACCESS_KEY_ID` | R2 API Token Access Key ID | `abc123...` |
| `R2_SECRET_ACCESS_KEY` | R2 API Token Secret Access Key | `xyz789...`（仅创建时可见） |
| `R2_BUCKET` | Bucket 名称 | `opptrix-desktop-releases` |
| `OPPTRIX_UPDATE_BASE_URL` | 公网更新根 URL，**末尾带 `/`** | `https://update.opptrix.org/desktop/` |
| `CLOUDFLARE_API_TOKEN` | Zone Cache Purge Token | `Bearer` 后面的整串 |
| `CLOUDFLARE_ZONE_ID` | `opptrix.org` 的 Zone ID | `32 位 hex` |

**已有、无需新增**（CI 自带）：`GITHUB_TOKEN`（上传 Release、下载资产）。

**构建阶段也会读** `OPPTRIX_UPDATE_BASE_URL`（写入安装包内 `app-update.yml`），因此 **打 `desktop-v*` 标签前** 必须已配置该 Secret。

---

#### 第四步：验证配置

Secrets 配好后，可本地抽查（勿把 Secret 提交到仓库）：

```bash
# R2 公网 yml（应 200）
curl -I "https://update.opptrix.org/desktop/latest-mac.yml"

# Cloudflare Purge API（替换 ZONE_ID 与 TOKEN）
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://update.opptrix.org/desktop/latest-mac.yml"]}'
# 期望 JSON 中 "success": true
```

正式验证：合并含 `sync-r2` 的 workflow 后，打 `desktop-v*` 标签，在 Actions 查看 **Sync release to Cloudflare R2** job 三步均绿：
- Sync to Cloudflare R2  
- Verify public update metadata  
- Purge Cloudflare CDN cache  

---

#### 跳过行为（便于排查）

| 未配置的 Secret | CI 行为 |
|-----------------|---------|
| `R2_ACCESS_KEY_ID` 等 R2 四项 | 跳过 R2 上传 |
| `OPPTRIX_UPDATE_BASE_URL` | 安装包用占位 URL；跳过公网 verify |
| `CLOUDFLARE_API_TOKEN` | 跳过 CDN purge（R2 上传仍成功） |

#### 客户端如何指向 R2

- CI 构建时通过 `OPPTRIX_UPDATE_BASE_URL` 注入 `electron-builder` 的 `generic` publish URL；
- 打包产物内嵌 `app-update.yml`，`electron-updater` 从 `update.opptrix.org` 拉取 yml 与安装包；
- **仍走 GitHub 更新源的旧客户端**，需先手动安装一版新包后，后续才走 R2/CDN。

本地调试 R2 同步：

```bash
export R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=…
export OPPTRIX_UPDATE_BASE_URL=https://update.opptrix.org/desktop/
node apps/desktop/scripts/sync-release-to-r2.mjs /path/to/release-assets
```

本地调试 CDN purge：

```bash
export CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=…
export OPPTRIX_UPDATE_BASE_URL=https://update.opptrix.org/desktop/
node apps/desktop/scripts/purge-update-cdn-cache.mjs
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
5. 侧栏「设置」上方提示 → 用户点 **重启更新** → `quitAndInstall` 完成替换。

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
- 同时产出 `dmg`（分发）与 `zip`（更新）。
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

**正式签名包**仍出现此提示：检查是否下错架构（Intel 需 x64，M 系列需 arm64），或 Release 是否含公证通过的构建。

### Windows

- 使用 NSIS 安装器（`oneClick: false`，允许用户选择安装目录）。
- 建议配置 Authenticode 签名，减少 SmartScreen 警告。

### Linux

- AppImage 适合「下载即用」与自动更新；
- `.deb` 供 `dpkg`/`apt` 用户手动安装，与 AppImage 更新通道不同，发布时两种格式可一并提供。

---

## 8. 常见问题

### Q：客户端提示「无法连接更新服务器」

- 是否已有 **至少一个** `desktop-v*` Release 且含对应平台 `latest-*.yml`；
- 仓库是否为私有（私有仓库的 Release 下载可能需要登录，公开仓库对自动更新更友好）；
- 本机网络能否访问 `github.com`。

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

- 可以临时改 workflow 矩阵，只保留 `windows-latest`；未构建的平台用户同样收不到自动更新。

### Q：版本号写错怎么办

- **不要** 直接改已发布 Release 里的 yml 版本糊弄过去；
- 正确做法：修正 `package.json` → 新发 `desktop-v{新版本}` → 在 Release Notes 说明跳过错误版本。

### Q：Electron 版本要不要随每个应用版本升级？

- 不必每次发版都升；当需要安全补丁或 Chromium 特性时，修改 `build.electronVersion` 后按正常流程发布即可，会自动随整包更新外壳。

---

## 9. 发布清单（可打印）

```text
[ ] apps/desktop/package.json version = X.Y.Z
[ ] git tag desktop-vX.Y.Z 已推送
[ ] CI macOS（x64 + arm64）/ Windows / Linux job 均成功
[ ] Release 附件含 Mac 双架构 dmg/zip + latest-mac.yml，以及 Win / Linux 产物与 yml
[ ] Release Notes 已填写
[ ] 在目标平台安装旧版 → 检查更新 → 下载 → 重启验证
```

---

## 10. 相关文件索引

| 文件 | 作用 |
|------|------|
| `apps/desktop/package.json` | 版本号、electron-builder 目标格式、GitHub publish 配置 |
| `apps/desktop/electron/updater.cjs` | 自动检查、下载、重启安装 |
| `apps/desktop/scripts/prebuild.mjs` | 构建前编译 packages、UI、打 runtime |
| `.github/workflows/release-desktop.yml` | 标签触发三平台构建与上传 |
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
