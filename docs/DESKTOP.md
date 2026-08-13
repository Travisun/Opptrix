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

新闻离线翻译结果缓存在主进程内存 Map 中，防抖落盘至 `~/.opptrix/news-translation-cache.json`（对齐行情引擎 Cache：LRU + 退出 flush）。本地翻译 GGUF **按需加载**（启动/下载完成不进显存；首次翻译或显式 `preloadTranslationModel` 才 load），空闲约 12 分钟后真正 `dispose`（`OPPTRIX_TRANSLATION_IDLE_MS`，`0` 关闭）；句段内存 LRU 保留，换模/退出亦走官方 dispose。 sidecar `LlamaRuntime` 同语义 idle unload。`translation-start-download` IPC **立即 ack** `{ started, download }`，GGUF 后台下载，进度经 `translation-download-progress` / `translation-get-status.download`（并发不双开）。

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

### 主窗口尺寸

- **默认大小**：约 **1115×635**（按主显示器 work area 约 70%×75% 再封顶），最小宽高与 UI 一致（宽 ≥ `DESKTOP_CHAT_MIN_WIDTH` / 510px，高 ≥ 600）。
- **记住窗口大小**：用户调整后的宽高与位置写入 Electron `userData` 下的 `window-state.json`（`resize` / `move` 防抖保存，关闭前再写一次）。最大化 / 全屏不会把铺满后的尺寸当成普通窗口尺寸；位置若不在任一显示器可见 work area 内，下次启动回退为居中。三端（macOS / Windows / Linux）同一套逻辑（见 `apps/desktop/electron/window-state.cjs`）。

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

**发布与自动更新**（版本号、产物命名、GitHub Releases 上传、三端兼容）见 **[DESKTOP-RELEASE.md](./DESKTOP-RELEASE.md)**。发版前相对上一标签的兼容性 / 打包深化检查见 **[DESKTOP-UPGRADE-PREP.md](./DESKTOP-UPGRADE-PREP.md)**。

The release app loads `http://127.0.0.1:8711` (UI + API same origin).

## 计划任务与后台常驻

### 唯一主路径（产品设计）

```
登录 / 前台 / 托盘常驻
  → Electron 主进程（托盘 UI）
  → 唯一 sidecar API（ScheduleService.start 每 20s tick）
完全退出 → 不跑计划任务
不再注册 LaunchAgent / schtasks / systemd timer
```

桌面端计划任务 **仅** 在 sidecar 进程内执行：`ScheduleService.start()` 每 **20s** 扫描到期任务（`trigger: 'timer'`）。**headless-tick** 若被旧 OS runner 误触发，**只**对已有 sidecar `POST /api/schedule/tick`；**禁止**再 `spawnSidecarProcess`（应用未运行 = 计划不应执行）。**不再**注册 LaunchAgent / Windows schtasks / Linux systemd timer；升级启动时 `reconcileOsSchedule` **强制** `removeTickRegistration` 并清理旧 runner 脚本（清扫能力保留）。

关窗到托盘时 sidecar 与 timer 继续运行；从托盘 **完全退出** 后计划任务 **不会** 执行。默认开启登录自启 `autostart`（`--background` 托盘常驻）：macOS / Windows 用 Electron Login Item，Linux 写 XDG Autostart（`~/.config/autostart/opptrix.desktop`）；与已废除的 OS tick 无关。

### 关窗 = 托盘常驻（生产包）

打包应用（`app.isPackaged`）启用系统托盘（`tray.cjs`）。用户点关闭主窗口时 **不退出进程**（`attachCloseToTray` → `preventDefault` + `hide`，并隐藏 macOS Dock / Windows·Linux 任务栏图标，仅保留系统托盘）；从托盘「显示」时 `revealAppFromTray` / `ensureMainWindowVisible` 恢复 Dock 与任务栏。sidecar 与进程内 20s timer 继续运行。托盘菜单含计划任务状态摘要（`fetchScheduleStatus`）与「显示 Opptrix」。真正退出须选托盘/菜单 **退出**（`app.isQuitting = true` 后允许窗口关闭并 `stopSidecar`）。

**Sidecar 守护（生产包，兜底）**：主进程在常驻启动成功后监督自有 sidecar（非开发、非 `reuse` 端口）。子进程意外退出时按指数退避（1s→2s→…→30s）自动拉起并重新做 health；另有约 20s 健康巡检，发现「进程在但端口无响应」或进程已消失时同样重启（与 exit 路径共用单飞锁，避免双启）。用户退出、更新安装或短命 tick 退出前会停止守护，并对 sidecar 给予 ≥8.5s 软关闭窗口（对齐 server 内原生 Duck/Lance/ONNX 关闭），再 SIGKILL，减轻 macOS「意外退出」类崩溃框。`before-quit`（含 Cmd+Q）在 sidecar 未就绪退出前会 `preventDefault` 并等待宽限关闭。

> **说明**：历史上 sidecar `SIGTRAP` 根因是 LanceDB 文档向量库在新闻洪峰下 `delete+add` 从不 `optimize`，`_versions` 爆炸至近 u64 上限后原生崩溃。现架构：**资讯仅一处 FTS**（user-store，与统一搜索同源；**不再**双写 doc-library 切块、**不**写入 Lance）；统一搜索首次 `ensureIndexes` 按页灌入 FTS、不驻留全量文章对象。研报向量路径保留写串行、向量校验、定期 optimize、病理库安全重建；`upsert` 优先 `mergeInsert(on: chunk_id)`，不可用时回退 delete+add；**search 读优先**（可插队尚未开始的写/optimize，写仍互斥串行）；Lance pending 有界（超限丢弃最旧尚未开始的 write）；版本软顶 `OPPTRIX_LANCE_MAX_VERSIONS`（默认 64）在写路径与 retention 触发更积极 optimize。守护重启 **不能** 替代根治。已损坏的本机 `~/.opptrix/lancedb/doc_chunks` 会在下次 ensure/启动时检测并重建空表，随后**限速**调度 `embedPendingDocuments`（清非 news 的 `embedded_at` 后回填；`OPPTRIX_LANCE_BACKFILL_LIMIT` / `OPPTRIX_LANCE_BACKFILL_DELAY_MS` 可调；失败不阻断打开空表）。

**更新安装防护（兼容托盘 / 计划任务）**：

1. 安装前：`isUpdating` + `isQuitting` → 停 reconcile 轮询 → **移除遗留 OS tick**（若仍有 launchd / 任务计划 / systemd-user）→ 销毁托盘 → 等待 sidecar 退出 → 销毁窗口（卸掉关窗进托盘）→ **`killResidualAppProcessesForUpdate`**（`kill-app-for-update.cjs`）：三端按 **.app bundle / 安装目录 / AppImage·deb 路径** 强杀残留 PID（Helper、孤儿实例、sidecar 孙进程等），**始终排除当前主进程 `process.pid`**；Linux 另用 `/proc/*/exe`+cmdline 双通道并 **settle 后再扫一轮**（与 macOS/Windows 对等），再交给 `quitAndInstall`  
2. 安装中：`second-instance`（含旧版 `--schedule-tick`）一律忽略，避免第二实例拖住进程  
3. 遗留 OS tick 唤醒（`--schedule-tick`）**不**自动 `quitAndInstall`，等下次正常打开再装  
4. `quitAndInstall` 后约 3s 仍未退出 → 强制 `app.exit`（防 macOS 安装器因应用仍在运行而卡住 / Linux AppImage 占锁）；约 12s 仍存活 → 清安装态、提示用户强制退出后重开即可继续安装，并重建托盘/主窗口，再 `reconcileOsSchedule`（仅 remove + 登录项）  
5. Windows 另有 NSIS（`nsis/installer.nsh`）在写文件前删 `OpptrixScheduleTick` 并 `taskkill` / 按 `$INSTDIR` 路径强杀；Electron 侧强杀是安装器唤起前的补强，语义对齐但不无差别先杀本进程  
6. Linux 用户退出时与 Windows 一样有短超时 `app.exit` 兜底，避免 AppImage 幽灵进程占住下一版安装  


托盘图标源文件在仓库 `icons/tray/`，经 `prepare-icons.mjs` 同步到 `apps/desktop/build/icons/tray/`（已纳入 `electron-builder` `files`）。

#### 仓库内当前 PNG（运行时直接加载）

| 平台 | 资源文件名 | 像素 |
|------|------------|------|
| **macOS** | `trayTemplate.png` / `trayTemplate@2x.png` / `trayTemplate@3x.png` | 22 / 44 / 66（文件名含 `Template` → 系统着色） |
| **Windows** | `tray.ico`（含 16 / 20 / 24 / 32 四个 entry） | 由 `tray-color*.png` 合成 |
| **Linux** | `tray-color.png` / `tray-color@1.25x.png` / `tray-color@1.5x.png` / `tray-color@2x.png` | 16 / 20 / 24 / 32 |

运行时优先加载上述专用图；缺失时回退为应用 Logo 缩放。Win/Linux 彩色 PNG 源文件命名须用 Electron DPI 后缀（`@1.25x` / `@1.5x` / `@2x`），不要用 Sketch 的 `@20w` 等导出名进仓库。

#### Windows 清晰度：请按 DPI 导出专用尺寸（推荐）

Windows 托盘逻辑边长约 **16 CSS px**，系统缩放常见为 100% / 125% / 150% / 200%，对应需要 **独立像素稿**（不要只靠从大图缩到 16px）：

| 缩放 | 像素边长 | 用途 |
|------|----------|------|
| 100% | **16×16** | 默认托盘 |
| 125% | **20×20** | HiDPI |
| 150% | **24×24** | HiDPI |
| 200% | **32×32** | HiDPI（≈ `@2x`） |

Electron 官方建议 Windows 用 **多尺寸 `.ico`**（至少含上表 small 尺寸）。本仓库 Win 托盘运行时加载 `tray.ico`（`prepare-icons.mjs` 从四张 `tray-color*.png` 合成）；Linux 仍用 PNG 路径字符串（Electron 自动匹配 `@1.25x` / `@1.5x` / `@2x`  sibling）。

**设计要点（比「满足分片尺寸」更重要）**

1. **按 16px 像素稿画剪影**：1px 安全边；笔画尽量 ≥2px；少细线/复杂内孔。
2. **透明底 + 实色形体**（外形与 mac `trayTemplate` 一致更好）；避免「彩色底上再叠浅色字标」——16px 上几乎不可读。
3. Cursor 一类清晰托盘：mac 侧是 **透明抠出的剪影**（非铺满色块）；Win 侧靠多尺寸 ICO，而不是指望 PNG `@2x` 文件名。

#### Sketch 能否直接导出 `.ico` / `.icns`？

**不能。** Sketch / `sketchtool` 原生只导出 PNG、JPG、SVG、PDF 等；**不支持直接导出 `.ico` 或 `.icns`**。

推荐流程：

1. **Sketch**：为每个尺寸建独立 Artboard / Exportable（Win/Linux 彩色：16 / 20 / 24 / 32；mac Template：22 + `@2x`/`@3x`），导出 **PNG**；入库前将 Win/Linux 彩色稿重命名为 `tray-color.png` / `@1.25x` / `@1.5x` / `@2x`。
2. **合成 `.ico`（Windows 托盘 / 应用图标）**  
   - 插件：Icon Slate、Iconboard 等可把多尺寸 PNG 打成 `.ico`；或  
   - 本仓库：`prepare-icons.mjs` 用 `png-to-ico` 生成 `build/icons/icon.ico`（应用图标，来自 `icons/logo@*.png`）与 `icons/tray/tray.ico` + `build/icons/tray/tray.ico`（托盘，来自四张 `tray-color*.png`）。
3. **合成 `.icns`（macOS 应用图标，不是托盘）**  
   - 托盘用 `trayTemplate*.png` 即可，**不需要** `.icns`；  
   - Dock / DMG 应用图标：PNG → `iconutil`（`prepare-icons.mjs` 在 macOS 上会生成 `build/icons/icon.icns`），或 Icon Slate 等插件。  
   - mac App 使用 Icon Composer（`build.mac.icon` → `icon.icon`）；afterPack 用完整 `build/icons/icon.icns` 覆盖 bundle 内 `Resources/icon.icns`，并去掉 Info.plist 的 `CFBundleIconName`（否则通知中心优先读 Assets.car，仍显示 Composer 旧图）。

> 「hdi」一般指 **`.icns`**（Apple icon 容器）。托盘请继续交 PNG Template；`.icns` 只用于 App / DMG 图标。

开发模式（未打包）默认 **无** 关窗驻托盘行为；关窗会走 `window-all-closed` → `app.quit()`。

### 启动参数（`launch-args.cjs`）

| 参数 | 含义 |
|------|------|
| `--background` | 无 splash/主窗启动；macOS 隐藏 Dock；仍 spawn sidecar；进程内 timer 工作；reconcile 仅 remove 遗留 OS tick + 同步登录项 |
| `--schedule-tick` | **兼容**旧 LaunchAgent：短命 worker 在 sidecar ready 后 `POST /api/schedule/tick` 后退出；**新版本不再注册**此类 OS 任务 |

**已废除**：系统级 OS tick（LaunchAgent / schtasks / systemd timer）、OpptrixSchedule Helper 冷启、headless-tick 冷启 sidecar。适配器仍保留 `removeTickRegistration` / `probeTickRegistration`，供升级清理。`userData` 内旧 `os-schedule-tick-runner.*` 与 endpoint 冷启字段在 reconcile 时清除；`os-schedule-endpoint.json` 仅保留 loopback `host`/`port` 供 UI 复用 sidecar。遗留 runner 若仍调用 `headless-tick.cjs`，仅 HTTP tick，失败即 exit≠0。

Windows NSIS（`nsis/installer.nsh`）仍会在安装前移除 `OpptrixScheduleTick`，避免旧版定时拉起阻塞覆盖安装。

单实例锁：若已有实例运行，带 `--schedule-tick` 的第二次启动（仅兼容旧 plist）只触发 `handleScheduleTickFromOs()`，不重复开主窗（除非未带 `--background`）。

### `schedule-bridge.cjs` 与 reconcile

主进程通过 bridge 调用 sidecar REST（`configureScheduleBridge({ host, port })` 写入 endpoint 的 host/port）：

1. `GET /api/schedule/os/reconcile` — `register_tick` **恒为 false**；读取 `autostart`
2. `getOsScheduleAdapter().removeTickRegistration()` — **每次**启动/轮询强制注销遗留 OS 任务（永不 `ensureTickRegistration`）
3. `purgeLegacyOsTickArtifacts` — 删除旧 runner 脚本、剥离 endpoint 冷启字段
4. 同步 `autostart`：macOS/Windows → `app.setLoginItemSettings({ openAtLogin, openAsHidden, args: ['--background'] })`；Linux → XDG Autostart `.desktop`（`linux-autostart.cjs`）
5. `PATCH /api/schedule/settings` — 回写 `os_tick_status`（通常 `n/a`）

前台与 `--background` 启动后均 `reconcileOsSchedule()`，并每 **30s** 轮询（幂等 remove）。

### 设置字段（与 API 一致）

| 字段 | 桌面行为 |
|------|----------|
| `master_enabled` | 为 false 时 tick 跳过执行 |
| `run_when_closed` | **兼容字段**，始终 false；API 忽略写入；UI 已隐藏 |
| `autostart` | 默认 true；macOS/Windows 登录项、Linux XDG Autostart（`--background` 托盘常驻） |
| `allow_shell_scripts` | 与 Agent/REST 一致；脚本类任务门禁 |

REST 与 Agent 工具详见 [API.md · 计划任务](./API.md#计划任务--schedule)、[AGENT-GUIDE.md §4.2 · automation pack](./AGENT-GUIDE.md#42-agent-与-mcp)。

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
| `OPPTRIX_SQLITE_MEM_PROFILE` | SQLite 每连接内存档位：`low` / `medium` / `high`（未设则按机器总内存自动：&lt;6GB low，&lt;12GB medium，否则 high）；作用于 user-store / market-data / doc-library；`low` 时 Duck 读并发、boot warm、OCR 批并行亦按低配收敛 |
| `OPPTRIX_DUCK_READ_CONCURRENCY` | Duck 只读并发（默认 3；低配自动 1）；写恒为 1 |
| `OPPTRIX_HYDRATE_CONCURRENCY` | L1 `hydrateStocks` 跨标的并发（默认 2；低配 1；上限 3）；同码内股东→伙伴仍串行 |
| `OPPTRIX_OCR_CONCURRENCY` | 文档内嵌图 OCR 批并行（默认 3；低配 / `OPPTRIX_SQLITE_MEM_PROFILE=low` 或 totalmem&lt;6GB → 2；上限 4）。语义 embedding 已加载时再降到 1（不强制卸载 embedding） |
| `OPPTRIX_OCR_IDLE_MS` | RapidOCR（`ocr-l2`）空闲卸载超时（默认 12 分钟；`0` 关闭）；首次识别才加载，空闲后释放内存，再次 OCR 可重建 |
| `OPPTRIX_DUCK_WARM_ON_BOOT` | 设为 `0` 跳过 MarketDataStore 启动时 `warmReadCaches`（首次查询仍会拉统计） |
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
| `open-local-directory` | `openLocalDirectory(dirPath)` | 用系统文件管理器打开目录；路径须在 `resolveUserDataRoot()/agent-workspace` 之下，不存在则递归创建后再打开 |
| `chat-debug-open-log-dir` | `chatDebugOpenLogDir()` | 打开（必要时先创建）`~/.opptrix/logs/chat-debug`；设置 → 关于「对话调试日志」（默认关闭）按会话写 JSONL，单文件超限 rotate 为 `.1`，目录有会话数/总字节软顶并 prune 最旧 |

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
| **Windows** | `configureNotificationIdentity(appId)` → `app.setAppUserModelId`（`package.json` `build.appId`），否则通知可能不归到本应用；toast 图标经 `Notification.icon` 指向 `prepare-icons` 产出的 `icon.ico` / logo PNG |
| **macOS** | 需系统「通知」权限；启动时刷新权限状态；用户在系统设置中拒绝则无法展示，应用内会引导去开启；`Notification.icon` 无效，依赖 bundle `Resources/icon.icns`（afterPack 覆盖完整 icns，并移除 `CFBundleIconName` 以免走 Assets.car） |
| **Linux** | 依赖桌面环境对 Electron `Notification` 的支持（`Notification.isSupported()`）；部分环境可能静默失败。toast 图标经 `Notification.icon` 指向 `build/icons/linux/*.png` 或 logo PNG；桌面入口图标仍用 `build.linux.icon` |

单元测试：`tests/chat-notifications.test.mjs`（注意力、离开标记、builder、sanitize、macOS 权限映射）。

## Composer 语音输入（本机 ASR）

聊天输入框工具栏提供麦克风按钮（**仅 Electron**）。流程：系统麦克风授权 → 浏览器 `MediaRecorder` 录音 → 主进程 IPC `speech-transcribe` → 本地 sidecar `POST /api/speech/transcribe` → `ffmpeg` 转 16kHz WAV → `@opptrix/local-inference` 识别 → 文本插入 composer 光标处。主进程转写等待上限 **180s**（冷启 + 较长录音）；与 UI 本机重接口超时一致，全局快路径仍为 10s。

**默认引擎**：SenseVoice。Composer 语音输入与新闻音视频转写均使用本机 SenseVoice 模型；安装包内置 q8 模型与 VAD，优先加载内置资源，其次用户目录，缺失时再下载。

### 文档库语义检索与解析引擎（桌面内置 / 离线）

Hybrid RAG 使用的 **multilingual-e5-small** 权重默认打进桌面安装包（与 SenseVoice 同为 `extraResources`）：

| 项 | 说明 |
|----|------|
| Stage | `apps/desktop/scripts/stage-e5.mjs` → `resources/llms/multilingual-e5-small/` |
| 打包 | `extraResources`：`resources/llms` → `llms`（与多模态 GGUF 同根） |
| 运行时 | 优先内置 → 开发 `OPPTRIX_LLM_DIR` / `apps/server/llms` / `llms` → `~/.opptrix/llms/multilingual-e5-small/` → 旧 `~/.opptrix/models/…` → 按需下载（开发态） |
| 覆盖 | `OPPTRIX_E5_BUNDLED_DIR`（测试 / sidecar 注入）；可选 `OPPTRIX_LLM_DIR` |
| 卸载 | 设置页「卸下」仅清用户目录副本，不删安装包内置 |
| 首启 | sidecar 启动后后台 `ensureBundledRagRuntime()` **仅探测磁盘**是否已安装语义模型，**不**把 E5 载入内存；首次语义检索 / 入库 embed / 安装模型后再 `tryEnable`，设置页显示「应用自带」无需再装 |
| 空闲卸载 | 成功 embed 后若一段时间无再用，卸下内存中的语义模型（默认约 12 分钟，`OPPTRIX_EMBED_IDLE_MS` 可覆盖，`0` 关闭）；磁盘「已安装」保留，下次检索会再加载。`closeDocLibraryService` 退出时一并释放 |

深度整理（OCR，`ocr-l2` / `@gutenye/ocr-node`）ONNX 与语义检索模型默认内置（`resources/llms/<id>/`，用户副本 `~/.opptrix/llms/<id>/`）。**不依赖** Python 侧车；`pdfplumber` L1 已从默认路径与设置页移除。

Library hybrid 预筛与资讯 retention 的文档/文章 id 列举改为 **SQL 分页（游标）**，避免一次全表进内存；向量侧按页聚合 top-K，**news 仍不进 Lance**。

| 项 | 说明 |
|----|------|
| OCR 模型 Stage | `apps/desktop/scripts/stage-rapidocr.mjs` → `resources/llms/rapidocr-ppocrv4-mobile/`（PP-OCRv4 mobile ONNX） |
| engines Stage | `apps/desktop/scripts/stage-rag-engines.mjs` → `resources/engines/<platform>-<arch>/MANIFEST.json`（仅写 MANIFEST / 兼容 prebuild+audit；**不再**下载 pdfplumber / rapidocr Python wheels）。CI / release 步骤名：`Stage RAG engines MANIFEST (Node OCR)` |
| 打包 | `extraResources`：`resources/llms` → `llms`；`resources/engines` → `engines`（兼容旧探测） |
| 运行时 | Node ONNX OCR；`OPPTRIX_RAG_ENGINES_BUNDLED_DIR` 由 `sidecar-launch.cjs`（`buildSidecarEnv`）注入 |
| 首启 | 后台 `ensureBundledRagRuntime()`：启用 embedding；OCR 模型齐全则深度整理可用 |
| 空闲卸载 | 首次 OCR 才 `Ocr.create`；成功识别后空闲默认约 12 分钟释放 singleton（`OPPTRIX_OCR_IDLE_MS`，`0` 关闭）；`closeDocLibraryService` / server shutdown 一并清理 |

禁止默认路径纳入 PyMuPDF（AGPL）。研报入库支持 `.pdf` / `.txt` / `.md` / `.docx` / `.pptx` / 图片；`.pptx` 按幻灯片分 chunk。

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
| `OPPTRIX_EMBED_IDLE_MS` | `720000`（12 分钟） | 语义 embedding 模型空闲卸载超时；`0` 关闭空闲卸载 |
| `OPPTRIX_OCR_IDLE_MS` | `720000`（12 分钟） | RapidOCR 空闲卸载超时；`0` 关闭；status/健康检查不创建实例 |
| `OPPTRIX_TRANSLATION_IDLE_MS` | `720000`（12 分钟） | 本地翻译 GGUF 空闲卸载超时（真正 dispose）；`0` 关闭；句段 LRU 不随卸载清空 |
| `OPPTRIX_EMBED_BATCH_SIZE` | `8` | transformers 真 batch 推理批大小（钳位 8～32）；失败时回退逐条 |
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
- **ensure 异步**：`POST /api/news/multimodal/sensevoice/ensure` 立即返回 job，客户端轮询至 `ready`/`error`；设置页 bootstrap 与显式准备共用同一任务，不双开下载。
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

智能助手在**本对话工作区**与已授权目录内运行 Python / Node 命令时，使用系统级隔离环境（`opptrix_run` / `shell_install`）。每段对话有独立的默认读写目录（`agent-workspace/sessions/<会话ID>/`），不会默认与其他对话共享文件。公共复用区 `agent-workspace/shared` 会按闲置时间与容量软清理旧文件（不删会话目录、不删内置包）；浏览截图目录同样按保留天数与容量硬顶自动回收（默认约 7 天 / 512MiB，可用 `OPPTRIX_BROWSER_SCREENSHOT_MAX_AGE_MS` / `OPPTRIX_BROWSER_SCREENSHOT_MAX_BYTES` 调节，`0` 关闭对应维度；关闭浏览器会话不会立刻删图）。本地 `opptrix.db` / `market.db` 则低频做 WAL checkpoint，并在新库启用 `auto_vacuum=INCREMENTAL` 时跑 `incremental_vacuum` 还盘（全库 VACUUM 默认关闭，可用 `OPPTRIX_SQLITE_VACUUM=1` 开启）。会话上下文投影另存于私有 `~/.opptrix/session-state/<会话ID>/`（与工作区平级，工具不可读）；启动与周期维护会扫掉已无对应会话的孤儿目录。聊天附件落盘于 `~/.opptrix/chat-attachments/<会话ID>/`；删除会话时会级联清理该目录，启动时也会扫掉已无对应会话的孤儿附件目录。研报库会限速回收无文档引用的 blob/markdown，并清理用户数据根下过期的半成品下载临时文件。首次运行命令前会请你确认；访问外网或安装依赖时会另行确认。

**Windows 隔离强度（设置 → 沙盒环境）**：

| 模式（用户可见） | 设置值 | 你需要知道的 |
|------------------|--------|--------------|
| **完整隔离** | `elevated` | 网络与进程围栏最强；**首次**可能需一次系统授权。授权环境失效时，应用会**自动刷新并再执行一次**（通常你无感）。 |
| **基础隔离**（默认） | `unelevated` | **无需**上述系统授权；进程降权运行。**网络限制更弱**（默认仍禁出站，靠确认与白名单；无法启用与完整隔离同等的完整网络围栏）。 |

旧客户端未写该字段、或字段值非法时按基础隔离处理；已显式保存为完整隔离的配置保持不变。

**出站与 DNS（默认禁网）**：

- 沙箱内 **默认禁止 TCP 出站**；访问具体外网站点需你按域名确认（仅此一次 / 本对话允许该域名）。
- **永久白名单**：在 **设置 → 沙盒环境** 配置「访问白名单」与「允许局域网访问」；与部署变量 `OPPTRIX_SHELL_ALLOWED_DOMAINS`（逗号分隔，支持 `*.example.com`）合并，命中后不再询问。未开启局域网访问时，不能保存本地或私网地址。
- 运行命令时若隔离环境拦截出站连接，会即时弹出确认（与聊天侧外网访问确认同一套选项）。（架构：`sandboxAskCallback`）
- **DNS**：命令仍可使用系统解析公网域名；沙盒内自行运行 `dig` / `nslookup` 等会被拦截（且不在允许命令列表）。解析到私网或本机地址的连接仍会被拒绝。
- `ping` / 路由探测与运行命令**合并为一次确认**（展示命令与目标）。若仍失败，助手会提示改用网页连通性检测。

桌面安装包会尽量自带组件并自动就绪；**完整隔离仍可能需要你配合一次系统授权或系统策略调整**。

| 平台 | 分发方式 | 你需要做什么 |
|------|----------|--------------|
| **macOS** | 隔离能力由系统提供 | 一般无需额外操作 |
| **Windows** | 隔离组件随应用内置 | **基础隔离（默认）**：无需系统授权，网络限制更弱。可在设置改为**完整隔离**：首次可能出现一次系统授权，点允许即可；取消后可稍后在设置中重试。授权失效时自动刷新再试一次 |
| **Linux deb** | `bubblewrap`、`socat`、`ripgrep` 写入包依赖 | 用 apt 安装 deb 时会**自动安装依赖**，一般无需手动操作 |
| **Linux AppImage** | 构建时下载或内置便携二进制到 `runtime-stage/sandbox-bins/` | 若内置组件不可用，会提示改用 deb 或联系支持 |
| **Ubuntu 24.04+ 等** | 内核可能限制非特权 user namespace | **首次使用命令隔离时可能出现一次系统授权（pkexec）**；点允许即可，无需手动执行任何命令。若取消授权，可稍后在应用内重试。无 polkit 或无管理员权限的企业机仍可能失败 |

**边界说明（可行性）**：

- **Windows 完整隔离**（架构：`elevated` / `srt-win` + 网络过滤器）：机器级隔离凭据与网络策略需要**一次**系统授权；Opptrix 会在首次 `opptrix_run` / `shell_install` 时自动尝试触发，**不会**要求你自行执行安装命令。凭据类失败（Windows 错误 **1326 / 1312**）时最多 **force 刷新再执行一次**。
- **Windows 基础隔离**（架构：`unelevated` / RestrictedToken）：不初始化完整隔离凭据与网络过滤器；`ensureWindowsSandboxReady` 直接就绪。请求与完整隔离同等的完整网络隔离会硬拒绝；出站靠确认与白名单。
- Windows 沙箱 `allowRead` **不会**对 `WINDIR` / Program Files / 盘符根做 ACL stamp（依赖系统默认读取权限）；请勿以「管理员运行 Opptrix」作为常规解决办法。
- **命令确认**：首次在本对话运行命令时会弹出确认（可勾选「本对话一律允许」）；访问外网或联网安装另有单独确认（`ping` 与运行命令合并为一次）。
- Linux deb 通过 `Depends: bubblewrap, socat, ripgrep` 在系统包管理器层拉齐依赖。
- AppImage 构建时会优先从可信源下载便携二进制到 `runtime-stage/sandbox-bins/{arch}/`（失败时回退构建机 `which`），sidecar 通过 `OPPTRIX_RUNTIME_STAGE` 注入 `bwrapPath` / `socatPath` / `ripgrep.command`。**deb 仍是最稳的安装路径**。
- Ubuntu 24.04+ 等系统若限制 user namespace，Opptrix 会在首次 `opptrix_run` / `shell_install` 时经 **pkexec** 一次性写入 AppArmor 配置并 reload，**不会**要求你自行粘贴终端命令。
- Electron 主进程提供 `shellInstallWindowsSandbox` / `shellInstallLinuxSandbox` IPC，供 UI 在 sidecar 无法完成授权时重试（同样是一次系统授权；完整隔离路径）。
- **设置页自检**：**设置 → 沙盒环境** 顶部状态卡经 `GET /api/settings/sandbox/status` 展示就绪状态与说明；未就绪且可自动完成时显示「完成设置」，触发上述 IPC（与首次运行命令时的自动请求等价，可提前在设置中完成）。

详见 [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp) 中 `shell_platform_status` 字段（`ready` / `needs_elevation` / `can_auto_install` / `userns_restricted` / `windows_isolation_mode` / `network_isolation_level` 等）；REST 等价见 [API.md · 沙盒环境设置](./API.md#沙盒环境设置)。

### Window blur + sidebar

路线 1（系统窗形）：隐藏标题栏，**保留系统圆角与阴影**；**不开**整窗 `transparent: true`，也**不用** CSS 大圆角裁切外轮廓。侧栏毛玻璃仍靠平台材质（对齐 Cursor）。

| 平台 | 窗口层 | 窗底色（浅 / 深） | 固定左侧栏 |
|------|--------|-------------------|------------|
| macOS | `titleBarStyle: 'hiddenInset'` + `vibrancy: 'sidebar'`（**不开** `transparent`） | `#00FFFFFF` / `#40000000`（深色约 25% 黑罩压暗毛玻璃） | `color-mix(canvasAlt 42%/36%)` 轻穿透（对齐 Cursor sidebar） |
| Windows | `frame: false` + `backgroundMaterial: 'mica'`（**不开** `transparent`） | `#00FFFFFF` / `#00000000` | 同上比例（无过重白罩）；Win11 系统圆角默认开启 |
| Linux | `frame: false` + 实色窗口底 | 实色 splash / canvas | 保留 CSS `.opptrix-glass-sidebar` 毛玻璃（无原生材质） |

启动时窗口底先实色 splash（`SPLASH_CANVAS`）；shell ready 后 mac/win 按主题切换上表底色并启用 vibrancy/mica，仅让网页透明区透出系统材质（窗口本身仍非 transparent）。切换浅/深色时 `applyNativeThemeSource` 会重新 `enableWindowBlurBackground`。最大化/全屏时系统窗形自动直角，无需 CSS squared 逻辑。

窄窗浮层侧栏仍盖在实色主内容上，继续用 CSS 毛玻璃。文档标记类：`html.opptrix-electron-vibrancy`。vibrancy 开启时对齐 Cursor glass：`color-mix` 侧栏约 **42% / 36%**（`canvasAlt`，浅/深）、主工作区约 **84% / 72%**（`canvas`）；启动 / onboarding 仍实色。Win mica 用同比例，无过重白罩。

### Title bar z-index

Stacking order (low → high), defined in `client-ui/src/desktop/constants.ts` as `DESKTOP_Z_*`:

| Layer | Value | Usage |
|-------|-------|-------|
| Title drag band | `1100` | `DESKTOP_Z_TITLE` — chat title chrome |
| Overlay sidebar | `1150` | `DESKTOP_Z_OVERLAY_SIDEBAR` — compact-window floating sidebar + edge trigger |
| Panel title bands | `1200` | `DESKTOP_Z_PANEL_TITLE` — news / market / right-panel title rows |
| Toolbar | `1300` | `DESKTOP_Z_CHROME_TOOLS` — global fixed content chrome |
| Clickable session title | `1310` | `DESKTOP_Z_TITLE_INTERACTIVE` — title text above drag layer |
| Window-frame titlebar | `2100` | Non-mac `WindowFrameTitleBar` — brand + menu + min/max/close; above onboarding |

On **macOS**, native traffic lights are hidden (`setWindowButtonVisibility(false)`); compact HTML stand-ins (`MacTrafficLights`, ~14px) sit in the content chrome band (`hiddenInset`), and workspace splitters may extend into that band. Sidebar keeps its own brand row (plain text «Opptrix 工作台» + version). On **Windows / Linux**, `WindowFrameTitleBar` adds a dedicated glass strip above content chrome: app icon + plain text «Opptrix工作台» (no wordmark SVG, no version) + `FrameAppMenu` on the left (brand block is drag; menu is no-drag), Win11-style caption buttons (46×titlebar, close = red/white hover) on the right. The session sidebar omits its brand row and tightens the top menu spacing. Splitters stay below the frame titlebar and do not pierce it.

Standalone pages (news / market / experts / settings) reuse `StandaloneElectronTitleBar` with left inset from `desktopChromeToolbarReserve` when the session sidebar is fully collapsed (same as chat `desktopTitleLeft(false)`), and right inset from `desktopTitleBarActionsRight()`. Settings sidebar matches the session sidebar’s top-through glass; `StandaloneElectronTitleBar` only covers the settings content column (panel mode uses the compact title inset; overlay mode keeps `chromeToolbarReserve`).

Narrow windows (&lt; current session sidebar width × 2.5): left sidebar becomes a **full-height overlay** (`top: 0; bottom: 0`), light glass, **no fullscreen scrim**. At ≥ × 3, growing the window auto-expands the inline sidebar. Sidebar width defaults to 250px, draggable between ~196–360px, persisted in `localStorage` (`opptrix-sidebar-width`). Minimum window width: `DESKTOP_CHAT_MIN_WIDTH` (510px), synced with `apps/desktop/electron/window-state.cjs` (`MIN_WIDTH`). Outer window default size and last size/position: see [主窗口尺寸](#主窗口尺寸).
