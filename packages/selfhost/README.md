# @opptrix/selfhost

Opptrix **自托管管理 CLI**（全局命令：`opptrix`）与 Docker Compose 部署清单。

用一条命令完成：检查环境 → 准备源码 → 按国内/海外镜像构建并启停单用户 Opptrix 实例。

- 产品主页：[opptrix.org](https://www.opptrix.org)  
- 源码：[GitHub](https://github.com/Travisun/Opptrix) · [Gitee](https://gitee.com/Travisun/Opptrix)  
- 完整自托管说明：[docs/SELF-HOSTING.md](https://github.com/Travisun/Opptrix/blob/main/docs/SELF-HOSTING.md)

---

## 你需要什么

| 依赖 | 要求 |
|------|------|
| **Node.js** | ≥ 24 |
| **Docker** | Engine + **Compose V2**（`docker compose version`） |
| 磁盘 / 网络 | 首次构建与可选模型下载体积较大；国内请用 `--mirror cn` |

**平台建议**

- **Linux 服务器**：推荐路径（可再配合仓库内一键 bootstrap 自动装 Docker / 托管 Node）  
- **macOS / Windows**：请自行安装 Docker 与 Node 后使用本包；不提供自动安装 Docker

---

## 安装

```bash
npm i -g @opptrix/selfhost

# 国内若官方 registry 慢：
npm i -g @opptrix/selfhost --registry https://registry.npmmirror.com
```

验证：

```bash
opptrix --help
opptrix doctor
```

---

## 快速开始

### 国内

```bash
opptrix init --mirror cn
opptrix up --mirror cn
# 仅验证服务、暂不拉本地模型：
# opptrix up --mirror cn --skip-models
```

浏览器打开 [http://127.0.0.1:8711](http://127.0.0.1:8711)（默认只绑定本机回环）。

### 海外 / 官方源

```bash
opptrix init --mirror foreign
opptrix up --mirror foreign
```

### Linux：从零机器一键准备

未装 Docker / Node 时，可用仓库 bootstrap（装好后仍用本 CLI）：

```bash
export OPPTRIX_BUILD_MIRROR=cn
curl -fsSL https://raw.githubusercontent.com/Travisun/Opptrix/main/scripts/bootstrap/linux.sh | bash
# GitHub raw 慢时可：git clone https://gitee.com/Travisun/Opptrix.git && cd Opptrix && ./scripts/bootstrap/linux.sh
```

---

## 命令一览

| 命令 | 作用 |
|------|------|
| `opptrix doctor` | 检查 Docker、Compose、部署目录与关键文件 |
| `opptrix init` | 生成 `compose.env`，写入镜像偏好（`.opptrix.json`） |
| `opptrix up` | 构建并后台启动（默认带 `--build`） |
| `opptrix start` / `stop` / `restart` | 启 / 停 / 重启已有容器 |
| `opptrix down` | 停止并移除容器（**默认保留数据卷**；加 `--volumes` 会删卷） |
| `opptrix build` | 仅构建镜像 |
| `opptrix update` | 对源码树 `git pull` 后重建启动；并建议 `npm update -g @opptrix/selfhost` |
| `opptrix logs` | 日志（`-f` / `--follow` 跟踪，`--tail <n>`） |
| `opptrix status` | `docker compose ps` |
| `opptrix health` | 探测 `http://127.0.0.1:8711/api/health` |
| `opptrix compose -- …` | 透传任意 `docker compose` 参数 |
| `opptrix install-cli` / `uninstall-cli` | 本机 `npm link` / 取消全局链接 |

### 常用选项

| 选项 | 说明 |
|------|------|
| `--mirror cn\|foreign` | 构建与 **git clone** 的区域偏好（见下） |
| `--skip-models` | 跳过首启核心模型下载（`OPPTRIX_SKIP_MODEL_FETCH=1`） |
| `--no-build` | `up` 时不重建镜像 |
| `--volumes` | `down` 时删除命名卷（会清数据，慎用） |
| `-f` / `--follow` | `logs` 跟踪输出 |
| `--tail <n>` | `logs` 尾部行数（默认 200） |

---

## 国内 / 海外如何生效

`--mirror`（或 `opptrix init` 写入的配置、`OPPTRIX_BUILD_MIRROR`）同时影响：

1. **Docker 构建**：Node 基础镜像前缀、npm registry、Debian apt 镜像  
2. **源码 clone**（仅当本地还没有完整 Opptrix 树时）

| 偏好 | 构建 | clone 优先 | clone 回退 |
|------|------|-----------|-----------|
| `cn` | DaoCloud / npmmirror / 阿里云 apt 等 | [Gitee](https://gitee.com/Travisun/Opptrix) | GitHub |
| `foreign` | Docker Hub + 官方 npm/apt | [GitHub](https://github.com/Travisun/Opptrix) | Gitee |

覆盖地址（可选）：

| 变量 | 含义 |
|------|------|
| `OPPTRIX_GIT_URL_CN` | 国内 clone URL |
| `OPPTRIX_GIT_URL` | 国外 clone URL |
| `OPPTRIX_GIT_URL_OVERRIDE` | 强制单一 URL（不再回退） |
| `OPPTRIX_GIT_REF` | clone 的 tag/分支（默认尝试 `selfhost-v{本包版本}`，再回退 `main`） |
| `OPPTRIX_DOCKER_IMAGE_PREFIX` | 覆盖 Node 镜像前缀（须以 `/` 结尾） |
| `OPPTRIX_NPM_REGISTRY` | 覆盖构建期 npm registry |
| `OPPTRIX_APT_MIRROR` | 覆盖 apt 主机名（无 `https://`） |

---

## 部署目录与构建上下文

镜像构建需要**完整** Opptrix 源码（`Dockerfile` 会复制 `packages/`、`apps/`、`client-ui/` 等）。

解析顺序：

1. 环境变量 **`OPPTRIX_DEPLOY_DIR`**（若设置）  
2. 当前工作目录向上查找已有 monorepo / clone  
3. 否则使用 **`~/.opptrix/instances/default`**，缺失时按上表自动 `git clone`

本 npm 包内的 `bundle/` 含与发版同步的 `docker-compose.yml`、`Dockerfile`、`compose.env.example`、entrypoint 等；在独立实例目录上会按需叠加以保持与 CLI 版本一致。

配置与偏好：

- `compose.env` — 运行时环境（由 `init` 从示例生成，勿提交密钥）  
- `.opptrix.json` — CLI 偏好（mirror、skipModels 等）

---

## 数据与访问

| 路径 / 项 | 说明 |
|-----------|------|
| 浏览器 | [http://127.0.0.1:8711](http://127.0.0.1:8711) |
| 健康检查 | `opptrix health` 或 `GET /api/health` |
| 数据卷 | Compose 命名卷 `opptrix-data`（`/data`）、`opptrix-models`（`/models`） |
| `down` | 默认**不删卷**；加 `--volumes` 才会清空 |

远程访问请自行加反向代理 / TLS；默认端口仅绑定 `127.0.0.1`。细节见仓库 [SELF-HOSTING.md](https://github.com/Travisun/Opptrix/blob/main/docs/SELF-HOSTING.md)。

---

## 常见问题

**`doctor` 报未检测到 Docker**  
安装并启动 Docker Engine / Desktop，确认当前用户可执行 `docker`（Linux 常需加入 `docker` 组后重新登录）。

**`up` 在 clone 或拉基础镜像时超时**  
使用 `--mirror cn`，或设置 `OPPTRIX_GIT_URL_*` / 构建镜像环境变量；公司网络需放行对应域名。

**全局命令找不到 `opptrix`**  
确认 `npm bin -g` 已在 `PATH`；或使用 `npx @opptrix/selfhost doctor`。

**升级 CLI 与实例**  

```bash
npm update -g @opptrix/selfhost
opptrix update --mirror cn   # 或 foreign
```

**卸载**  

```bash
opptrix down                 # 可选：先停实例
npm uninstall -g @opptrix/selfhost
# 或: opptrix uninstall-cli
```

---

## 仓内开发（贡献者）

本包位于 Opptrix monorepo 的 `packages/selfhost`：

```bash
git clone https://github.com/Travisun/Opptrix.git
cd Opptrix
npm ci
npm run build -w @opptrix/selfhost   # 同步 bundle/
npm link -w @opptrix/selfhost        # 或: npm run opptrix -- doctor
```

发版：`npm run release:selfhost`，再推送 `main` 与 tag `selfhost-v*`（需 npm 组织 `@opptrix` 与 GitHub Secret `NPM_TOKEN`）。流程见仓库文档与 `.github/workflows/publish-selfhost.yml`。

---

## License

[Apache-2.0](https://github.com/Travisun/Opptrix/blob/main/LICENSE)
