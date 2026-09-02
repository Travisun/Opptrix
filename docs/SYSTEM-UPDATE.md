# Opptrix 系统热更新（SYSTEM-UPDATE）

自托管（Docker Compose / 裸 Node）热更新的**唯一协议说明**。桌面端 Electron 默认关闭；通道下载与 UI 走服务端 `/api/system-update/*`。

相关实现：

| 层 | 位置 |
|----|------|
| 槽位 / 激活 / 校验 | `@opptrix/system-update`（`packages/system-update`） |
| CDN 热更新通道 | `apps/server/src/system-update-channel.ts`（`fetchHotLatest` / `hotPackageUrls`） |
| HTTP API | `docs/API.md` →「系统更新」 |
| 用户安装路径 | `docs/SELF-HOSTING.md` |
| 打包脚本 | `scripts/pack-opptrix-runtime.mjs` |
| Gitee 镜像上传 | `scripts/upload-runtime-gitee.mjs` |
| CDN (R2) 同步 | `scripts/sync-hot-to-r2.mjs` |
| CI | `.github/workflows/publish-runtime-assets.yml`（tag `opptrix-selfhost-v*`） |

---

## 目录布局（`$OPPTRIX_SYSTEM_DIR`）

```
$OPPTRIX_SYSTEM_DIR/
  boot      → slots/<currentVer>   # symlink（Windows: junction 或指针文件）
  backup    → slots/<prevVer>
  update/                          # 下载 / 解压暂存
  slots/<ver>/                     # 完整运行时树（与镜像 /app 同形）
  state.json                       # 持久状态机
```

**Compose 卷约定**（与用户数据分离）：

| 容器路径 | 卷 | 说明 |
|----------|-----|------|
| `/opptrix/system`（或旧 `/system`） | `opptrix-home` 子目录（或 `opptrix-system`） | 槽位与 `state.json`（`OPPTRIX_SYSTEM_DIR`） |
| `/opptrix/private`（或旧 `/data`） | 同上（或 `opptrix-data`） | 用户数据（`OPPTRIX_DATA_DIR`）— seed/activate **不触碰** |
| `/opptrix/models`（或旧 `/models`） | 同上（或 `opptrix-models`） | 本地模型（镜像不含权重；引导或 `OPPTRIX_FETCH_MODELS_ON_START=1`） |
| `/app` | 镜像只读层 | **种子树**；首次启动拷入 `slots/<ver>` |

默认 system 根解析顺序见 `@opptrix/system-update`：Docker → `$OPPTRIX_SYSTEM_DIR`（默认 `/opptrix/system` 或旧 `/system`）；否则 `$OPPTRIX_DATA_DIR/../system`；再否则 `~/.opptrix/system`。

---

## 运行时树形状

与 Dockerfile runtime 中 `COPY --from=build /app /app` 一致：在 **linux glibc** 上执行

```bash
npm ci && npm run build && npm prune --omit=dev
```

后的 monorepo 根（含生产 `node_modules`、各包 `dist`、`client-ui/dist`、`apps/server/dist`、启动脚本等）。

槽位根内须有：

- `opptrix-runtime.json` — `{ "app": "opptrix", "kind": "runtime", "version": "<semver>" }`
- 和/或 `apps/server/dist/index.js`

打包时脚本会写入 marker；校验逻辑见 `verifySlotDirectory`。

> **原生模块**：`better-sqlite3`、`duckdb`、`sharp` 等与 OS/Arch/ABI 绑定。生产附件必须在 **linux CI（ubuntu-latest）** 或已构建的 Docker `/app` 导出树上打包。macOS 本地 pack 仅适合 dry-run。

---

## Release 资产命名（硬约定）

自托管热更新**主通道**为 CDN（默认 `https://update.opptrix.org`）：

| 用途 | URL / 文件名 |
|------|----------------|
| 检查最新版 | `GET {base}/hot/check-update` → JSON `latest` |
| 运行时包 | `{base}/hot/packages/opptrix-runtime-v{VER}.bin`（内容为 tar.gz） |
| 摘要 sidecar | `{base}/hot/packages/opptrix-runtime-v{VER}.sha256` |

`{base}` 默认 `https://update.opptrix.org`，可用 `OPPTRIX_UPDATE_CDN_BASE` 覆盖。

镜像 / 底座 tag 仍为 `opptrix-selfhost-v{X.Y.Z}`（与 GHCR 一致）；**热更新下载不再依赖** GitHub / Gitee Release 附件列表。

本地打包仍写出 `opptrix-runtime-v{VER}.tar.gz`（及 `.tar.gz.sha256`）供 CI / 镜像 workflow；上传 CDN 时使用同内容的 `.bin` + `.sha256`（见 `scripts/pack-opptrix-runtime.mjs`）。

**示例（1.4.0，CDN）**

| 文件 |
|------|
| `opptrix-runtime-v1.4.0.bin` |
| `opptrix-runtime-v1.4.0.sha256`（**必需**，sidecar 内 basename 为 `.bin`） |

可选：CI 仍可额外上传 `opptrix-runtime-linux-x64-v1.4.0.tar.gz` 等别名，但 CDN 客户端只拉取上述 `.bin` 对。

---

## sha256 信任模型

**权威摘要源**是 CDN 上与 `.bin` 成对发布的 **`.sha256` sidecar**：

1. 客户端 `GET …/hot/check-update`，解析 `latest.version` 与 `bin` / `sha256` URL（可省略 URL，按命名约定拼接）。
2. 下载 `opptrix-runtime-v*.bin` 与 `opptrix-runtime-v*.sha256`。
3. `verifyArchiveSha256` / `extractUpdateArchive` 读取 sidecar 首行 hex，与本地 `.bin` 摘要比对；**不匹配 → 拒绝解压/应用**。

打包脚本写出的 CDN sidecar 格式：

```text
<64-hex>  opptrix-runtime-v1.4.0.bin
```

---

## 打包

```bash
# 推荐：与 CI / Docker 相同
npm ci && npm run build && npm prune --omit=dev
node scripts/pack-opptrix-runtime.mjs --version 1.4.0 --also-platform-name

# 帮助 / 演练
node scripts/pack-opptrix-runtime.mjs --help
node scripts/pack-opptrix-runtime.mjs --dry-run --version 1.4.0
```

| 选项 / 环境变量 | 含义 |
|-----------------|------|
| `--version` / `OPPTRIX_APP_VERSION` | semver → 文件名 |
| `OPPTRIX_MIN_BASE_IMAGE` | 写入 marker 的 `requires.minBaseImage` |
| `OPPTRIX_RELEASE_TAG` | 打包时若形如 `opptrix-selfhost-v*` 则用作 minBaseImage |
| `--root` / `OPPTRIX_PACK_ROOT` | 待打包树（默认仓库根） |
| `--out-dir` / `OPPTRIX_PACK_OUT` | 输出目录（默认 `dist-runtime/`） |
| `--also-platform-name` | 额外写出 `opptrix-runtime-{platform}-{arch}-v*.tar.gz` |
| `--dry-run` | 只打印计划 |
| `--skip-built-check` | 跳过 dist / node_modules 检查 |

排除项对齐 `.dockerignore` / 运行时需求：去掉 `.git`、`tests`、`docs`、`apps/desktop`、`author`、各类缓存与测试文件等。

也可从已构建镜像导出 `/app` 后对导出目录执行同一脚本（`--root /path/to/app`）。

---

## CI 与发布

打 tag `opptrix-selfhost-v*`（或手动触发 workflow）后，`.github/workflows/publish-runtime-assets.yml` 会：

1. **打包**：`node scripts/pack-opptrix-runtime.mjs --version X.Y.Z --also-platform-name`  
   产出 `.bin`、`.sha256`、`.tar.gz`（及 linux-x64 别名）。
2. **CDN（主通道）**：`scripts/sync-hot-to-r2.mjs` 上传至 Cloudflare R2：
   - `hot/packages/opptrix-runtime-vX.Y.Z.bin`（`application/octet-stream`）
   - `hot/packages/opptrix-runtime-vX.Y.Z.sha256`
   - `hot/check-update`（`application/json`，含 `latest` 与 CDN URL）
3. **GitHub Release**：附件含 `.bin`、`.sha256`、`.tar.gz`（及 linux-x64 别名）供归档/镜像 workflow。
4. **Gitee Release**：`scripts/upload-runtime-gitee.mjs` 上传相同附件集（需 `GITEE_TOKEN`）。
5. **可选**：配置 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` 时 purge `/hot/*` 相关 URL；CI 末尾 smoke `GET …/hot/check-update`。

**自托管实例默认从 CDN 拉热更新**（`OPPTRIX_UPDATE_CDN_BASE`，默认 `https://update.opptrix.org`），不再依赖 Release 附件列表。

### GitHub Secrets（CI）

| Secret | 用途 |
|--------|------|
| `R2_ACCOUNT_ID` | Cloudflare Account ID（32 位 hex） |
| `R2_ACCESS_KEY_ID` | R2 S3 API Access Key（**非** `cfut_*` API Token） |
| `R2_SECRET_ACCESS_KEY` | R2 S3 Secret Access Key |
| `R2_BUCKET` | R2 bucket 名称 |
| `GITEE_TOKEN` | Gitee 私有 token（上传 Release 附件；缺则跳过并打印手动步骤） |
| `CLOUDFLARE_API_TOKEN` | 可选；purge `hot/check-update` 与当版 package URL |
| `CLOUDFLARE_ZONE_ID` | 可选；与上配对 |

tag push **必须**配置 R2 四件套，否则 workflow 失败以便及时发现。fork / 手动 `workflow_dispatch` 可无 R2（跳过 CDN 并 warning）。

本地演练：

```bash
node scripts/pack-opptrix-runtime.mjs --version 1.4.0 --also-platform-name
node scripts/sync-hot-to-r2.mjs --dir dist-runtime --version 1.4.0 --dry-run
node scripts/purge-hot-cdn-cache.mjs --version 1.4.0   # 需 CF token
```

---

## 应用 / 首启 / 回滚流程

```
check → 下载归档 + `.sha256` → extract（校验摘要）→ slots/<new> + pendingVersion
     → 评估 opptrix-runtime.json requires
       ├─ 可热应用 → UI readyToApply → apply → 进程 exit 42
       └─ needsBaseRefresh → UI 引导 `opptrix update`（apply 返回 409，不 exit 42）
     → supervisor activatePending：boot→新槽，backup→旧槽
     → 新槽首启 first_boot_hooks（含 postActivate hooks）→ exit 43（软重启）
rollback → exit 44 → supervisor 软重启（已切回 backup）
```

### 离线导入（本地更新包）

设置 → 关于 → **从本地导入更新包**：上传与 CDN 相同格式的 `opptrix-runtime-v{版本}.bin`（或 `.tar.gz`）及同名 `.sha256` sidecar。服务端走与静默下载相同的 `verifyArchiveSha256` / `extractUpdateArchive` 路径，写入 `update/` 与 `slots/`，设置 `pendingVersion`，并评估 `requires` / `needsBaseRefresh`。封锁版本（`blockedVersions`）拒绝导入。

`POST /api/system-update/import`（multipart：`package` + `sha256`；账户已创建时需登录）。在线且 CDN `check-update` 返回同版本时，会交叉校验 sidecar 与 CDN 摘要；离线或 CDN 不可达时，本地 sidecar 即可。

### 底座升级（base refresh）

当新槽位的 `opptrix-runtime.json` 声明的 Node / 平台与当前主机不匹配、`requires.minBaseImage` 高于当前容器底座版本、或 `requires.requiresBaseRefresh` 为真时，热更新包仍保留在 `slots/<ver>`，但 **不能** 通过应用内「立即更新」切换。请在服务器执行：

```bash
opptrix update
```

该命令会拉取并切换到兼容的底座运行时，同时**保留数据卷与系统卷**（用户数据、`opptrix-system` 槽位状态等不被清空）。完成后可继续使用已下载的运行时包或重新检查更新。

**底座版本识别**（Compose 注入）：

| 变量 | 说明 |
|------|------|
| `OPPTRIX_BASE_VERSION` | 首选；如 `opptrix-selfhost-v1.4.0` 或裸 `1.4.0` |
| `OPPTRIX_RELEASE_TAG` | 回退；仅当形如 `opptrix-selfhost-v*` 时参与比对 |

打包时 `opptrix-runtime.json` 的 `requires.minBaseImage` 默认写为 `opptrix-selfhost-v{version}`（可用 `OPPTRIX_MIN_BASE_IMAGE` 覆盖）。服务端 `evaluateRuntimeRequires` 将 host base 与 `minBaseImage` 做 semver 比较；缺失 host base 且在 Docker 中会保守要求 base refresh。

UI 在用户看到 base refresh 提示后会记住「等待底座就绪」状态；容器重建期间若 API 暂不可达，显示「正在等待运行环境就绪…」；服务恢复且 `needsBaseRefresh===false` 且 `readyToApply` 时打开确认向导（**不自动应用**）。

### 失败版本跳过（blockedVersions）

首启 / postActivate 失败且已自动回滚时，失败版本记入 `state.json` 的 `blockedVersions`。该版本及更低中间版本在后续检查中会被跳过，UI 显示「此版本未能完成更新，已恢复当前版本…」，**不提供「立即更新」**。成功激活更高版本后，`clearBlockedUpTo` 清理对应条目。

### 主库快照回滚

激活前会对主 SQLite 库做快照（`update/db-snapshots/{from}-to-{to}/`）。首启失败触发槽位回滚时，若快照存在则一并恢复主库，避免 schema 半迁移状态。

| 退出码 | 常量 | 监督进程行为 |
|--------|------|----------------|
| 42 | `OPPTRIX_EXIT_RESTART_APPLY` | `activatePending` 后重启 |
| 43 | `OPPTRIX_EXIT_RESTART_POST_HOOK` | 不切槽，软重启 |
| 44 | `OPPTRIX_EXIT_RESTART_ROLLBACK` | 不切槽，软重启 |

Docker：`scripts/docker-entrypoint.sh` + tini。  
裸 Node：`scripts/opptrix-node-supervisor.mjs`（先 `system-boot.mjs` seed，再循环启动 `boot` 槽内服务）。

`state.json` 字段与 `uiPhase` 见 `packages/system-update/README.md`。

---

## 环境变量（摘要）

| 变量 | 说明 |
|------|------|
| `OPPTRIX_SYSTEM_DIR` | 系统槽位根 |
| `OPPTRIX_SEED_ROOT` | 首启种子（Docker 默认 `/app`） |
| `OPPTRIX_APP_VERSION` | 当前种子/镜像版本 |
| `OPPTRIX_BASE_VERSION` | 当前 Docker 底座 tag（semver 比对用） |
| `OPPTRIX_RELEASE_TAG` | 自托管 release tag（`opptrix-selfhost-v*`） |
| `OPPTRIX_FETCH_MODELS_ON_START` | `1` 时 entrypoint 首启拉核心模型（默认 `0`，引导下载） |
| `OPPTRIX_MIRROR_AUTO` | `1` 时运行时自动配置 pip/npm 镜像（Docker 默认 `1`，entrypoint 启动探测） |
| `OPPTRIX_DOCKER=1` | 强制 Docker 路径默认值 |
| `OPPTRIX_UPDATE_CHANNEL` | 默认 `selfhost` |
| `OPPTRIX_UPDATE_CDN_BASE` | CDN 根，默认 `https://update.opptrix.org` |
| `OPPTRIX_UPDATE_ENABLED` | `1`/`0` 强制开/关 |
| `OPPTRIX_UPDATE_CHECK_INTERVAL_HOURS` | 后台定期检查间隔（小时），默认 `24` |
| `OPPTRIX_UPDATE_CHECK_INTERVAL_MS` | 同上，毫秒粒度（优先于 `…_HOURS`） |
| `OPPTRIX_DESKTOP=1` | 桌面端默认关热更新 |

长运行服务（Docker / 自托管）在进程启动约 2s 后会检查一次远程 `check-update`，之后按上述间隔定时复查；请求 CDN 时 `User-Agent` 为 `Opptrix-system-update/{currentVersion}`，便于统计各版本实例。

API 细节见 `docs/API.md`。

---

## 底座 / 运行环境升级

应用内热更新（下载 runtime 归档 → 槽位切换）**不能**替换 Docker 镜像、宿主 Node、或 Compose 编排本身。当产品内提示「需要刷新底座 / 运行环境」时：

1. 在宿主机执行 **`opptrix update`**（或 `opptrix use <tag> --apply`）— 拉取新预构建镜像并 `compose up` 重建**容器**。
2. **默认保留** named volume：`opptrix-home`（或旧版 `opptrix-data` / `opptrix-models` / `opptrix-system`），以及 `compose.env` / `.opptrix.json` / `docker-compose.override.yml` 与 operator bind 挂载；**不会**因更新镜像而清空挂载数据。
3. `/opptrix/system`（或旧 `/system`）槽位与 `state.json` 留在卷内，容器重建后仍可沿用；镜像内 `/app` 为种子树。
4. **启动时晋升（镜像权威）**：`system-boot ensure` 若镜像种子版本（`OPPTRIX_APP_VERSION`）**高于**当前 `boot`，会**冲掉**旧热更新 `pending` / 下载任务，把 `/app` 拷入 `slots/<ver>` 并设 `pendingVersion`（种子写入 `opptrix-runtime.json` 的 `requires.minBaseImage`）。随后 `activate-pending` 仅在 **不** `needsBaseRefresh` 时切入新槽并进入 `first_boot_hooks`（库迁移 + `hooks/post-activate`）；若仍需更高底座则跳过激活，保留 pending 供产品内提示。
5. 只有显式 `opptrix down --volumes` 才会删除上述卷（危险、不可恢复）。

因此：`opptrix update` **不是**再走 CDN 热更新下载，而是换底座镜像 → **冲掉旧 pending** → 用**新镜像携带的运行时**走正常晋升/激活与 DB/钩子。热更新包的底座依赖记录在 marker `requires.minBaseImage`（非 postActivate hooks）。

---

## 运维速查

```bash
# 打 tag 后 GitHub Actions 自动发布 CDN + GH/Gitee Release 附件
git tag -a opptrix-selfhost-v1.4.0 -m "selfhost 1.4.0"
git push origin opptrix-selfhost-v1.4.0
git push gitee opptrix-selfhost-v1.4.0   # 同步 tip；附件由 CI + GITEE_TOKEN 上传

# 底座 / 镜像升级（保留全部命名卷）
opptrix update

# 本地仅验证脚本
node scripts/pack-opptrix-runtime.mjs --help
```
