# 浏览器通知与 PWA（无 Web Push）

在浏览器中打开 Opptrix 时，离开当前对话页后，可用系统通知提示「对话已完成」或「需要确认」。这依赖浏览器的 **Notification API**（本地展示），**不使用 Web Push**（无 VAPID、无推送订阅、无服务端推送）。

**安全上下文**：通知与 Service Worker 仅在 **HTTPS** 或 **localhost** 下可用。自托管时请用 HTTPS 反向代理，或本地 `http://127.0.0.1` 开发。

**安装为应用（PWA）**：页面提供 `manifest.webmanifest`（含自描述 `related_applications` 以便检测是否已安装）、favicon / 应用图标、安装截图与最小 Service Worker（仅满足可安装条件，不做离线缓存策略、不处理 push）。

- **Chrome / Edge**：优先唤起系统安装窗；已安装或浏览器不再提供安装事件时顶部提醒静默。兜底指引按浏览器区分最新菜单路径（Chrome：「保存并分享」；Edge：「应用 → 将此站点安装为应用」）。
- **Safari（Mac）**：引导「分享 / 文件 → 添加到程序坞」。
- **iPhone**：引导「分享 → 添加到主屏幕」（含「以网页 App 打开」）。
- **Firefox**：Windows 引导任务栏固定（实验室开关）；Android 引导菜单安装；其他桌面说明能力有限并建议改用 Chrome / Edge / Safari。
- **设置 → 常规 → 本机应用**：与上述分端文案一致。Electron 桌面壳不注册该 Service Worker，也不展示安装入口。

### iPhone / Safari「添加到主屏幕」

Safari 主要读取 HTML 元数据（不完全依赖 manifest）：

| 声明 | 作用 |
|------|------|
| `apple-mobile-web-app-title` | 主屏幕下方名称 |
| `meta name="description"` | 添加页 / 分享说明 |
| `/apple-touch-icon.png`（站点根）与 `/icons/apple-touch-icon.png`（180×180） | 主屏幕图标 |

若图标仍显示旧图：从主屏幕删除后重新添加（iOS 会强缓存图标）。

### Chrome 可安装条件（桌面与 Android）

需同时满足：HTTPS（或 localhost）、有效 Web App Manifest（含 `name`/`short_name`、`start_url`、`display: standalone`、192 + 512 图标、`prefer_related_applications: false`）、以及生产环境已注册且含 `fetch` 处理的 Service Worker。Manifest 另含 `id`、`categories`、`screenshots`（narrow / wide）以启用更完整的安装界面。

## 图标与 favicon

权威源图与桌面应用相同：仓库根目录 `icons/logo.png` 与 `icons/logo@*.png`。由 `apps/desktop/scripts/prepare-icons.mjs` 同步到 Web 静态目录：

| 产物 | 尺寸 | 用途 |
|------|------|------|
| `client-ui/public/favicon.ico` | 16 + 32 | 浏览器标签页默认图标 |
| `client-ui/public/icons/favicon-16.png` | 16×16 | PNG favicon |
| `client-ui/public/icons/favicon-32.png` | 32×32 | PNG favicon |
| `client-ui/public/apple-touch-icon.png` | 180×180 | Safari 根路径探测 |
| `client-ui/public/icons/apple-touch-icon.png` | 180×180 | iOS / Safari 主屏幕 |
| `client-ui/public/icons/icon-192.png` | 192×192 | PWA `any` |
| `client-ui/public/icons/icon-512.png` | 512×512 | PWA `any` |
| `client-ui/public/icons/icon-512-maskable.png` | 512×512 | PWA `maskable`（约 80% 安全区） |
| `client-ui/public/screenshots/narrow.png` | 1080×1920 | Chrome 安装界面（竖屏） |
| `client-ui/public/screenshots/wide.png` | 1920×1080 | Chrome 安装界面（横屏） |
| `client-ui/public/app-icon.png` | 64×64 | 页面内小图标等 |

更新品牌图后请重新生成并提交产物：

```bash
node apps/desktop/scripts/prepare-icons.mjs
```

`index.html` 声明 description、`apple-mobile-web-app-title`、favicon、双路径 `apple-touch-icon` 与 `manifest`；生产环境（非 Electron）注册 `public/sw.js`。

**顶部栏 / 状态栏色**：Chrome 已安装应用与 `theme-color` 对齐左侧边栏（`canvasAlt`：亮 `#F3F3F3`、暗 `#141414`）。首屏可用 `prefers-color-scheme` 双 meta；`applyTheme` 会**重建无 media 的单条** `theme-color` 与 `apple-mobile-web-app-status-bar-style`，以便独立应用在跟随系统 / 切换主题时刷新顶栏色。

自托管部署、数据卷与宿主机目录挂载见 [SELF-HOSTING.md](./SELF-HOSTING.md)。
