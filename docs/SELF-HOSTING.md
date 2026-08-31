# Opptrix 自托管（Docker Compose）

推荐用 **Docker Compose** 部署单用户实例：一份镜像、持久化数据卷、可选宿主机目录挂载。桌面安装包仍是本机可选形态，不依赖本文。

## 快速开始

```bash
git clone https://github.com/Travisun/Opptrix.git
cd Opptrix
docker compose up -d --build
```

浏览器打开 [http://127.0.0.1:8711](http://127.0.0.1:8711)。

健康检查：

```bash
curl -fsS http://127.0.0.1:8711/api/health
```

首次启动会在空的 **models** 卷中拉取核心本地模型（E5 语义向量、RapidOCR、SenseVoice q8 + VAD、HY-MT 离线翻译 GGUF）。下载体积约 1GB+。**默认国内优先**：ModelScope → hf-mirror → Hugging Face（可用 `OPPTRIX_MODEL_SOURCE_ORDER` 覆盖）。HY-MT GGUF 官方仓为 `Tencent-Hunyuan/HY-MT1.5-1.8B-GGUF`（与 HF 的 `tencent/…` 组织名不同）。失败时服务仍会启动，相关能力可稍后补齐。

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

## 升级（不丢数据）

```bash
git pull   # 或换到新的 release 源码 / 镜像标签
docker compose up -d --build
```

确认仍挂载同一 `opptrix-data` / `opptrix-models`。不要删除这两个 named volume。

若已预置模型、想跳过启动时探测下载：

```bash
# 在 compose 的 environment 中
OPPTRIX_SKIP_MODEL_FETCH: "1"
```

## 额外目录挂载

约定：宿主机目录挂到 **`/data/mounts/<name>`**，`<name>` 为短标识（如 `research`、`docs`）。

在 `docker-compose.yml` 中取消注释并改路径，例如：

```yaml
volumes:
  - opptrix-data:/data
  - opptrix-models:/models
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

## 桌面端（可选）

本机也可以继续使用 [GitHub Releases](https://github.com/Travisun/Opptrix/releases) 桌面安装包。Docker 自托管与桌面版数据目录独立；不要假设两边自动同步。

## 故障排查

| 现象 | 处理 |
|------|------|
| `health` 长时间 unhealthy | 看 `docker compose logs`：是否在拉模型；可临时 `OPPTRIX_SKIP_MODEL_FETCH=1` |
| 原生模块 / ABI 报错 | 镜像须用 **glibc bookworm + Node ≥ 24** 构建，勿改 alpine |
| UI 空白但 API 正常 | 确认 `SERVE_UI=1` 且镜像内存在 `/app/client-ui/dist` |
| 远程无法访问未认领实例 | 预期行为；本机创建账户或经受信代理后再访问 |

更多开发说明见 [DEVELOPMENT.md](./DEVELOPMENT.md)；API 见 [API.md](./API.md)。浏览器通知与安装为应用见 [PWA.md](./PWA.md)；宿主机目录挂载见上文「额外目录挂载」。
