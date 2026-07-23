# @opptrix/agent-browser

Agent 内置浏览器会话（Playwright Chromium，headless）。

## Chromium 安装

`npm install` 时会通过 `postinstall` 自动尝试安装 Chromium（仅 chromium，不含 firefox/webkit）。
Agent 浏览在 headless 下使用已安装的完整 Chromium（`executablePath`），无需单独的 headless-shell。

跳过自动安装：

```bash
OPPTRIX_SKIP_PLAYWRIGHT_BROWSER=1 npm install
```

手动重装：

```bash
npm run install-browser -w @opptrix/agent-browser
```

桌面安装包在打包阶段已将 Chromium 放入 `runtime-stage/playwright-browsers`，运行时通过 `PLAYWRIGHT_BROWSERS_PATH` 加载，无需用户额外下载。

## 导出

- `createBrowserSessionManager` — 单会话管理（懒启动、串行互斥）
- `registerBrowserShutdownHooks` — 进程退出时关闭浏览器
- 类型：`BrowserSession`、`BrowserSessionManager` 等
