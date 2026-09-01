# 浏览器通知与 PWA（无 Web Push）

在浏览器中打开 Opptrix 时，离开当前对话页后，可用系统通知提示「对话已完成」或「需要确认」。这依赖浏览器的 **Notification API**（本地展示），**不使用 Web Push**（无 VAPID、无推送订阅、无服务端推送）。

**安全上下文**：通知与 Service Worker 仅在 **HTTPS** 或 **localhost** 下可用。自托管时请用 HTTPS 反向代理，或本地 `http://127.0.0.1` 开发。

**安装为应用（PWA）**：页面提供 `manifest.webmanifest`、favicon / 应用图标与最小 Service Worker（仅满足可安装条件，不做离线缓存策略、不处理 push）。在 Chrome 中可通过地址栏「安装」将站点加入独立窗口。Electron 桌面壳不注册该 Service Worker。

## 图标与 favicon

权威源图与桌面应用相同：仓库根目录 `icons/logo.png` 与 `icons/logo@*.png`。由 `apps/desktop/scripts/prepare-icons.mjs` 同步到 Web 静态目录：

| 产物 | 尺寸 | 用途 |
|------|------|------|
| `client-ui/public/favicon.ico` | 16 + 32 | 浏览器标签页默认图标 |
| `client-ui/public/icons/favicon-16.png` | 16×16 | PNG favicon |
| `client-ui/public/icons/favicon-32.png` | 32×32 | PNG favicon |
| `client-ui/public/icons/apple-touch-icon.png` | 180×180 | iOS / Safari 主屏幕 |
| `client-ui/public/icons/icon-192.png` | 192×192 | PWA `any` |
| `client-ui/public/icons/icon-512.png` | 512×512 | PWA `any` |
| `client-ui/public/icons/icon-512-maskable.png` | 512×512 | PWA `maskable`（约 80% 安全区） |
| `client-ui/public/app-icon.png` | 64×64 | 页面内小图标等 |

更新品牌图后请重新生成并提交产物：

```bash
node apps/desktop/scripts/prepare-icons.mjs
```

`index.html` 声明 favicon、`apple-touch-icon` 与 `manifest`；生产环境（非 Electron）注册 `public/sw.js`。

自托管部署、数据卷与宿主机目录挂载见 [SELF-HOSTING.md](./SELF-HOSTING.md)。
