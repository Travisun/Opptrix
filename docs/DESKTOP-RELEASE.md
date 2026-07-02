# Opptrix 桌面端发布指南

本文说明 **Electron 桌面端** 如何版本化、构建、上传到 GitHub Releases，以及 **自动更新（electron-updater）** 对产物的要求。

适用对象：维护者、发布负责人。开发与架构背景见 [DESKTOP.md](./DESKTOP.md)。

---

## 1. 发布模型概览

| 项目 | 说明 |
|------|------|
| 更新方式 | `electron-updater` 全量更新（按平台下载完整安装包，用户确认后重启安装） |
| 更新源 | GitHub Releases（`apps/desktop/package.json` → `build.publish`） |
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

`electron-builder` 的 `productName` 为 **Opptrix**。在版本 `0.6.1`、当前默认配置下，典型文件名如下（架构以 CI 实际构建为准，Apple 运行器一般为 `arm64`，Ubuntu 为 `x64`/`amd64`）：

### macOS

| 用途 | 格式 | 典型文件名 | 是否自动更新必需 |
|------|------|------------|------------------|
| 首次安装 / 手动分发 | `.dmg` | `Opptrix-0.6.1-arm64.dmg` | 否（给人下载安装） |
| **自动更新** | `.zip` | `Opptrix-0.6.1-arm64-mac.zip` | **是** |
| 更新元数据 | `.yml` | `latest-mac.yml` | **是** |
| 差分（可选） | `.blockmap` | `*.blockmap` | 建议保留 |

> macOS 自动更新依赖 **zip + latest-mac.yml**，仅有 dmg 无法完成热更新。

### Windows

| 用途 | 格式 | 典型文件名 | 是否自动更新必需 |
|------|------|------------|------------------|
| 安装包 | NSIS `.exe` | `Opptrix Setup 0.6.1.exe` | **是** |
| 更新元数据 | `.yml` | `latest.yml` | **是** |
| 差分（可选） | `.blockmap` | `Opptrix Setup 0.6.1.exe.blockmap` | 建议保留 |

### Linux

| 用途 | 格式 | 典型文件名 | 是否自动更新必需 |
|------|------|------------|------------------|
| 便携运行 | AppImage | `Opptrix-0.6.1.AppImage` | **是**（AppImage 用户） |
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

推送 `desktop-v*` 标签后，GitHub Actions 会在 **Windows / Ubuntu** 两个 runner 上并行执行（**不含 macOS**，Mac 包需本地构建后补传）：

```bash
npm ci
npm run build:desktop -- --publish always
```

`electron-builder` 会：

1. 构建当前平台安装包；
2. 生成 `latest.yml`（Windows）或 `latest-linux.yml`（Linux）；
3. 创建或更新 **同名 GitHub Release**（与标签 `desktop-v0.6.1` 关联）；
4. 上传该平台产物与 yml。

Win / Linux job 全部成功后，Release 上应有对应安装包与 yml。**macOS** 用户需从 Release 下载你本地构建的 `.dmg` / `.zip`（或你后续补传的 `latest-mac.yml` 与 zip），否则 Mac 客户端无法通过自动更新获取新版本。

### 4.3 在 GitHub 上核对 Release

打开：`https://github.com/Travisun/Opptrix/releases/tag/desktop-v0.6.1`

确认附件至少包含：

```text
# Windows（CI 自动）
Opptrix Setup {version}.exe
latest.yml

# Linux（CI 自动）
Opptrix-{version}.AppImage
opptrix_{version}_amd64.deb
latest-linux.yml

# macOS（可选，本地构建后手动上传）
Opptrix-{version}-arm64.dmg
Opptrix-{version}-arm64-mac.zip
latest-mac.yml
```

（另可有 `.blockmap` 等辅助文件。）

编辑 Release 说明，补充 **面向用户** 的更新内容。

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

1. 启动约 10 秒后后台检查 GitHub Release；
2. 读取嵌入在安装包内的 `app-update.yml`（构建时由 `publish.github` 生成）；
3. 对比 `latest-*.yml` 中的 `version` 与本地 `apps/desktop/package.json` 版本；
4. 若有新版本：`autoDownload` 后台下载 **当前平台** 整包；
5. 侧栏「设置」上方提示 → 用户点 **重启更新** → `quitAndInstall` 完成替换。

| 平台 | 实际下载的文件 |
|------|----------------|
| macOS | `*-mac.zip` |
| Windows | `Opptrix Setup *.exe` |
| Linux | 主要为 `*.AppImage` |

用户数据（SQLite、配置等）一般在用户目录，整包替换 **不会** 清空对话与设置。

---

## 7. 平台差异与签名

### macOS

- 配置同时产出 `dmg`（分发）与 `zip`（更新）。
- **强烈建议** 配置 Apple 开发者证书与公证（Notarization），否则首次安装与更新后可能遭 Gatekeeper 拦截。
- 未签名时仍可发布，但需在 Release Notes 中说明系统安全提示的处理方式。

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

- Release 是否包含 `*-mac.zip` 与 `latest-mac.yml`（仅有 dmg 不够）；
- yml 内 `version` 是否大于客户端当前版本。

### Q：能否只发 Windows、暂不发 Mac？

- **可以**。当前 CI 默认只构建 **Windows + Linux**；Mac 可在本机执行 `npm run build:desktop -- --publish always` 后补传到同一 Release。
- 未上传 Mac 产物时，**Mac 用户无法自动更新**，但仍可手动下载安装（若你提供了 dmg/zip）。

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
[ ] CI Win / Linux job 均成功（Mac 若需要则本地补传）
[ ] Release 附件含 Windows + Linux 安装包与 latest.yml / latest-linux.yml
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
