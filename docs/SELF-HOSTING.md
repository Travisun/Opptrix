# Opptrix 自托管（Docker Compose）

推荐用 **Docker Compose** 部署单用户实例：一份镜像、持久化数据卷、可选宿主机目录挂载。本文是面向最终用户与运维的**唯一推荐安装路径**。

## 快速开始（Linux 服务器 · 推荐）

### 方式 A：npm 全局 CLI（需已有 Node ≥ 24 + Docker）

包说明与命令详解见 npm：[`@opptrix/selfhost`](https://www.npmjs.com/package/@opptrix/selfhost)（仓内 `packages/selfhost/README.md`）。

```bash
npm i -g @opptrix/selfhost
# 国内 registry 可选: npm i -g @opptrix/selfhost --registry https://registry.npmmirror.com
opptrix setup         # 交互：镜像源 / 数据目录 / 端口 / Docker 开机自启（或 setup --yes）
opptrix up            # 无 .opptrix.json 时会先 setup；再拉 GHCR 预构建镜像并启动
# 静默初始化: opptrix init
# 强制本地编译: OPPTRIX_DEV_ALLOW_BUILD=1 opptrix up --build
# 强制指定源: opptrix up --mirror cn   或  --mirror foreign
```

`up` 默认**优先拉取**预构建镜像（路径随区域变化）：

| 区域 | 拉镜像 |
|------|--------|
| **国内 (`cn`)** | 对 `ghcr.nju.edu.cn` 与 `ghcr.1ms.run` **TCP 测速**，选更快者；失败再试另一站，最后可选官方 `ghcr.io` |
| **海外 (`foreign`)** | 官方 `ghcr.io/travisun/opptrix:<应用 tag>` |

只需写入 Compose 清单到部署目录（默认 `~/.opptrix/instances/default`，可用 `OPPTRIX_DEPLOY_DIR` 覆盖），**不必**先 clone 整仓。拉取失败（镜像未发布、网络不通等）或显式 `--build` / `OPPTRIX_FORCE_BUILD=1` / `ref=main` 时，再自动 clone 完整源码并本地构建。**默认应用快照**为 `opptrix-selfhost-v*`（包内 `preferredAppTag`，当前最低 `opptrix-selfhost-v1.3.6`），**不会**自动回退到 `main`，也**不会**用 CLI 发版标签 `selfhost-v*` 当应用源码。

强制指定国内镜像站：`OPPTRIX_GHCR_MIRROR=ghcr.nju.edu.cn`（或 `ghcr.1ms.run`）。`opptrix doctor` 会打印测速结果。

| `--mirror` / 区域 | 默认 clone 源 | 回退 |
|-------------------|---------------|------|
| `cn`（国内） | [Gitee Travisun/Opptrix](https://gitee.com/Travisun/Opptrix) | GitHub |
| `foreign`（国外） | [GitHub Travisun/Opptrix](https://github.com/Travisun/Opptrix) | Gitee |

可用 `OPPTRIX_GIT_URL_CN` / `OPPTRIX_GIT_URL` / `OPPTRIX_GIT_URL_OVERRIDE` 覆盖。包内带有与发版同步的 Compose / Dockerfile 清单。

### 版本轨道

| 轨道 | 用途 |
|------|------|
| `opptrix-selfhost-vX.Y.Z` | **自托管应用底座**（GHCR 镜像 tag / clone / 升级 / 回退）；镜像由 **手动** `publish-selfhost-image` 发布 |
| `runtime-v*` | **运行时热更新**包（CDN / GitHub·Gitee Release）；打 tag 即触发 `publish-runtime-assets` |
| `selfhost-v*` | **仅** `@opptrix/selfhost` CLI 的 npm 发版触发，**不是**应用源码 |

预构建镜像（维护者 `workflow_dispatch` 推送；底座与 runtime 版本可错开）：

| 项 | 值 |
|----|-----|
| 仓库 | CI 推送至 `ghcr.io/travisun/opptrix`；国内 pull 经 `ghcr.nju.edu.cn` / `ghcr.1ms.run` 测速代理主机名 |
| 覆盖 | `OPPTRIX_IMAGE`（完整引用）、`OPPTRIX_IMAGE_REPO`、`OPPTRIX_GHCR_MIRROR`（仅改 registry 主机） |
| Tag | 与 git 一致的 `opptrix-selfhost-vX.Y.Z`、纯 semver `X.Y.Z`、浮动 `selfhost` |
| 大模型 | **不在镜像内**；产品引导下载至 `/opptrix/models`（卷 `opptrix-home`），升级不重下 |

### 容器工具链

| 组件 | 说明 |
|------|------|
| **Node（默认）** | 官方 `node:24.11.1-bookworm-slim`（见 `scripts/lib/ci-pins.env`），`/usr/local/bin/node` 为稳定 PATH |
| **Node（可选）** | nvm 在 `/opt/nvm`（`v0.40.2`），已预装 **22 LTS**；`nvm use 22` 切换，不替换默认 24 |
| **Python** | Debian bookworm `python3`（3.11）+ `pip3` + `venv` + `python3-dev` |
| **ffmpeg** | Debian apt `ffmpeg`（`FFMPEG_PATH=/usr/bin/ffmpeg`）；**不**打包 npm `ffmpeg-static` |
| **Chromium（Playwright）** | 镜像内 `/opt/opptrix/playwright-browsers`（`PLAYWRIGHT_BROWSERS_PATH`） |
| **Agent 隔离** | 默认 `OPPTRIX_AGENT_SANDBOX=off`：自由编程 + **双用户 DAC**（`opptrix_run` 降权为 `opptrix-agent`，无法读写 private/system） |
| **构建镜像** | `OPPTRIX_BUILD_MIRROR` / 显式 `OPPTRIX_*_REGISTRY`；或 `OPPTRIX_MIRROR_AUTO_BUILD=1` 构建时探测 |
| **运行时镜像** | `OPPTRIX_MIRROR_AUTO=1` 为 pip/npm 自动选国内/海外源 |

查看与切换应用版本：

```bash
opptrix tags                          # 列出 ≥ 最低版本的可用快照
opptrix use opptrix-selfhost-v1.3.6   # 写入 .opptrix.json 的 appRef
opptrix up                            # 优先 pull 预构建并启动
opptrix up --build                    # 强制本地编译
opptrix up --ref opptrix-selfhost-v1.3.6
# 开发分支（需显式，风险自担，走本地编译）:
opptrix use main && opptrix up
# 或: OPPTRIX_GIT_REF=main opptrix up
```

容器内可通过 `OPPTRIX_APP_VERSION` / `OPPTRIX_RELEASE_CHANNEL=selfhost` / `OPPTRIX_RELEASE_TAG` 识别当前快照（CLI 注入）。

**运行时依赖**（ffmpeg / Python / 原生模块 / 模型 / Playwright 分层）：见 **[SELFHOST-RUNTIME-DEPS.md](./SELFHOST-RUNTIME-DEPS.md)**。

### 方式 B：一键 bootstrap（自动装 Docker + 托管 Node + CLI）

```bash
export OPPTRIX_BUILD_MIRROR=cn   # 可选；默认 auto
curl -fsSL https://raw.githubusercontent.com/Travisun/Opptrix/main/scripts/bootstrap/linux.sh | bash
# 国内若 GitHub raw 慢：先 git clone https://gitee.com/Travisun/Opptrix.git
# 再: cd Opptrix && ./scripts/bootstrap/linux.sh

export PATH="$HOME/.local/bin:$PATH"
opptrix doctor
opptrix up --mirror cn
```

可选环境变量见脚本头注释（`OPPTRIX_REPO_DIR`、`OPPTRIX_NODE_VERSION`、`OPPTRIX_BOOTSTRAP_UP=1` 等）。

浏览器打开 [https://127.0.0.1:8712](https://127.0.0.1:8712)（自签名 HTTPS；公网则为 `https://<公网IP>:8712`）。HTTP 默认不开启。

### macOS / Windows（自备 Docker + Node）

不提供自动安装 Docker。请自行安装 **Docker** 与 **Node.js ≥ 24**，再：

```bash
npm i -g @opptrix/selfhost
opptrix init
opptrix up
```

或在仓库内：`npm run build -w @opptrix/selfhost && npm link -w @opptrix/selfhost`。

### 常用运维（`opptrix` CLI）

| 命令 | 作用 |
|------|------|
| `opptrix doctor` | 检查 Docker / 仓库文件 |
| `opptrix tags` | 列出可用应用快照（`opptrix-selfhost-v*`） |
| `opptrix use <tag\|main>` | 写入应用版本偏好（`--apply` 可立即启动） |
| `opptrix up` | 优先 pull 预构建并后台启动 |
| `opptrix up --build` | 强制本地编译后启动 |
| `opptrix up --ref <tag\|main>` | 本次使用指定版本 |
| `opptrix update` | 升级运行环境/镜像底座（重建容器）；**默认保留** `opptrix-home`（或旧版三卷）与挂载；应用内热更新另见产品内提示与 [`SYSTEM-UPDATE.md`](./SYSTEM-UPDATE.md)「底座 / 运行环境升级」 |
| `opptrix stop` / `start` / `restart` | 停 / 启 / 重启 |
| `opptrix down` | 停止并移除容器（默认**保留**数据卷） |
| `opptrix logs -f` | 跟踪日志 |
| `opptrix status` | 容器状态 |
| `opptrix health` | 探测 `https://127.0.0.1:8712/api/health`（自签名，CLI 会跳过证书校验） |
| `opptrix uninstall-cli` | 取消全局命令 |

仓内未装全局时：`npm run opptrix -- up --mirror cn`。仅验证服务、暂不拉模型：`opptrix up --mirror cn --skip-models`。

发布 **CLI** npm 包前请确认：

1. 在 npm 创建组织 [`@opptrix`](https://www.npmjs.com/org/create)，并把发版账号加为成员  
2. GitHub Secret `NPM_TOKEN` 对该组织有 **publish** 权限  

```bash
npm run release:selfhost          # 默认 patch 升版本（打 selfhost-v*，仅 CLI）
# 提交后：
git push origin main && git push gitee main
git push origin selfhost-vX.Y.Z && git push gitee selfhost-vX.Y.Z
```

打 tag `selfhost-v*` 会触发 `.github/workflows/publish-selfhost.yml`；流水线会在 `npm publish` 后向 `registry.npmjs.org` 回查，不可见则失败。也可在 Actions 里手动 `workflow_dispatch`。

应用底座 `opptrix-selfhost-v*` 由维护者另行打 tag（源码快照），**不会**自动推 GHCR：在 Actions 手动 `workflow_dispatch` 运行 `.github/workflows/publish-selfhost-image.yml`，将多架构镜像推送到 `ghcr.io/<owner>/opptrix`（标签含完整 tag、semver、`selfhost`）。**镜像未发布前**，用户 `opptrix up` 的 pull 会失败并自动回退本地编译。

运行时热更新打 tag `runtime-v*`（可与底座 semver 错开）触发 `.github/workflows/publish-runtime-assets.yml`；包内 `minBaseImage` 仍指向所需最低 `opptrix-selfhost-v*`。

### 不用 CLI 时的 Compose 原语

```bash
cp compose.env.example compose.env
# 预构建（示例）:
OPPTRIX_IMAGE=ghcr.io/travisun/opptrix:opptrix-selfhost-v1.3.6 docker compose pull
OPPTRIX_IMAGE=ghcr.io/travisun/opptrix:opptrix-selfhost-v1.3.6 docker compose up -d
# 或本地编译:
OPPTRIX_BUILD_MIRROR=cn ./scripts/docker-compose-with-mirrors.sh up -d --build
curl -fsk https://127.0.0.1:8712/api/health
```

### 构建镜像源（国内外切换）

| 变量 | 作用 | 国内示例 |
|------|------|----------|
| `OPPTRIX_BUILD_MIRROR` / `--mirror` | `cn` / `foreign` | `cn` |
| `OPPTRIX_DOCKER_IMAGE_PREFIX` | Node 基础镜像前缀（须以 `/` 结尾） | `docker.1ms.run/library/`（1ms 的 Hub **library/** 代理；勿用裸前缀或 `amd64/`） |
| `OPPTRIX_NPM_REGISTRY` | `npm ci` 注册表（可选覆盖） | 国内默认华为云 `https://mirrors.huaweicloud.com/repository/npm/`；不可达时 `MIRROR_AUTO` 回退官方；**勿依赖** `npm.aliyun.com`（DNS 失效）/ `mirrors.163.com/npm`（404） |
| `OPPTRIX_APT_MIRROR` | Debian apt 主机名（无 `https://`） | `mirrors.aliyun.com` |
| `OPPTRIX_MIRROR_AUTO_BUILD` | 构建时 `MIRROR_AUTO=1` 探测源 | `1` |
| `OPPTRIX_MIRROR_AUTO` | 运行时 pip/npm 自动选源（entrypoint 探测） | `1`（默认开启；设 `0` 关闭） |

国内本地构建默认拉 `docker.1ms.run/library/node:…`；**GitHub CI**（`ci-selfhost-release` / `publish-selfhost-image`）将 `NODE_IMAGE_PREFIX` 留空，直接用官方 Docker Hub。

`opptrix init --mirror cn` 会把偏好写入 `.opptrix.json`（已 gitignore）。构建参数还可进入 shell / 项目 `.env`；CLI 在执行 `up`/`build`/`update` 时会自动注入。

**核心本地模型不在镜像内。** 默认启动**不会**在 entrypoint 阻塞下载；请在产品**引导流程**中按需下载（E5 / OCR / 语音 / 离线翻译等，约 1GB+）。若需旧版「首启自动拉模型」，设置 `OPPTRIX_FETCH_MODELS_ON_START=1`。`opptrix up --skip-models` 与 `OPPTRIX_SKIP_MODEL_FETCH=1` 仍强制跳过。运行时模型下载默认国内优先：ModelScope → hf-mirror → Hugging Face。健康检查 `start_period` 默认约 3 分钟（首启拉模型时请调大或设 `OPPTRIX_FETCH_MODELS_ON_START=1`）。

不必自建「数据集」镜像：权重应挂 **Model** 仓。四套核心模型在 ModelScope 均有官方/上游仓；自建 Opptrix 合集仓仅在需要钉死版本或内网二次分发时有价值。

离线新闻翻译跑在 **服务端 HTTP**（`POST /api/news/translate` + `/api/news/translation/*`），不依赖 Electron；Docker `with-models` 会把 `HY-MT1.5-1.8B-Q4_K_M.gguf` 放到 models 卷的 `llms/`（`OPPTRIX_LLM_DIR`，默认 `/opptrix/models/llms`），与 `resolveTranslationModelPath` 搜索顺序一致。设置页从目录下载的 GGUF 同样写入 `OPPTRIX_LLM_DIR`，而不是容器内易失的 `~/.opptrix/llms`。翻译请求可走 SSE（`Accept: text/event-stream` 或 `?stream=1`，事件 `progress` / `result` / `error`）；未声明流式时仍返回完整 JSON。文章级译文缓存在 `$OPPTRIX_DATA_DIR/news-translation-cache.json`（Compose 下即 `/opptrix/private/…`），命中时响应含 `fromCache: true`。

可选环境变量见仓库根目录 `compose.env.example`。

## 数据与模型卷

推荐 **单卷** `opptrix-home` → `/opptrix`：

| 容器路径 | 用途 | Agent（opptrix-agent） |
|----------|------|------------------------|
| `/opptrix/private` | 用户数据根（`OPPTRIX_DATA_DIR`）：库、认证、保险箱、会话状态等 | **不可读写**（DAC 0700 + Deny） |
| `/opptrix/workspace` | Agent 工作区（`OPPTRIX_AGENT_WORKSPACE_DIR`） | 可读写 |
| `/opptrix/mounts/<name>` | 可选 bind（`OPPTRIX_MOUNTS_DIR`） | 可读写（视挂载权限） |
| `/opptrix/models` | 本地核心模型 | 可读 |
| `/opptrix/system` | 运行时槽位与热更新（`OPPTRIX_SYSTEM_DIR`） | **不可读写** |

旧版三卷（`/data`、`/models`、`/system`）仍可用独立清单 `docker-compose.legacy-volumes.yml`；entrypoint 会对 `/data/agent-workspace` 与 `/data/mounts` 做同样的 agent 属主引导。

**升级镜像不会清空卷。** 换镜像 / `docker compose pull` 后仍沿用原卷。

### 用 CLI 改数据落盘路径

默认使用 Compose 命名卷 `opptrix-home`。若希望数据落在宿主机目录：

```bash
opptrix data path /var/lib/opptrix --yes
# 等价: opptrix data migrate --to /var/lib/opptrix --yes
```

CLI 会：`compose down`（不加 `-v`）→ `rsync`/`cp` 复制 → 写入托管的 `docker-compose.override.yml`（将 `opptrix-home` 用 `driver_opts` 绑到该目录）→ `up -d` → 等待 `/api/health`。迁回命名卷：`opptrix data migrate --to volume --yes`。先看计划：`--dry-run`。

镜像内 `/app` 仍是**种子树**；容器启动时 `system-boot ensure`：无 boot 则从 `/app` 种子到 `slots/<version>`；若镜像版本高于当前 boot，则**冲掉**旧热更新 pending，以镜像种子设 pending，再由 `activate-pending`（底座满足 `minBaseImage` 时）切入并走 first-boot。服务进程 exit **42** 时 supervisor 会 `activatePending`（若有 `pendingVersion` 且非 needsBaseRefresh）再重启；**43/44** 为软重启不切换槽位。

完整热更新协议见 **[`docs/SYSTEM-UPDATE.md`](./SYSTEM-UPDATE.md)**。库层 API 摘要见 `@opptrix/system-update`。

### 从三卷迁到单卷（可选）

```bash
# 示例：把旧卷内容拷入新 home（项目名/卷名按 docker volume ls 调整）
docker volume create opptrix_opptrix-home
docker run --rm \
  -v opptrix_opptrix-data:/old-data \
  -v opptrix_opptrix-models:/old-models \
  -v opptrix_opptrix-system:/old-system \
  -v opptrix_opptrix-home:/opptrix \
  alpine sh -c '
    mkdir -p /opptrix/private /opptrix/models /opptrix/system /opptrix/workspace /opptrix/mounts
    cp -a /old-data/. /opptrix/private/
    cp -a /old-models/. /opptrix/models/
    cp -a /old-system/. /opptrix/system/
    if [ -d /opptrix/private/agent-workspace ]; then mv /opptrix/private/agent-workspace/* /opptrix/workspace/ 2>/dev/null || true; fi
    if [ -d /opptrix/private/mounts ]; then cp -a /opptrix/private/mounts/. /opptrix/mounts/; fi
  '
```

迁完后改用默认 `docker-compose.yml`（勿再挂旧三卷）。

### 备份

```bash
docker compose stop

docker run --rm \
  -v opptrix_opptrix-home:/opptrix \
  -v "$(pwd)/backup:/backup" \
  alpine tar czf /backup/opptrix-home-$(date +%Y%m%d).tgz -C /opptrix .
```

> 卷名前缀取决于 Compose 项目名。用 `docker volume ls | grep opptrix` 确认。旧三卷备份仍可对 `opptrix-data` / `opptrix-models` / `opptrix-system` 分别打包。

### 恢复

```bash
docker compose stop
docker run --rm \
  -v opptrix_opptrix-home:/opptrix \
  -v "$(pwd)/backup:/backup" \
  alpine sh -c 'rm -rf /opptrix/* && tar xzf /backup/opptrix-home-YYYYMMDD.tgz -C /opptrix'
docker compose start
```

## 升级（不丢数据与配置）

用 CLI（推荐）：

```bash
opptrix tags
opptrix use opptrix-selfhost-vX.Y.Z --apply
# 或: opptrix update
```

**默认保留：**

| 内容 | 位置 | 说明 |
|------|------|------|
| 账户 / 会话 / 设置 / 工作区 / 模型 / 槽位 | 卷 `opptrix-home` → `/opptrix` | `down` 不带 `--volumes` 即保留 |
| 运行时配置 | 部署目录 `compose.env`、`.opptrix.json` | 升级不覆盖 |
| 额外目录映射 | `docker-compose.override.yml` | 升级不覆盖；Compose 自动合并 |

启动时 entrypoint **默认跳过**模型下载（引导内按需下载）。卷内已有 marker 文件时同样跳过。仅当显式开启时才拉取：

```bash
# compose.env — 旧版首启自动下载
OPPTRIX_FETCH_MODELS_ON_START=1
# 或强制重下
OPPTRIX_FORCE_MODEL_FETCH=1
```

冒烟、完全不拉模型：`OPPTRIX_SKIP_MODEL_FETCH=1` 或 `opptrix up --skip-models`（与默认行为一致）。

不要删除 named volume；`opptrix down --volumes` 会清空数据。

裸 Node（非 Docker）可用同一 `$OPPTRIX_SYSTEM_DIR` 布局，用仓库内 supervisor 包装启动：

```bash
export OPPTRIX_SYSTEM_DIR=~/.opptrix/system
export OPPTRIX_SEED_ROOT="$(pwd)"   # 首次会从当前树种子到 slots/
node scripts/opptrix-node-supervisor.mjs
```

相关环境变量：`OPPTRIX_HOME`（默认 `/opptrix`）、`OPPTRIX_DATA_DIR`、`OPPTRIX_AGENT_WORKSPACE_DIR`、`OPPTRIX_MOUNTS_DIR`、`OPPTRIX_SYSTEM_DIR`、`OPPTRIX_SEED_ROOT`、`OPPTRIX_DOCKER=1`、`OPPTRIX_AGENT_UID`/`GID`、`OPPTRIX_ONCE=1`、`OPPTRIX_SUPERVISOR_MAX_RETRIES`。

## 额外目录挂载

约定：宿主机目录挂到 **`/opptrix/mounts/<name>`**（旧版三卷则为 `/data/mounts/<name>`）。

请写在 **`docker-compose.override.yml`**：

```yaml
# docker-compose.override.yml
services:
  opptrix:
    volumes:
      - ./host-research:/opptrix/mounts/research:ro
```

只读（`:ro`）适合资料库；需要工作区内写入时去掉 `:ro`。

## 账户与访问控制

- **未创建账户**：任意客户端可调用 API 以完成首次配置与建账户（Docker 端口映射时浏览器即使打开 `127.0.0.1`，容器内看到的也是网桥 IP，故不再用「本机 IP」卡首次引导）。建账户等接口对非本机仍有软限流。
- **创建账户后**：须登录后方可使用（含版本升级引导）；可在设置中管理会话与二次验证。
- 首次打开 UI 按引导 **认领 / 创建账户**（claim），再按需开启 TOTP。

公开端口时存在「先到先得」抢占账户的风险；建议尽快完成认领，或仅在受信网络暴露。切勿把未加反向代理、长期未认领的实例裸挂公网。

## 安全模型（命令与工作区）

Docker 自托管默认 **`OPPTRIX_AGENT_SANDBOX=off`**：`opptrix_run` **不**启用 SRT / bwrap，可在已授权树内自由使用 shell/node/npm/python；硬边界是 **双 Linux 用户（DAC）**：

| 层 | 作用 |
|----|------|
| 服务进程 | 常以 root 跑 HTTP / 读 private / 热更新；**不**把私钥明文塞进 Agent 工具结果 |
| `opptrix-agent` | `opptrix_run` 子进程 `uid/gid=10001`；对 `/opptrix/private`、`/opptrix/system` 无权限 → Python `open()` 亦 EACCES |
| entrypoint | 创建目录、`chown`/`chmod`、`umask 002` + setgid，保证 workspace/mounts 对 Agent 可写 |
| Deny（纵深） | 文件工具仍拒绝 private/system；**不能**单独当作绝对隔离 |
| Docker 外层 | 容器边界与卷挂载 |

设 **`OPPTRIX_AGENT_SANDBOX=full`** 可额外恢复工作区 grant 围栏。遗留 `OPPTRIX_SHELL_ISOLATION=srt` 时跳过 uid 降权（避免破坏 SRT wrap）。

**密钥勿放进工作区目录**（含 mounts 与会话工作区）：明文密钥应走应用内保险箱。

仍须假设：容器逃逸、Agent 对**已授权**工作区内容的外传、服务进程自身泄露——不在本模型保证范围内。
## TLS 与端口

生产默认**只开 HTTPS :8712**（容器与宿主机同号映射，监听 `0.0.0.0`，可用公网 IP 访问）。HTTP 默认不监听、不映射。

| 端口 | 协议 | 用途 |
|------|------|------|
| **8712** | HTTPS（自签名） | **默认入口与健康检查**：`https://<公网IP>:8712`、`/api/health` |
| **8711** | HTTP | 默认关闭。仅反代需要明文 upstream 时开启 |

自签名证书首次启动写入卷内 `/opptrix/system/tls/`（`key.pem` / `cert.pem`）。浏览器会提示「不安全」——属预期，信任后即可使用。产品**不内置** Let’s Encrypt（国内多数无备案域名）；需要正规证书时在宿主机用 Nginx/Caddy 终结 TLS。upstream 可：

1. **推荐**：`https://127.0.0.1:8712`（反代关闭证书校验，或导入自签），或  
2. 设 `OPPTRIX_ENABLE_HTTP=1`，在 compose override 中映射 `8711`，upstream 指 `http://127.0.0.1:8711`。

| 变量 | 说明 |
|------|------|
| `OPPTRIX_HTTPS_PORT` | 容器内 HTTPS 端口（默认 `8712`；Docker 下不可关） |
| `OPPTRIX_ENABLE_HTTP` | `1` 时监听 HTTP（`STOCK_RESEARCH_PORT`，默认 8711） |
| `OPPTRIX_HOST_HTTPS_PORT` | 宿主机 HTTPS 映射端口（改后需 recreate） |
| `OPPTRIX_HOST_HTTP_PORT` | 仅在自行增加 HTTP 端口映射时使用 |
| `OPPTRIX_AUTH_COOKIE_SECURE` | 默认 `1`（HTTPS 自签入口）；仅明文调试时可改 |
| `OPPTRIX_TRUSTED_PROXIES` | 反代 IP/CIDR；**为空时不信任** `X-Forwarded-*` |
| `OPPTRIX_TRUSTED_LOCAL_CIDRS` | 额外视为「本地」的网段（可选） |

示例（宿主机 Nginx 终结 TLS）：

```yaml
environment:
  OPPTRIX_TRUSTED_PROXIES: "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
  OPPTRIX_AUTH_COOKIE_SECURE: "1"
```

## 磁盘与内存（含模型）

粗略预期（单用户、默认 with-models）：

| 资源 | 建议 |
|------|------|
| 磁盘 · 数据卷 | 起步 ≥ 5 GB；行情包 / 文档库 / 附件会持续增长 |
| 磁盘 · 模型卷 | 起步 ≥ 4 GB（E5 + OCR + SenseVoice q8 + HY-MT Q4）；预留余量 |
| 内存 | 建议 ≥ 4 GB；加载语义 / OCR / 语音 / 离线翻译时峰值更高，8 GB 更从容 |
| CPU | 2 核起；本地推理时按需加核 |

可设 `OPPTRIX_WITH_MODELS=0` 跳过内置模型拉取（体积更小，文档 OCR / 本地语音等能力需自行准备）。

## 常用命令

```bash
docker compose logs -f opptrix
docker compose restart
docker compose down          # 保留 volumes
docker compose down -v       # ⚠ 删除数据与模型卷
```

### 生命周期 smoke（开发者）

验证「启动 → 热更新 → 底座刷新」时，对预构建镜像运行：

```bash
docker build -t opptrix:local-smoke .
node scripts/smoke-selfhost-lifecycle.mjs
```

细节见 [SELFHOST-RUNTIME-DEPS.md](./SELFHOST-RUNTIME-DEPS.md) §5。

## 故障排查

| 现象 | 处理 |
|------|------|
| `health` 长时间 unhealthy | 看 `docker compose logs`：若设了 `OPPTRIX_FETCH_MODELS_ON_START=1` 可能在拉模型；否则查端口/seed |
| 原生模块 / ABI 报错 | 镜像须用 **glibc bookworm + Node ≥ 24** 构建，勿改 alpine |
| UI 空白但 API 正常 | 确认 `SERVE_UI=1` 且镜像内存在 `/app/client-ui/dist` |
| 远程无法访问未认领实例 | 预期行为；本机创建账户或经受信代理后再访问 |

更多开发说明见 [DEVELOPMENT.md](./DEVELOPMENT.md)；API 见 [API.md](./API.md)。浏览器通知与安装为应用见 [PWA.md](./PWA.md)；宿主机目录挂载见上文「额外目录挂载」。
