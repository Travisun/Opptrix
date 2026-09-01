# Opptrix 自托管 CLI（`opptrix`）— `@opptrix/selfhost`

**用 npm 安装的 Opptrix 本地 / 服务器部署工具。**  
一条命令把投研工作台跑在你自己的 Docker 里：自动选国内或海外下载源，构建、启动、看日志、升级、停机。

| | |
|--|--|
| **全局命令** | `opptrix` |
| npm 包 | [`@opptrix/selfhost`](https://www.npmjs.com/package/@opptrix/selfhost) |
| 产品 | [Opptrix 投研工作台](https://www.opptrix.org) |
| 源码 | [GitHub](https://github.com/Travisun/Opptrix) · [Gitee](https://gitee.com/Travisun/Opptrix) |
| 进阶文档 | [自托管完整说明 SELF-HOSTING](https://github.com/Travisun/Opptrix/blob/main/docs/SELF-HOSTING.md) |

适合关键词检索：*Opptrix 自托管*、*Opptrix Docker 部署*、*opptrix CLI*、*本地部署投研*、*Docker Compose 安装 Opptrix*、*国内镜像 Gitee 部署*。

---

## 这是什么？能带来什么效果？

**`@opptrix/selfhost` 不是投研网页本身**，而是帮你把 Opptrix **装起来、管起来** 的命令行工具。

安装并执行成功后，你会得到：

1. 本机命令 **`opptrix`**（检查环境、初始化、启停实例）  
2. 一份 Docker Compose 部署（默认 **拉取 GHCR 预构建镜像**；也可本地编译）  
3. **自动判断**用国内源还是海外源（本地编译 / clone 时）  
4. 浏览器打开 **http://127.0.0.1:8711** 使用完整 Opptrix Web 界面  

典型问题本工具直接回答：

- 「怎么在自己的 Linux 服务器上部署 Opptrix？」  
- 「怎么用预构建镜像快速启动？怎么强制本地编译？」  
- 「国内网络怎么拉镜像 / 克隆代码更快？」  
- 「怎么启动、停止、看日志、升级自托管实例？」  
- 「Mac / Windows 已经装了 Docker，怎么本地跑 Opptrix？」

---

## 谁适合用？

| 角色 | 场景 |
|------|------|
| 个人投资者 / 研究员 | 数据与会话留在自己的机器或 VPS |
| 运维 / 极客 | 用 Docker 跑单用户实例，脚本化启停与升级 |
| 国内用户 | 自动走 Gitee + 国内构建镜像，少踩 Docker Hub / GitHub 超时 |
| 海外用户 | 自动走 GitHub + 官方 registry |

**不适合：** 未安装 Docker、且不打算自行安装 Docker 的环境；本包也不提供 Windows/macOS 自动安装 Docker。

---

## 使用前准备（依赖）

| 依赖 | 最低要求 | 如何确认 |
|------|----------|----------|
| Node.js | **≥ 24** | `node -v` |
| Docker | Engine + **Compose V2** | `docker compose version` |
| 磁盘与网络 | 首次 pull 预构建较快；本地 `--build` 或拉模型时更大 | 预留数 GB 以上更稳妥 |

- **Linux 服务器**：推荐；可用一键脚本先装 Docker / Node，再装本 CLI。  
- **macOS / Windows**：请先自行安装 Docker Desktop（或等价环境）与 Node，再 `npm i -g @opptrix/selfhost`。

---

## 安装 CLI（三种方式）

### 方式 1：全局安装（最常见）

```bash
npm i -g @opptrix/selfhost
```

国内 npm 慢时：

```bash
npm i -g @opptrix/selfhost --registry https://registry.npmmirror.com
```

**效果：** 终端任意目录可执行 `opptrix`。

### 方式 2：临时运行（不装全局）

```bash
npx @opptrix/selfhost doctor
npx @opptrix/selfhost up
```

**效果：** 与全局命令相同，适合先试用。

### 方式 3：Linux 从零机器（还没有 Docker / Node）

```bash
curl -fsSL https://raw.githubusercontent.com/Travisun/Opptrix/main/scripts/bootstrap/linux.sh | bash
# 若 GitHub raw 慢：git clone https://gitee.com/Travisun/Opptrix.git && cd Opptrix && ./scripts/bootstrap/linux.sh
```

**效果：** 脚本尽量自动安装 Docker、托管 Node，并装好 `opptrix`；之后日常仍用本 CLI 管理实例。

安装后自检：

```bash
opptrix --help
opptrix doctor
```

`doctor` 成功时会看到 Docker 可用、部署目录、以及当前 **自动检测到的 mirror（cn / foreign）**。

---

## 场景一：第一次部署（推荐路径）

目标：本机或服务器上出现可打开的 Opptrix。

```bash
opptrix init          # 生成 compose.env，自动选国内/海外源并写入配置
opptrix up            # 优先拉取预构建镜像 → 后台启动（失败再本地编译）
opptrix health        # 确认服务健康
```

然后浏览器打开：**http://127.0.0.1:8711**

| 步骤 | 你在做什么 | 成功后的效果 |
|------|------------|--------------|
| `init` | 准备配置 | 出现 `compose.env`、`.opptrix.json`（含检测到的 mirror） |
| `up` | 拉镜像并启动 | 容器运行；端口 8711 可访问；数据写入 Docker 卷 |
| `health` | 探活 | 打印健康检查成功信息 |

默认**不**在本机全量编译。若需强制本地构建，或 GHCR 拉不到时：

```bash
opptrix up --build
```

若只想先验证「能起来」、暂不下载本地模型：

```bash
opptrix up --skip-models
```

**效果：** 跳过首启大体积模型拉取，更快看到界面；之后可再完整 `up` 补模型。模型始终在卷里，不进预构建镜像。

---

## 场景二：日常运维（已部署之后）

```bash
opptrix status        # 容器是否在跑
opptrix logs -f       # 跟踪日志（出问题先看这里）
opptrix stop          # 停止（数据还在）
opptrix start         # 再启动（不强制重建镜像）
opptrix restart       # 重启
opptrix down          # 删容器但默认保留数据卷
```

| 命令 | 效果（用户可感知） |
|------|-------------------|
| `stop` / `start` | 服务暂停 / 恢复；研究数据仍在卷里 |
| `logs -f` | 实时看到启动报错、模型下载进度等 |
| `down` | 容器没了，**数据默认还在**；下次 `up` 可接着用 |
| `down --volumes` | **连数据卷一起删**（清空实例，慎用） |

---

## 场景三：升级 Opptrix 实例与 CLI

版本分轨：`opptrix-selfhost-v*` 是应用快照（并对应 GHCR 镜像）；`selfhost-v*` 只发布 CLI 包。

```bash
opptrix tags                       # 查看可升级 / 可回退的应用快照
opptrix use opptrix-selfhost-v1.3.6 && opptrix up   # 切到指定版本并优先 pull
npm update -g @opptrix/selfhost    # 仅升级管理命令本身（selfhost-v*）
opptrix update                     # 优先拉新预构建镜像；保留配置与卷
```

**效果：** 应用与 CLI 分轨升级/回退；**沿用**原 `compose.env`、挂载 override、数据卷 `opptrix-data`、模型卷 `opptrix-models`、系统槽位卷 `opptrix-system`。已有核心模型跳过下载；强制重下见 `OPPTRIX_FORCE_MODEL_FETCH=1`。默认不会静默跟 `main`。维护者打 `opptrix-selfhost-v*` 后 CI 推送镜像到 `ghcr.io/travisun/opptrix`；国内 `opptrix up` 会对 `ghcr.nju.edu.cn` / `ghcr.1ms.run` 测速后拉取。

**热更新 vs `opptrix update`：** 产品内「系统更新」在**不换镜像**的前提下，把新运行时解压进 `/system` 槽位并切换 `boot`（协议见 [SYSTEM-UPDATE.md](https://github.com/Travisun/Opptrix/blob/main/docs/SYSTEM-UPDATE.md)）。当提示需要刷新**底座 / 运行环境 / Node** 时，请用本 CLI 的 **`opptrix update`**：它重建容器、换镜像，但默认保留上述三个命名卷与 operator 挂载，不会清空挂载数据；只有 `opptrix down --volumes` 才会删卷。

---

## 场景四：国内网络 vs 海外网络

**默认不用你选。** 未传 `--mirror` 时自动检测：

1. 设置了 `OPPTRIX_FORCE_CN=1` → 国内  
2. 系统时区/语言像中国大陆（如 `Asia/Shanghai`、`zh_CN`）→ 国内  
3. 连不上 Docker Hub 认证地址 → 国内  
4. 否则 → 海外  

| | 国内（`cn`）时的效果 | 海外（`foreign`）时的效果 |
|--|--|--|
| 构建基础镜像 / apt / npm | 优先国内镜像站 | 官方 Docker Hub / npmjs / Debian |
| 自动 clone 源码 | 优先 **Gitee**，失败再试 GitHub | 优先 **GitHub**，失败再试 Gitee |

强制指定（可选）：

```bash
opptrix up --mirror cn
opptrix up --mirror foreign
opptrix up --mirror auto      # 显式再检测一次
```

---

## 场景五：指定部署目录

默认会：

1. 使用环境变量 `OPPTRIX_DEPLOY_DIR`（若设置）  
2. 或当前目录向上找到已有 Opptrix 仓库  
3. 否则用 `~/.opptrix/instances/default`（写入 Compose 清单；`--build` 时再 clone）

```bash
export OPPTRIX_DEPLOY_DIR=/data/opptrix
opptrix init
opptrix up
```

**效果：** Compose 工作目录固定在你指定的路径；预构建路径无需整仓源码。

---

## 场景六：macOS / Windows 本地试用

1. 安装 Docker Desktop，并确认 `docker compose version` 正常  
2. 安装 Node.js ≥ 24  
3. 执行：

```bash
npm i -g @opptrix/selfhost
opptrix doctor
opptrix init
opptrix up --skip-models    # 建议先跳过模型，确认能打开页面
```

4. 浏览器打开 http://127.0.0.1:8711  

**效果：** 与 Linux 服务器同一套命令；本包**不会**替你安装 Docker。

---

## 命令与选项速查

### 命令

| 命令 | 用途 | 成功后的效果 |
|------|------|--------------|
| `opptrix doctor` | 环境与文件检查 | 列出 Docker / 源码树 / 自动检测结果 |
| `opptrix init` | 初始化配置 | 生成 `compose.env`，保存 mirror 等偏好 |
| `opptrix tags` | 列出应用快照 | `opptrix-selfhost-v*`（≥ 最低版本）及升降级提示 |
| `opptrix use <tag\|main>` | 写入版本偏好 | `.opptrix.json` 的 `appRef`；`--apply` 可立即启动 |
| `opptrix up` | 优先 pull 预构建并后台启动 | 实例运行，默认可访问 8711 |
| `opptrix start` / `stop` / `restart` | 启停重启 | 不强制重建镜像 |
| `opptrix down` | 移除容器 | 默认保留数据；加 `--volumes` 清空 |
| `opptrix build` | 只本地构建镜像 | 不启动容器 |
| `opptrix update` | 升级镜像 / 运行环境底座 | 重建容器；默认保留 data / models / system 卷与挂载；热更新另见产品内提示 |
| `opptrix logs` | 查看日志 | `-f` 持续跟踪 |
| `opptrix status` | 容器状态 | 等同 compose ps |
| `opptrix health` | HTTP 健康检查 | 确认 API 已就绪 |
| `opptrix compose -- …` | 透传 docker compose | 高级用户自定义编排 |
| `opptrix install-cli` / `uninstall-cli` | link / 取消全局命令 | 开发机常用 |

### 常用选项

| 选项 | 效果 |
|------|------|
| `--mirror cn\|foreign\|auto` | 指定或自动区域源（默认等价 auto） |
| `--ref <tag\|main>` | 本次使用的应用版本 |
| `--apply` | `use` 后直接启动 |
| `--skip-models` | 跳过首启核心模型下载，更快冒烟 |
| `--build` | 强制本地编译（跳过优先 pull） |
| `--no-build` | 本地路径下 `up` 不加 `--build` |
| `--volumes` | `down` 时删除数据卷（危险） |
| `-f` / `--follow` | 日志跟踪 |
| `--tail <n>` | 日志尾部行数（默认 200） |

### 常用环境变量

| 变量 | 作用 |
|------|------|
| `OPPTRIX_DEPLOY_DIR` | 部署 / Compose 目录 |
| `OPPTRIX_IMAGE` | 完整镜像引用（手动设置则跳过测速与候选列表） |
| `OPPTRIX_IMAGE_REPO` | 镜像仓库路径（默认 `ghcr.io/travisun/opptrix`） |
| `OPPTRIX_GHCR_MIRROR` | 强制 registry 主机：`ghcr.nju.edu.cn` 或 `ghcr.1ms.run` |
| `OPPTRIX_FORCE_BUILD=1` | 同 `--build` |
| `OPPTRIX_BUILD_MIRROR` | `cn` / `foreign` / `auto` |
| `OPPTRIX_FORCE_CN=1` | 强制按国内检测 |
| `OPPTRIX_GIT_URL_CN` / `OPPTRIX_GIT_URL` | 覆盖 Gitee / GitHub 地址 |
| `OPPTRIX_GIT_URL_OVERRIDE` | 强制单一 clone 地址 |
| `OPPTRIX_GIT_REF` / `OPPTRIX_APP_REF` | 显式应用 ref（未设则用 `.opptrix.json` / 包内默认 tag） |
| `OPPTRIX_DOCKER_IMAGE_PREFIX` | 构建用 Node 镜像前缀（须以 `/` 结尾） |
| `OPPTRIX_NPM_REGISTRY` / `OPPTRIX_APT_MIRROR` | 构建期 npm / apt 源 |

---

## 数据存在哪？关掉会丢吗？

| 内容 | 位置 | `opptrix down` 后 |
|------|------|-------------------|
| 用户数据、会话、设置等 | Docker 卷 `opptrix-data`（容器内 `/data`） | **默认保留** |
| 本地模型等 | 卷 `opptrix-models`（`/models`） | **默认保留** |
| 运行时槽位 / 热更新状态 | 卷 `opptrix-system`（`/system`） | **默认保留** |
| 访问地址 | http://127.0.0.1:8711（默认只监听本机） | — |

远程公网访问请自己加反向代理与 HTTPS；完整挂载与安全说明见 [SELF-HOSTING.md](https://github.com/Travisun/Opptrix/blob/main/docs/SELF-HOSTING.md)。

---

## 常见问题（FAQ）

### Opptrix 怎么本地 Docker 部署？

安装 Node ≥ 24 与 Docker Compose V2 后：`npm i -g @opptrix/selfhost && opptrix init && opptrix up`，浏览器打开 http://127.0.0.1:8711 。默认拉取预构建镜像；本地编译用 `opptrix up --build`。

### 国内如何更快安装 Opptrix？

一般无需传参，CLI 会自动选国内源。也可 `opptrix up --mirror cn`，或安装 CLI 时用 npmmirror：`npm i -g @opptrix/selfhost --registry https://registry.npmmirror.com`。

### `opptrix` 和 `@opptrix/selfhost` 是什么关系？

`@opptrix/selfhost` 是 npm 包名；安装后提供的可执行命令叫 **`opptrix`**。

### 为什么 `doctor` 说没有 Docker？

Docker 未安装、未启动，或当前用户没有权限。Linux 可将用户加入 `docker` 组后重新登录。

### 构建或 clone 一直超时怎么办？

试 `opptrix up --mirror cn`，检查防火墙是否放行 Gitee / 国内镜像站；或设置 `OPPTRIX_GIT_URL_*`、`OPPTRIX_DOCKER_IMAGE_PREFIX` 等。

### 全局找不到 `opptrix` 命令？

把 `npm bin -g` 加入 PATH，或改用 `npx @opptrix/selfhost …`。

### 如何彻底删除实例数据？

`opptrix down --volumes`（不可恢复）。仅停服务用 `opptrix stop` 或普通 `down`。

### 如何卸载 CLI？

```bash
opptrix down                 # 可选
npm uninstall -g @opptrix/selfhost
```

### 自托管和本机 `npm run serve` 有什么区别？

自托管走 Docker：数据与模型在卷里，适合服务器长期跑。`npm run serve` 是开发/临时预览，不推荐当生产部署。

---

## 给贡献者：在仓库里开发本 CLI

```bash
git clone https://github.com/Travisun/Opptrix.git
cd Opptrix
npm ci
npm run build -w @opptrix/selfhost
npm link -w @opptrix/selfhost
```

发版 CLI：`npm run release:selfhost`，推送 `main` 与 tag `selfhost-v*`（仅 CLI npm；应用快照 `opptrix-selfhost-v*` 另行打 tag）。

---

## 许可证

[Apache-2.0](https://github.com/Travisun/Opptrix/blob/main/LICENSE)

---

**一句话：** 装 `@opptrix/selfhost` → 运行 `opptrix init && opptrix up` → 打开 http://127.0.0.1:8711 ，即可在自己的环境使用 Opptrix 投研工作台。
