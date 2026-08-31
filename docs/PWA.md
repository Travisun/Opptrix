# 浏览器通知与 PWA（无 Web Push）

在浏览器中打开 Opptrix 时，离开当前对话页后，可用系统通知提示「对话已完成」或「需要确认」。这依赖浏览器的 **Notification API**（本地展示），**不使用 Web Push**（无 VAPID、无推送订阅、无服务端推送）。

**安全上下文**：通知与 Service Worker 仅在 **HTTPS** 或 **localhost** 下可用。自托管时请用 HTTPS 反向代理，或本地 `http://127.0.0.1` 开发。

**安装为应用（PWA）**：页面提供 `manifest.webmanifest` 与最小 Service Worker（仅满足可安装条件，不做离线缓存策略、不处理 push）。在 Chrome 中可通过地址栏「安装」将站点加入独立窗口。Electron 桌面壳不注册该 Service Worker。

自托管部署、数据卷与宿主机目录挂载见 [SELF-HOSTING.md](./SELF-HOSTING.md)。
