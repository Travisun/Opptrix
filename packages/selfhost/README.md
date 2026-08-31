# @opptrix/selfhost

Opptrix 自托管 CLI（命令名 **`opptrix`**）与 Docker Compose 部署清单。

## 安装

```bash
npm i -g @opptrix/selfhost
opptrix doctor
opptrix init --mirror cn   # 或 foreign
opptrix up --mirror cn
```

需要本机 **Docker**（Compose V2）与 **Node ≥ 24**。  
Linux 服务器也可用仓库内 `scripts/bootstrap/linux.sh`（自动装 Docker / 托管 Node，再装本包）。

## 仓内开发

```bash
npm run build -w @opptrix/selfhost
npm link -w @opptrix/selfhost
# 或: npm run opptrix -- doctor
```

`npm run build -w @opptrix/selfhost` 会把仓根的 `docker-compose.yml` / `Dockerfile` 等拷入 `bundle/`（随包发布）。

## 构建上下文

镜像构建需要完整 monorepo（`Dockerfile` 会 `COPY packages apps client-ui …`）。

- 在仓库内运行：直接用当前 clone  
- 全局安装后：默认把源码放到 `~/.opptrix/instances/default`（缺失时自动 `git clone`）  
  - `--mirror cn` → **Gitee** 优先；`--mirror foreign` → **GitHub** 优先（失败互为回退）
- 自定义：`OPPTRIX_DEPLOY_DIR=/path/to/Opptrix`

## 发布

```bash
# 需 NPM_TOKEN；或打 tag: selfhost-v0.1.0
npm run publish:selfhost
```

详见仓库 `.github/workflows/publish-selfhost.yml` 与 `docs/SELF-HOSTING.md`。
