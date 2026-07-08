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
