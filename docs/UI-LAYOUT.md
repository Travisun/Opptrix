# Opptrix UI Layout

> 实现 UI 前请先读 [`UI-DESIGN-SYSTEM.md`](./UI-DESIGN-SYSTEM.md)（色彩、组件、毛玻璃）与本文件（布局）。浮层 / Dialog / Toast 选型见 [`.cursor/rules/ui-overlay-components.mdc`](../.cursor/rules/ui-overlay-components.mdc)。

## 1. 整体结构（EchoBird 三栏）

```
┌─────────────┬──────────────────────────────────┬──────────────┐
│   Sidebar   │         Main Canvas              │ Agent Panel  │
│   220px     │         (flex 1)                 │ 320px 可选   │
│             │  ┌─ PageHeader ────────────────┐ │              │
│  Logo       │  │ Kicker + Title    [actions] │ │  AI 对话     │
│  Nav Groups │  └─────────────────────────────┘ │              │
│             │  ┌─ SurfaceCard ──────────────┐ │              │
│  AI 入口    │  │  Page Content              │ │              │
│             │  └─────────────────────────────┘ │              │
│  ─────────  │                                  │              │
│  Status     │                                  │              │
│  Settings   │                                  │              │
└─────────────┴──────────────────────────────────┴──────────────┘
```

- **Sidebar**：全高固定，不随主区滚动
- **Main Canvas**：暖色 canvas 背景，内部卡片为 surface 白
- **Agent Panel**：右侧滑入，与 EchoBird「会话记录」栏同位；关闭时主区占满
- **浮层面板**：Dialog、下拉、抽屉统一毛玻璃（见 `UI-DESIGN-SYSTEM.md` §5.1、§7.8）；二次确认用 `OpptrixDialogAlert`

### 1.1 Chat 主界面（当前默认入口）

产品默认以 **聊天 + 右侧投研面板** 为主布局（见根目录 [`screenshot.jpg`](../screenshot.jpg)）：

```
┌─────────────┬──────────────────────────────┬──────────────────┐
│  Session    │  Chat + 工具过程 + 输入区     │  关注/发现/个股   │
│  Sidebar    │  (flex 1)                    │  RightMarketPanel │
└─────────────┴──────────────────────────────┴──────────────────┘
```

代码：`client-ui/src/chat/ChatApp.tsx`、`client-ui/src/market/RightMarketPanel.tsx`。

### 1.2 新闻中心

侧栏「新对话」下方进入；占满主栏时**不显示**右侧行情面板（与设置页相同）。

| 状态 | 布局 | 行为 |
|------|------|------|
| `view=news` | 左列表（常驻）+ 右阅读器 | 时间线默认 20 篇，下滑自动加载；可切换「分组」「来源」视图 |
| 阅读器空状态 | 右栏居中卡片 | 引导选择文章或管理订阅 |

订阅管理：**设置 → 新闻订阅**（订阅源、自定义分组文件夹、自动刷新间隔）。

代码：`client-ui/src/pages/news/`、`client-ui/src/pages/settings/NewsFeedSettingsSection.tsx`。

## 2. 路由与页面映射

| 导航 | 页面 | 布局模式 |
|------|------|----------|
| 概览 | Dashboard | Stat 行 + Module 网格 |
| 个股研究 | StockResearch | PageHeader + Tab + 内容卡片 |
| 机会与组合 | PortfolioHub | Tab + 表格/表单卡片 |
| 市场与产业 | MarketInsight | Tab + 报告/Mermaid 卡片 |
| 投研写作 | StockWriter | 双栏 Editor 卡片 |
| 设置 | Settings | 表单卡片堆叠 |
| 新闻中心 | NewsCenter | 侧栏入口；feed / reader 双模式 |

## 3. 全局上下文

| 元素 | 位置 | 行为 |
|------|------|------|
| 股票搜索 | MainHeader | 搜索后设置 globalStock，跳转个股研究 |
| 当前标的 Chip | MainHeader | 显示 code/name，可清除 |
| 问 AI | MainHeader + Sidebar | 打开 Agent Panel |
| LLM 状态 | Sidebar Footer | 绿/灰点 + 模型名 |

## 4. 页面模板

### A. Dashboard（概览）

1. PageHeader：`RESEARCH` kicker + 「工作台」
2. StatCard 行（可选：会话数、因子数等占位）
3. ModuleCard 2×2 网格
4. 底部 CTA：问 AI

### B. Hub + Tabs（个股/组合/市场）

1. PageHeader：模块名 + 当前标的
2. Pill TabList
3. 内容区 SurfaceCard 包裹原有页面组件

### C. Agent Panel

1. Header：图标 + 标题 + 关闭
2. Context 条：当前标的 / 页面
3. 消息区 scroll
4. 输入区固定底

## 5. 响应式（V1）

- 最小宽度 1024px（投研桌面优先）
- `<1024px`：Agent Panel 改为 overlay 抽屉（后续迭代）

## 6. 文件映射

| 文档概念 | 代码路径 |
|----------|----------|
| Theme | `client-ui/src/theme/` |
| Sidebar | `client-ui/src/layout/Sidebar.tsx` |
| MainHeader | `client-ui/src/layout/MainHeader.tsx` |
| AgentPanel | `client-ui/src/layout/AgentDrawer.tsx` |
| PageShell | `client-ui/src/components/PageShell.tsx` |
| SurfaceCard | `client-ui/src/components/SectionCard.tsx` |
| StatCard | `client-ui/src/components/StatCard.tsx` |
| NavItem | `client-ui/src/components/NavItem.tsx` |
| NewsCenter | `client-ui/src/pages/news/NewsCenterPage.tsx` |
| SessionSidebar | `client-ui/src/chat/SessionSidebar.tsx` |
| Settings Page | `client-ui/src/pages/SettingsPage.tsx` |
| Settings Sidebar | `client-ui/src/pages/settings/SettingsSidebar.tsx` |
| Settings Primitives | `client-ui/src/pages/settings/SettingsPrimitives.tsx` |

## 7. 设置页布局规范

设置页 (`SettingsPage.tsx`) 采用**左侧栏 + 右侧内容区**双栏布局：

```
┌───────────────────┬──────────────────────────────────────┐
│ SettingsSidebar   │  contentShell (flex:1)               │
│ 210px             │  ┌─ contentScroll ─────────────────┐ │
│                   │  │  ┌─ contentColumn ─────────────┐│ │
│ 常规              │  │  │  maxWidth: 720px            ││ │
│ 模型              │  │  │  padding: clamp(12,3.5vw,32)││ │
│ 数据源            │  │  │  margin: 0 auto             ││ │
│ MCP 服务器        │  │  │                             ││ │
│ 新闻订阅          │  │  │  [SettingsGroup]            ││ │
│ 沙盒环境          │  │  │  ├─ SettingsRow ────────────┤│ │
│ 翻译              │  │  │  ├─ SettingsRow ────────────┤│ │
│ 多模态            │  │  │  ├─ SettingsDivider ────────┤│ │
│ 关于              │  │  │  └─ SettingsRow ────────────┤│ │
│                   │  │  │                             ││ │
│                   │  │  │  [SettingsCard]             ││ │
│                   │  │  │  └─ 独立卡片内容 ───────────┘││ │
│                   │  │  └─────────────────────────────┘│ │
│                   │  └─────────────────────────────────┘ │
└───────────────────┴──────────────────────────────────────┘
```

### 7.1 内容区宽度控制

- **正常模式**：`maxWidth: 720px` + `margin: 0 auto` + 响应式内边距 `clamp(12px, 3.5vw, 32px)`
- **浮层/窄屏模式** (sidebar overlay)：`width: 100%` + `maxWidth: none` + 更小边距 `clamp(10px, 3vw, 20px)`
- 确保大屏时内容宽度恒定，两侧空白随窗口自动调整

### 7.2 组件层级

| 层级 | 组件 | 说明 |
|------|------|------|
| 容器 | `SettingsGroup` | 带边框圆角的白色卡片组，多行设置项 |
| 容器 | `SettingsCard` | 独立卡片，适合 MCP 预设卡等单张内容 |
| 行 | `SettingsRow` | 标题 (14px 600) + 描述 (13px) + 控件 |
| 行 | `SettingsActionRow` | 可点击整行 |
| 输入 | `SettingsTextField` | 行内文本输入 |
| 输入 | `SettingsCredentialRow` | 密钥编辑行（密码+眼睛+测试+保存） |
| 输入 | `SettingsMonospaceEditor` | 等宽 CodeMirror 编辑器（行号、折行）；沙盒白名单与 MCP JSON 配置复用 |
| 状态 | `SandboxEnvironmentStatusCard` | 命令隔离环境就绪自检（`GET /api/settings/sandbox/status`） |

### 7.3 沙盒环境分区

**设置 → 沙盒环境**（`SandboxSettingsSection`）：命令隔离出站策略，非 MCP / 数据源配置。自上而下：**环境状态** → **永久允许的目标** → **局域网**。

| 区块 | 组件 | 说明 |
|------|------|------|
| 环境状态 | `SandboxEnvironmentStatusCard` | 调用 `GET /api/settings/sandbox/status`；展示总体就绪、命令隔离是否开启、说明文案；桌面版在需系统授权时显示「完成设置」（经 `shellInstallWindowsSandbox` / `shellInstallLinuxSandbox` IPC）；支持「刷新状态」 |
| 永久允许的目标 | `SettingsMonospaceEditor` | 每行一条域名或地址；支持 `*.example.com`；500ms 防抖自动保存；底部保存状态提示 |
| 局域网 | `SettingsGroup` + Switch | 「允许局域网访问」；开启后在 `SettingsStaticBlock` 显示风险提示 |
