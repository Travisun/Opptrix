# Opptrix Desktop

Cross-platform desktop app built with **Electron** and a **Node.js API sidecar** (existing Fastify server).

## Architecture

```
┌─────────────────────────────────────────┐
│  Electron main process                  │
│  · Native window (Chromium)             │
│  · Lifecycle: spawn/stop API sidecar    │
└──────────────────┬──────────────────────┘
                   │ http://127.0.0.1:8711
┌──────────────────▼──────────────────────┐
│  Node sidecar (@opptrix/server)    │
│  · /api/*  REST + Agent                 │
│  · /*      SPA (client-ui/dist)         │
└─────────────────────────────────────────┘
```

**Why Electron?** Mature ecosystem, consistent Chromium rendering (Markdown / Mermaid / LaTeX), and the main process is Node — a natural fit for spawning the existing API sidecar. Production uses `ELECTRON_RUN_AS_NODE` so the bundled app does not require a separate Node.js install.

<p align="center">
  <img src="../screenshot.jpg" alt="Opptrix 桌面主界面" width="880" />
</p>

<p align="center"><sub>桌面端与 Web 共用 React UI：聊天投研 + 右侧个股面板</sub></p>

## Development

Requirements: Node 20+.

```bash
npm install
npm run dev:desktop
```

This builds workspace packages, starts the API sidecar + Vite HMR, and opens the Electron window. The main window first shows an in-window startup screen, then navigates to the app UI when the dev server is ready.

If the API is already running on port `8711`, stop it first or set `STOCK_RESEARCH_PORT` to avoid a port conflict.

Optional: `ELECTRON_OPEN_DEVTOOLS=1 npm run dev:desktop` opens DevTools（仅开发模式）。

## 菜单与版本信息

打包后的桌面应用提供定制菜单栏：

| 菜单 | 内容 |
|------|------|
| **Opptrix**（macOS 应用菜单） | 关于、隐藏/退出 |
| **文件** | 打开主窗口、关闭窗口 |
| **编辑** | 撤销、复制、粘贴等 |
| **视图** | 缩放、全屏（开发模式含重新加载与开发者工具） |
| **帮助** | [GitHub 项目主页](https://github.com/Travisun/Opptrix)、报告问题、关于与版本号 |

版本号来自 `apps/desktop/package.json`。生产包默认禁用 DevTools 与调试快捷键。

## Production build

```bash
npm run build:desktop
```

Stages a self-contained Node runtime under `apps/desktop/runtime-stage/`, bundles it as Electron extra resources, and produces:

- macOS: `.dmg` / `.zip`（自动更新依赖 zip）
- Windows: NSIS 安装包（`.exe`）
- Linux: `.AppImage` / `.deb`

**发布与自动更新**（版本号、产物命名、GitHub Releases 上传、三端兼容）见 **[DESKTOP-RELEASE.md](./DESKTOP-RELEASE.md)**。

The release app loads `http://127.0.0.1:8711` (UI + API same origin).

## Environment

| Variable | Description |
|----------|-------------|
| `SERVE_UI=1` | Server serves `client-ui/dist` |
| `OPPTRIX_DESKTOP=1` | Desktop mode flag |
| `UI_DIST_PATH` | Override UI dist directory |
| `STOCK_RESEARCH_PORT` | API port (default `8711`) |
| `ELECTRON_OPEN_DEVTOOLS` | Set to `1` to open DevTools in dev |
| `OPPTRIX_RUNTIME_ARCH` | Sidecar native target arch (`arm64` / `x64`); CI macOS Intel 交叉构建时使用 |
| `OPPTRIX_RUNTIME_PLATFORM` | Sidecar native target platform (`darwin` / `win32` / `linux`); 默认取当前 OS |
| `OPPTRIX_PREBUILD_MIRROR` | `better-sqlite3` prebuild 镜像根 URL（默认 npmmirror CDN） |
| `ELECTRON_MIRROR` / `npm_config_disturl` | Electron headers 下载镜像（本地网络受限时） |
| `OPPTRIX_RUNTIME_STAGE` | Packaged sidecar root (`runtime-stage`); used to locate bundled sandbox tools |
| `PLAYWRIGHT_BROWSERS_PATH` | Agent 浏览器 Chromium 目录；桌面生产包由 sidecar 指向 `runtime-stage/playwright-browsers` |
| `OPPTRIX_SKIP_PLAYWRIGHT_BROWSER=1` | 跳过 Chromium 自动安装（开发环境 `npm install` / Agent 懒启动） |

## Platform UI

In Electron, the client forces **desktop layout** (sidebar visible, no mobile drawer) via `client-ui/src/platform/detect.ts`.

## 命令隔离（Agent Shell）

智能助手在**本对话工作区**与已授权目录内运行 Python / Node 命令时，使用系统级隔离环境（`shell_run` / `shell_install`）。每段对话有独立的默认读写目录（`agent-workspace/sessions/<会话ID>/`），不会默认与其他对话共享文件。首次运行命令前会请你确认；安装依赖时还会单独确认联网。

桌面安装包会尽量自带组件并自动就绪；**仍可能需要你配合一次系统授权或系统策略调整**。

| 平台 | 分发方式 | 你需要做什么 |
|------|----------|--------------|
| **macOS** | 隔离能力由系统提供 | 一般无需额外操作 |
| **Windows** | `srt-win` 随应用内置 | **首次使用命令隔离时可能出现一次 UAC 授权**；点允许即可，无需手动运行任何安装命令。若取消授权，可稍后在应用内重试 |
| **Linux deb** | `bubblewrap`、`socat`、`ripgrep` 写入包依赖 | 用 apt 安装 deb 时会**自动安装依赖**，一般无需手动操作 |
| **Linux AppImage** | 构建时下载或内置便携二进制到 `runtime-stage/sandbox-bins/` | 若内置组件不可用，会提示改用 deb 或联系支持 |
| **Ubuntu 24.04+ 等** | 内核可能限制非特权 user namespace | **首次使用命令隔离时可能出现一次系统授权（pkexec）**；点允许即可，无需手动执行任何命令。若取消授权，可稍后在应用内重试。无 polkit 或无管理员权限的企业机仍可能失败 |

**边界说明（可行性）**：

- Windows 的机器级隔离用户与网络策略需要**一次**提升授权；Opptrix 会在首次 `shell_run` / `shell_install` 时自动尝试触发，**不会**要求你自行执行 `npx … windows-install`。
- **命令确认**：首次在本对话运行命令时会弹出确认（可勾选「本对话一律允许」）；联网安装另有单独确认，二者独立。
- Linux deb 通过 `Depends: bubblewrap, socat, ripgrep` 在系统包管理器层拉齐依赖。
- AppImage 构建时会优先从可信源下载便携二进制到 `runtime-stage/sandbox-bins/{arch}/`（失败时回退构建机 `which`），sidecar 通过 `OPPTRIX_RUNTIME_STAGE` 注入 `bwrapPath` / `socatPath` / `ripgrep.command`。**deb 仍是最稳的安装路径**。
- Ubuntu 24.04+ 等系统若限制 user namespace，Opptrix 会在首次 `shell_run` / `shell_install` 时经 **pkexec** 一次性写入 AppArmor 配置并 reload，**不会**要求你自行粘贴终端命令。
- Electron 主进程提供 `shellInstallWindowsSandbox` / `shellInstallLinuxSandbox` IPC，供 UI 在 sidecar 无法完成授权时重试（同样是一次系统授权）。

详见 [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp) 中 `shell_platform_status` 字段（`ready` / `needs_elevation` / `can_auto_install` / `userns_restricted` 等）。

### Window blur + sidebar

| 平台 | 窗口层 | 固定左侧栏 |
|------|--------|------------|
| macOS | `vibrancy: 'sidebar'`（**不开** `transparent`） | CSS 透明，露的是系统毛玻璃材质；缩放时不会漏裸桌面 |
| Windows | `backgroundMaterial: 'acrylic'`（**不开** `transparent`） | 同上 |
| Linux | 实色窗口底 | 保留 CSS `.opptrix-glass-sidebar` 毛玻璃（无原生 acrylic） |

窄窗浮层侧栏仍盖在实色主内容上，继续用 CSS 毛玻璃。文档标记类：`html.opptrix-electron-vibrancy`。

### Title bar z-index

Stacking order (low → high), defined in `client-ui/src/desktop/constants.ts` as `DESKTOP_Z_*`:

| Layer | Value | Usage |
|-------|-------|-------|
| Title drag band | `1100` | `DESKTOP_Z_TITLE` — chat title chrome |
| Overlay sidebar | `1150` | `DESKTOP_Z_OVERLAY_SIDEBAR` — compact-window floating sidebar + edge trigger |
| Panel title bands | `1200` | `DESKTOP_Z_PANEL_TITLE` — news / market / right-panel title rows |
| Toolbar + window controls | `1300` | `DESKTOP_Z_CHROME_TOOLS` — global fixed chrome |
| Clickable session title | `1310` | `DESKTOP_Z_TITLE_INTERACTIVE` — title text above drag layer |

Narrow windows (&lt; sidebar width × 2.5): left sidebar becomes a **full-height overlay** (`top: 0; bottom: 0`), light glass, **no fullscreen scrim**. Minimum width: `DESKTOP_CHAT_MIN_WIDTH` (510px), synced with `apps/desktop/electron/main.cjs`.
