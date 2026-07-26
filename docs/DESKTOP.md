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

## 本地聊天通知

Electron 桌面端在用户**未盯着该会话聊天页**时，用系统本地通知提示对话完成或需要确认。逻辑在 renderer（`client-ui/src/platform/chatNotifications.ts` + `ChatApp`），展示与点击由主进程（`apps/desktop/electron/notifications.cjs`）完成。Web 端 no-op。

### 触发点

| 流事件 | 通知 `kind` | `tag` 格式 | 标题（UI 文案） | body |
|--------|-------------|------------|-----------------|------|
| `reply`（内容已落定；优先） | `chat_done` | `chat:done:{sessionId}` | 对话已生成完成 | 会话标题（截断至 120 字） |
| `done`（且非 `cancelled`；兜底） | 同上 | 同上 | 同上 | 优先用 `event.title`，否则会话标题 |
| `user_prompt` | `chat_ask` | `chat:ask:{sessionId}` | 需要你的确认 | `prompt.title` 或 `prompt.prompt`（截断至 120 字） |

触发位置：`ChatApp` 的 `pushStreamEvent`。完成通知**优先在 `reply`** 发出，避免等待服务端慢 `done`（重建工具 / 估 token）造成「用户已切回前台 → 误判 attending → 漏通知」。同一轮（`sessionId` + `streamGen`）只通知一次；`done` 若已通知则去重跳过。`user_prompt` 仍为即时事件。

仅 Electron（`electronAPI.isElectron`）且通过注意力判断后才调用 `showLocalNotification`。

### 失焦定义（何时发通知）

「正在盯着该会话」需**同时**满足（`isAttendingChat`）：

1. `activeSessionId ===` 目标 `sessionId`
2. 当前 `view === 'chat'`
3. `document.visibilityState === 'visible'`
4. 主窗口 focused（优先 `electronAPI.windowIsFocused()` → IPC `window-is-focused` → `BrowserWindow.isFocused()`；无 API 时回退 `document.hasFocus()`）

任一不满足 → `shouldNotify` 为 true → 发通知。因此：切到其他会话 / 非聊天页 / 文档隐藏 / 窗口失焦都会通知。

**生成期间曾离开**：流式开始时清零；在 `visibilitychange` / `blur`/`focus` 与短周期轮询中，若文档不可见或主窗口失焦，则标记 `awayDuringGeneration`。完成后即使当前又回到前台，只要本轮曾离开，仍会尝试发完成通知。

### 点击深链

通知带有效 `sessionId` 时，主进程 `onNotificationClick` 调用：

```text
opptrix://chat?session={encodeURIComponent(sessionId)}
```

经既有 `deliverProtocolUrl` → renderer `onProtocolOpen` → `useDesktopShell` 解析 `route=chat` + `params.session` → `openChat(sessionId)`。无 `sessionId` 时仅 `focusMainWindow()`。

### IPC 与 preload

| IPC channel | preload API | 说明 |
|-------------|-------------|------|
| `notification-is-supported` | `notificationIsSupported()` | `Notification.isSupported()` |
| `notification-get-permission` | `notificationGetPermission()` | 读取系统真实权限（见下），非假 granted |
| `notification-request-permission` | `notificationRequestPermission()` | 刷新系统权限状态；壳启动时 `useDesktopShell` 会请求一次 |
| `notification-open-settings` | `notificationOpenSettings()` | 打开系统「通知」设置页（macOS / Windows） |
| `notification-show` | `showLocalNotification(payload)` | 校验后展示；点击走 `onNotificationClick`；权限为 denied 时返回 `false` |
| `window-is-focused` | `windowIsFocused()` | 主窗口是否 focused（注意力判断） |

协议事件仍为 `opptrix-protocol`（`onProtocolOpen`），与通知点击深链共用。

### 权限模型

| 平台 | 行为 |
|------|------|
| **macOS** | 优先 `systemPreferences.getNotificationSettings?.()` 的 `authorizationStatus` 映射为 `granted` / `denied` / `default`。无该 API 时**不得**无条件写 `granted`。`Notification.show` 的 `failed` 事件会记日志并回读权限。系统拒绝后无法编程式弹授权框，需用户在系统设置中开启；设置 → 关于提供引导，「打开系统设置」走 `notification-open-settings`。 |
| **Windows** | `configureNotificationIdentity(appId)` → `app.setAppUserModelId`；能力可用时视为 `granted` |
| **Linux** | 依赖桌面环境；`Notification.isSupported()` 为真时视为可发 |

Renderer：若展示返回失败且权限为 `denied`，聊天页温和提示一次（引导去系统设置）；设置「关于」也展示当前通知状态与操作入口。

### Payload（`LocalNotificationPayload`）

| 字段 | 类型 | 校验（主进程 `sanitizeNotificationPayload`） |
|------|------|-----------------------------------------------|
| `title` | string | 必填；trim 后非空且 ≤ 120 |
| `body` | string? | 可选；trim 后 ≤ 200 |
| `silent` | boolean? | 可选 |
| `tag` | string? | 可选；`^[A-Za-z0-9:_-]+$`，≤ 128 |
| `sessionId` | string? | 可选；`^[A-Za-z0-9_-]+$`，≤ 64；非法则丢弃（点击仅聚焦窗口） |
| `kind` | `'chat_done' \| 'chat_ask'`? | 未知 kind 忽略 |

非法 `title` → 整包拒绝（返回 `false`）。未知字段忽略。

### 平台注意

| 平台 | 注意 |
|------|------|
| **Windows** | `configureNotificationIdentity(appId)` → `app.setAppUserModelId`（`package.json` `build.appId`），否则通知可能不归到本应用 |
| **macOS** | 需系统「通知」权限；启动时刷新权限状态；用户在系统设置中拒绝则无法展示，应用内会引导去开启 |
| **Linux** | 依赖桌面环境对 Electron `Notification` 的支持（`Notification.isSupported()`）；部分环境可能静默失败 |

单元测试：`tests/chat-notifications.test.mjs`（注意力、离开标记、builder、sanitize、macOS 权限映射）。

## Composer 语音输入（本机 ASR）

聊天输入框工具栏提供麦克风按钮（**仅 Electron**）。流程：系统麦克风授权 → 浏览器 `MediaRecorder` 录音 → 主进程 IPC `speech-transcribe` → 本地 sidecar `POST /api/speech/transcribe` → `ffmpeg` 转 16kHz WAV → `@opptrix/local-inference` 识别 → 文本插入 composer 光标处。

**默认引擎**：SenseVoice。Composer 语音输入与新闻音视频转写均使用本机 SenseVoice 模型；安装包内置 q8 模型与 VAD，优先加载内置资源，其次用户目录，缺失时再下载。

### 交互

- 点按开始：空闲 → 正在聆听 → **说完静音约 2.8 秒自动结束并识别**；也可再点一次手动结束；`Escape` 取消当前录音。
- 最长约 60 秒；识别中按钮短暂禁用。
- Web / 非 Electron：不显示麦克风按钮。

### 权限与打包

| 项 | 说明 |
|----|------|
| macOS `NSMicrophoneUsageDescription` | `apps/desktop/package.json` → `build.mac.extendInfo` |
| Hardened Runtime | `entitlements.mac.plist` / inherit 含 `com.apple.security.device.audio-input` |
| Chromium media | `session.setPermissionRequestHandler` 仅放行音频 `media` |
| IPC | `media-get-mic-permission` / `media-request-mic-permission` / `media-open-mic-settings`；`speech-transcribe` / `speech-get-status` |

拒绝授权后可引导打开系统麦克风设置（macOS Privacy_Microphone / Windows `ms-settings:privacy-microphone`）。**不**申请扬声器权限。

### 环境变量（可选）

| 变量 | 默认 | 说明 |
|------|------|------|
| `OPPTRIX_SPEECH_ENGINE` | `sensevoice` | Composer 语音引擎：`sensevoice` 或 `whisper` |
| `OPPTRIX_SENSEVOICE_MODEL` | `q8` | SenseVoice 模型：`q8`（约 242MB）或 `f16`（约 448MB）；须用官方 FunAudioLLM GGUF |

| `OPPTRIX_SENSEVOICE_BIN` | — | 可选，覆盖 SenseVoice CLI 路径 |
| `OPPTRIX_MODELSCOPE_BASE` | `https://modelscope.cn` | SenseVoice GGUF 主下载源 |
| `OPPTRIX_HF_MIRROR` | `https://hf-mirror.com` | ModelScope 失败时的 HF 回退镜像 |
| `OPPTRIX_WHISPER_MODEL` | `tiny` | Whisper 模型名（`OPPTRIX_SPEECH_ENGINE=whisper` 时） |
| `OPPTRIX_WHISPER_LANGUAGE` | `zh` | Whisper 语言代码 |
| `OPPTRIX_WHISPER_PROMPT` | 投研简体提示 | whisper.cpp `--prompt`；偏置简体与数字代码。设为空字符串可关闭 |

#### SenseVoice（默认）

- 用户目录：`~/.opptrix/sensevoice/`（`models/` 放 GGUF，`bin/` 放预编译 CLI）。
- **安装包内置**：`resources/sensevoice/` → 打包后位于 `process.resourcesPath/sensevoice/`，含 `sensevoice-small-q8.gguf`（约 242MB）与 `fsmn-vad.gguf`（约 2MB）。
- **加载优先级**：内置 → `~/.opptrix/sensevoice/models` → 按需下载到用户目录（不写内置路径）。
- 构建时 `scripts/stage-sensevoice.mjs` 会优先从本地 `~/.opptrix/sensevoice/models` 拷贝，否则从 ModelScope 下载。
- 模型源：ModelScope [`FunAudioLLM/SenseVoiceSmall-GGUF`](https://modelscope.cn/models/FunAudioLLM/SenseVoiceSmall-GGUF/files)；默认 `sensevoice-small-q8.gguf`。
- 首次在无内置包环境（如 Web 自托管）转写时自动下载：预编译运行时（约 6MB）+ q8 模型 + VAD。
- **不要**使用 cloudlnk 的 `q4_k` / `q8_0`（缺 `embed.weight`，官方 CLI 会失败）。
- 支持平台：macOS arm64、Linux x64/arm64、Windows x64；其他平台请设 `OPPTRIX_SPEECH_ENGINE=whisper`。
- 中文 CER 相对 Whisper tiny 通常更好；无需 `--prompt`，输出会自动去掉 `<|...|>` 情感/事件标签。

#### Whisper（备选）

默认提示词会引导「简体中文 + 股票代码用阿拉伯数字（如 600519）」。提示词只影响解码偏置，不会出现在插入文本里。`tiny` 对代码仍可能不稳，可换 `small` 等更大模型。

换更大模型时：将对应 `ggml-*.bin` 放到 `~/.opptrix/whisper-models`，并设置 `OPPTRIX_WHISPER_MODEL`（如 `small`），无需改 UI。

首次 Whisper 转写前会在 `nodejs-whisper` 自带的 whisper.cpp 目录下用 CMake 编译 `whisper-cli`（需本机已装 CMake / 编译工具）；编译产物留在 `node_modules/nodejs-whisper/cpp/whisper.cpp/build/`。

## 命令隔离（Agent Shell）

智能助手在**本对话工作区**与已授权目录内运行 Python / Node 命令时，使用系统级隔离环境（`shell_run` / `shell_install`）。每段对话有独立的默认读写目录（`agent-workspace/sessions/<会话ID>/`），不会默认与其他对话共享文件。首次运行命令前会请你确认；访问外网或安装依赖时会另行确认。

**出站与 DNS（默认禁网）**：

- 沙箱内 **默认禁止 TCP 出站**；访问具体外网站点需你按域名确认（仅此一次 / 本对话允许该域名）。
- **永久白名单**：在 **设置 → 沙盒环境** 配置「访问白名单」与「允许局域网访问」；与部署变量 `OPPTRIX_SHELL_ALLOWED_DOMAINS`（逗号分隔，支持 `*.example.com`）合并，命中后不再询问。未开启局域网访问时，不能保存本地或私网地址。
- 运行命令时若沙箱拦截出站连接，会通过 **sandboxAskCallback** 即时弹出确认（与聊天侧外网访问确认同一套选项）。
- **DNS**：命令仍可使用系统解析公网域名；沙盒内自行运行 `dig` / `nslookup` 等会被拦截（且不在允许命令列表）。解析到私网或本机地址的连接仍会被拒绝。
- `ping` / 路由探测与运行命令**合并为一次确认**（展示命令与目标）。若仍失败，助手会提示改用 `http_fetch` 测网站连通性。

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
- **命令确认**：首次在本对话运行命令时会弹出确认（可勾选「本对话一律允许」）；访问外网或联网安装另有单独确认（`ping` 与运行命令合并为一次）。
- Linux deb 通过 `Depends: bubblewrap, socat, ripgrep` 在系统包管理器层拉齐依赖。
- AppImage 构建时会优先从可信源下载便携二进制到 `runtime-stage/sandbox-bins/{arch}/`（失败时回退构建机 `which`），sidecar 通过 `OPPTRIX_RUNTIME_STAGE` 注入 `bwrapPath` / `socatPath` / `ripgrep.command`。**deb 仍是最稳的安装路径**。
- Ubuntu 24.04+ 等系统若限制 user namespace，Opptrix 会在首次 `shell_run` / `shell_install` 时经 **pkexec** 一次性写入 AppArmor 配置并 reload，**不会**要求你自行粘贴终端命令。
- Electron 主进程提供 `shellInstallWindowsSandbox` / `shellInstallLinuxSandbox` IPC，供 UI 在 sidecar 无法完成授权时重试（同样是一次系统授权）。
- **设置页自检**：**设置 → 沙盒环境** 顶部 `SandboxEnvironmentStatusCard` 经 `GET /api/settings/sandbox/status` 展示就绪状态与说明；未就绪且 `can_auto_install` 时显示「完成设置」，触发上述 IPC 完成一次系统授权（与首次 `shell_run` 自动请求等价，可提前在设置中完成）。

详见 [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp) 中 `shell_platform_status` 字段（`ready` / `needs_elevation` / `can_auto_install` / `userns_restricted` 等）；REST 等价见 [API.md · 沙盒环境设置](./API.md#沙盒环境设置)。

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

Standalone pages (news / market / experts / settings) reuse `StandaloneElectronTitleBar` with left inset from `desktopChromeToolbarReserve` when the session sidebar is fully collapsed (same as chat `desktopTitleLeft(false)`), and right inset from `desktopTitleBarActionsRight()`.

Narrow windows (&lt; current session sidebar width × 2.5): left sidebar becomes a **full-height overlay** (`top: 0; bottom: 0`), light glass, **no fullscreen scrim**. At ≥ × 3, growing the window auto-expands the inline sidebar. Sidebar width defaults to 200px, draggable between ~196–360px, persisted in `localStorage` (`opptrix-sidebar-width`). Minimum window width: `DESKTOP_CHAT_MIN_WIDTH` (510px), synced with `apps/desktop/electron/main.cjs`.
