# Opptrix 自托管（Docker Compose）

推荐用 **Docker Compose** 部署单用户实例：一份镜像、持久化数据卷、可选宿主机目录挂载。本文是面向最终用户与运维的**唯一推荐安装路径**。

## 快速开始（Linux 服务器 · 推荐）

### 方式 A：npm 全局 CLI（需已有 Node ≥ 24 + Docker）

包说明与命令详解见 npm：[`@opptrix/selfhost`](https://www.npmjs.com/package/@opptrix/selfhost)（仓内 `packages/selfhost/README.md`）。

```bash
npm i -g @opptrix/selfhost
# 国内 registry 可选: npm i -g @opptrix/selfhost --registry https://registry.npmmirror.com
opptrix init          # 默认自动检测国内/海外镜像与 clone 源
opptrix up            # 优先拉取 GHCR 预构建镜像并启动
# 强制本地编译: opptrix up --build
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
| `opptrix-selfhost-vX.Y.Z` | **自托管应用**可安装快照（GHCR 镜像 tag / clone / 升级 / 回退） |
| `selfhost-v*` | **仅** `@opptrix/selfhost` CLI 的 npm 发版触发，**不是**应用源码 |

预构建镜像（打 `opptrix-selfhost-v*` 后由 CI 推送）：

| 项 | 值 |
|----|-----|
| 仓库 | CI 推送至 `ghcr.io/travisun/opptrix`；国内 pull 经 `ghcr.nju.edu.cn` / `ghcr.1ms.run` 测速代理主机名 |
| 覆盖 | `OPPTRIX_IMAGE`（完整引用）、`OPPTRIX_IMAGE_REPO`、`OPPTRIX_GHCR_MIRROR`（仅改 registry 主机） |
| Tag | 与 git 一致的 `opptrix-selfhost-vX.Y.Z`、纯 semver `X.Y.Z`、浮动 `selfhost` |
| 大模型 | **不在镜像内**；运行时写入卷 `opptrix-models`，升级不重下 |

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

浏览器打开 [http://127.0.0.1:8711](http://127.0.0.1:8711)（Compose 默认只绑定本机回环）。

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
| `opptrix update` | 优先 pull 新 tag 镜像；保留 compose.env / 卷 |
| `opptrix stop` / `start` / `restart` | 停 / 启 / 重启 |
| `opptrix down` | 停止并移除容器（默认**保留**数据卷） |
| `opptrix logs -f` | 跟踪日志 |
| `opptrix status` | 容器状态 |
| `opptrix health` | 探测 `http://127.0.0.1:8711/api/health` |
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

应用快照 `opptrix-selfhost-v*` 由维护者另行打 tag，**不会**由 `release:selfhost`（CLI）自动创建。打该 tag 会触发 `.github/workflows/publish-selfhost-image.yml`，将多架构镜像推送到 `ghcr.io/<owner>/opptrix`（标签含完整 tag、semver、`selfhost`）。**首个 tag 推送完成前**，用户 `opptrix up` 的 pull 会失败并自动回退本地编译。

### 不用 CLI 时的 Compose 原语

```bash
cp compose.env.example compose.env
# 预构建（示例）:
OPPTRIX_IMAGE=ghcr.io/travisun/opptrix:opptrix-selfhost-v1.3.6 docker compose pull
OPPTRIX_IMAGE=ghcr.io/travisun/opptrix:opptrix-selfhost-v1.3.6 docker compose up -d
# 或本地编译:
OPPTRIX_BUILD_MIRROR=cn ./scripts/docker-compose-with-mirrors.sh up -d --build
curl -fsS http://127.0.0.1:8711/api/health
```

### 构建镜像源（国内外切换）

| 变量 | 作用 | 国内示例 |
|------|------|----------|
| `OPPTRIX_BUILD_MIRROR` / `--mirror` | `cn` / `foreign` | `cn` |
| `OPPTRIX_DOCKER_IMAGE_PREFIX` | Node 基础镜像前缀（须以 `/` 结尾） | `docker.m.daocloud.io/library/` |
| `OPPTRIX_NPM_REGISTRY` | `npm ci` 注册表 | `https://registry.npmmirror.com` |
| `OPPTRIX_APT_MIRROR` | Debian apt 主机名（无 `https://`） | `mirrors.aliyun.com` |

`opptrix init --mirror cn` 会把偏好写入 `.opptrix.json`（已 gitignore）。构建参数还需进入 shell / 项目 `.env`；CLI 在执行 `up`/`build`/`update` 时会自动注入。备用 Node 前缀示例：`docker.1ms.run/library/`。

首次启动（未 `--skip-models`）会在空的 **models** 卷中拉取核心本地模型（约 1GB+）。**运行时模型下载**默认国内优先：ModelScope → hf-mirror → Hugging Face。健康检查 `start_period` 约 15 分钟。

不必自建「数据集」镜像：权重应挂 **Model** 仓。四套核心模型在 ModelScope 均有官方/上游仓；自建 Opptrix 合集仓仅在需要钉死版本或内网二次分发时有价值。

离线新闻翻译跑在 **服务端 HTTP**（`POST /api/news/translate` + `/api/news/translation/*`），不依赖 Electron；Docker `with-models` 会把 `HY-MT1.5-1.8B-Q4_K_M.gguf` 放到 `/models/llms`（`OPPTRIX_LLM_DIR`），与 `resolveTranslationModelPath` 搜索顺序一致。设置页从目录下载的 GGUF 同样写入 `OPPTRIX_LLM_DIR`（Compose 默认 `/models/llms`，落在 models 卷），而不是容器内易失的 `~/.opptrix/llms`。翻译请求可走 SSE（`Accept: text/event-stream` 或 `?stream=1`，事件 `progress` / `result` / `error`）；未声明流式时仍返回完整 JSON。文章级译文缓存在 `$OPPTRIX_DATA_DIR/news-translation-cache.json`（Compose 下即 `/data/…`），命中时响应含 `fromCache: true`。

可选环境变量见仓库根目录 `compose.env.example`。

## 数据与模型卷

| 容器路径 | Compose 卷 | 用途 |
|----------|------------|------|
| `/data` | `opptrix-data` | 用户数据根（`OPPTRIX_DATA_DIR`）：库、会话、设置、工作区等 |
| `/models` | `opptrix-models` | 本地核心模型（与镜像分离，升级不丢） |
| `/data/mounts/<name>` | 可选 bind | 宿主机额外目录约定（只读或读写） |

**升级镜像不会清空卷。** 数据与模型都在卷里，换镜像 / `docker compose pull`（或重建）后仍沿用原卷。

### 备份

```bash
# 停服务更稳妥
docker compose stop

docker run --rm \
  -v opptrix_opptrix-data:/data \
  -v "$(pwd)/backup:/backup" \
  alpine tar czf /backup/opptrix-data-$(date +%Y%m%d).tgz -C /data .

docker run --rm \
  -v opptrix_opptrix-models:/models \
  -v "$(pwd)/backup:/backup" \
  alpine tar czf /backup/opptrix-models-$(date +%Y%m%d).tgz -C /models .
```

> 卷名前缀取决于 Compose 项目名（默认多为目录名，如 `opptrix_opptrix-data`）。用 `docker volume ls | grep opptrix` 确认。

### 恢复

```bash
docker compose stop
docker run --rm \
  -v opptrix_opptrix-data:/data \
  -v "$(pwd)/backup:/backup" \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/opptrix-data-YYYYMMDD.tgz -C /data'
docker compose start
```

模型卷同理。

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
| 账户 / 会话 / 设置 | 卷 `opptrix-data` → `/data` | `down` 不带 `--volumes` 即保留 |
| 核心模型 | 卷 `opptrix-models` → `/models` | 已有文件**不会**再下载 |
| 运行时配置 | 部署目录 `compose.env`、`.opptrix.json` | 升级不覆盖 |
| 额外目录映射 | `docker-compose.override.yml` | 升级不覆盖；Compose 自动合并 |

启动时 entrypoint 会检测模型卷：齐全则跳过下载。仅当编排指定时才重下：

```bash
# compose.env
OPPTRIX_FORCE_MODEL_FETCH=1
```

冒烟、完全不拉模型：`OPPTRIX_SKIP_MODEL_FETCH=1` 或 `opptrix up --skip-models`。

不要删除 named volume；`opptrix down --volumes` 会清空数据与模型。

## 额外目录挂载

约定：宿主机目录挂到 **`/data/mounts/<name>`**，`<name>` 为短标识（如 `research`、`docs`）。

请写在 **`docker-compose.override.yml`**（与 `docker-compose.yml` 同目录），升级覆盖主 compose 时不会丢掉你的映射：

```yaml
# docker-compose.override.yml
services:
  opptrix:
    volumes:
      - ./host-research:/data/mounts/research:ro
```

只读（`:ro`）适合资料库；需要工作区内写入时去掉 `:ro`。应用侧按挂载名访问这些路径（与数据根下的 `mounts` 约定一致）。

## 账户与访问控制

- **未创建账户**：默认仅本机/本地客户端可调用 API；远程直连会被拒绝（引导你先在本机完成创建）。
- **创建账户后**：须登录；可在设置中管理会话与二次验证。
- 首次打开 UI 按引导 **认领 / 创建账户**（claim），再按需开启 TOTP。

切勿把未认领、未加反向代理的实例裸暴露到公网。

## 安全模型（命令与工作区）

自托管默认采用 **工作区隔离**，不要求宿主机 OS 级沙箱提升（无默认 SRT / 系统授权安装）：

| 层 | 作用 |
|----|------|
| Docker 外层 | 容器边界与卷挂载；限制进程可见的宿主机面 |
| 工作区 grant | 助手命令与文件工具仅能触及本对话已授权的文件夹 |
| Deny | 敏感路径（用户库、密钥保险箱、配置等）即使误授权也不可访问 |
| 出站网络 | 工作区模式下默认可访问公网，无需逐次授权。硬边界依赖 Docker / 宿主机防火墙；`http_fetch` 等仍防内网 SSRF。遗留 `OPPTRIX_SHELL_ISOLATION=srt` 时才按域名围栏与确认 |

**密钥勿放进工作区目录**（含 `/data/mounts/...` 与会话工作区）：明文密钥应走应用内保险箱，不要写进可被助手读写的文件夹。

遗留完整系统隔离（可选）：设置环境变量 `OPPTRIX_SHELL_ISOLATION=srt` 后走旧路径（需平台沙盒组件）；日常自托管无需开启。

## TLS 与反向代理

容器内默认明文 HTTP（`8711`）。生产请在前面加 Nginx / Caddy / Traefik 终止 TLS，并配置：

| 变量 | 说明 |
|------|------|
| `OPPTRIX_TRUSTED_PROXIES` | 反向代理的 IP/CIDR 列表；**为空时不信任** `X-Forwarded-For` 等头 |
| `OPPTRIX_AUTH_COOKIE_SECURE` | HTTPS 时设为 `1`，Cookie 带 Secure |
| `OPPTRIX_TRUSTED_LOCAL_CIDRS` | 额外视为「本地」的网段（可选） |

示例（代理在 Docker 网桥）：

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

## 故障排查

| 现象 | 处理 |
|------|------|
| `health` 长时间 unhealthy | 看 `docker compose logs`：是否在拉模型；可临时 `OPPTRIX_SKIP_MODEL_FETCH=1` |
| 原生模块 / ABI 报错 | 镜像须用 **glibc bookworm + Node ≥ 24** 构建，勿改 alpine |
| UI 空白但 API 正常 | 确认 `SERVE_UI=1` 且镜像内存在 `/app/client-ui/dist` |
| 远程无法访问未认领实例 | 预期行为；本机创建账户或经受信代理后再访问 |

更多开发说明见 [DEVELOPMENT.md](./DEVELOPMENT.md)；API 见 [API.md](./API.md)。浏览器通知与安装为应用见 [PWA.md](./PWA.md)；宿主机目录挂载见上文「额外目录挂载」。
