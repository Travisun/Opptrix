# @opptrix/agent-browser

Agent 内置浏览器会话（Playwright Chromium，headless）。

## 前置条件

首次使用前安装 Chromium：

```bash
npm run install-browser -w @opptrix/agent-browser
# 或
npx playwright install chromium
```

## 导出

- `createBrowserSessionManager` — 单会话管理（懒启动、串行互斥）
- `registerBrowserShutdownHooks` — 进程退出时关闭浏览器
- 类型：`BrowserSession`、`BrowserSessionManager` 等
