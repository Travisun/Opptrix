# Opptrix 文档索引

本目录包含架构、开发、API、UI 与发布说明。建议按角色选择阅读路径。

---

## ⚠️ 使用前提

Opptrix 是面向 **全球多市场** 的 **数据查询与投研信息整理工具**，**不构成投资建议**。使用 AI 对话与自动化工具前，请阅读 [README.md](../README.md) 中的 **风险提示与用户须知**。

---

## 按角色阅读

### 最终用户（安装使用）

1. [README.md](../README.md) — 安装包下载、首次配置、功能概览、**风险提示**
2. [DESKTOP-RELEASE.md](./DESKTOP-RELEASE.md) — 桌面版更新、各平台文件名、常见问题
3. [DESKTOP.md](./DESKTOP.md) — 桌面端行为（托盘、深链、菜单）

### 开发者（本地运行与改代码）

1. [README.md](../README.md) — 快速开始
2. [DEVELOPMENT.md](./DEVELOPMENT.md) — 日常命令、调试、测试、FAQ
3. [ARCHITECTURE.md](./ARCHITECTURE.md) — 分层与请求流
4. [example/README.md](../example/README.md) — 示例配置

### 数据层 / Provider 开发者

1. [DATA-LAYER.md](./DATA-LAYER.md) — Engine、InstrumentRef、Provider 演进
2. [PROVIDER-STANDARD-API.md](./PROVIDER-STANDARD-API.md) — `queryInstrumentData` 标准 API（**必读**）
3. [MULTI-MARKET-ARCHITECTURE.md](./MULTI-MARKET-ARCHITECTURE.md) — 多市场能力与边界
4. [DATA-LAYER-PROGRESS.md](./DATA-LAYER-PROGRESS.md) — 迁移进度

### 前端 / UI

1. [UI-DESIGN-SYSTEM.md](./UI-DESIGN-SYSTEM.md) — 色彩、排版、组件
2. [UI-LAYOUT.md](./UI-LAYOUT.md) — 三栏布局、桌面壳层
3. [DESKTOP.md](./DESKTOP.md) — Electron 布局约定

### AI 协作者（Cursor / Codex）

1. **[AGENT-GUIDE.md](./AGENT-GUIDE.md)** — 单文件协作手册（**首选**）
2. [CONTRIBUTING.md](./CONTRIBUTING.md) — PR 约定
3. `.cursor/rules/` — 工程规则（CodeGraph、数据层、UI 浮层等）

### 发布维护者

1. [DESKTOP-RELEASE.md](./DESKTOP-RELEASE.md) — 打 tag、CI、三端产物、自动更新元数据
2. [DESKTOP.md](./DESKTOP.md) — 本地打包命令

---

## 文档清单

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统分层、包依赖、Hub、持久化 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 开发环境、脚本、测试、排错 |
| [API.md](./API.md) | REST、Hub features、instrument API |
| [DATA-LAYER.md](./DATA-LAYER.md) | 数据层设计（Provider / Instrument） |
| [MULTI-MARKET-ARCHITECTURE.md](./MULTI-MARKET-ARCHITECTURE.md) | 多市场 V2 架构 |
| [PROVIDER-STANDARD-API.md](./PROVIDER-STANDARD-API.md) | 标准数据 API 规范 |
| [DATA-LAYER-PROGRESS.md](./DATA-LAYER-PROGRESS.md) | 数据层落地进度 |
| [DESKTOP.md](./DESKTOP.md) | Electron 桌面开发 |
| [DESKTOP-RELEASE.md](./DESKTOP-RELEASE.md) | 桌面发布与自动更新 |
| [UI-DESIGN-SYSTEM.md](./UI-DESIGN-SYSTEM.md) | UI 设计系统 |
| [UI-LAYOUT.md](./UI-LAYOUT.md) | 布局规范 |
| [AGENT-GUIDE.md](./AGENT-GUIDE.md) | AI 协作指南 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 贡献流程 |
| [RIGHT-PANEL-RESEARCH-PLAN.md](./RIGHT-PANEL-RESEARCH-PLAN.md) | 右侧面板规划 |
| [AKSHARE-COVERAGE-AUDIT.md](./AKSHARE-COVERAGE-AUDIT.md) | AkShare 覆盖审计 |

---

## 仓库内其他说明

| 路径 | 说明 |
|------|------|
| [packages/README.md](../packages/README.md) | 各 npm workspace 包职责 |
| [example/](../example/) | 可提交的示例配置 |
| [SECURITY.md](../SECURITY.md) | 安全报告方式 |
