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
│  可调宽     │                              │                   │
└─────────────┴──────────────────────────────┴──────────────────┘
```

- **默认宽度** 250px；拖拽范围约 196–360px，持久化至 `localStorage`（`opptrix-sidebar-width`）
- **品牌行**：macOS / Web / 移动抽屉侧栏在「新对话」菜单区之上展示纯文字「OpptrixBench」与 `useAppVersion` 的 `v…` 版本（baseline 对齐，无 wordmark SVG）；左右内边距 `20px`，与顶部菜单行图标左缘（`margin 10 + padding 10`）对齐。Windows / Linux Electron 侧栏**不**再展示该行（品牌移至 frame titlebar），菜单区上边距收紧为约 `6px`
- **内联模式**：侧栏右缘可拖拽调宽（复用 `WorkspaceSplitDivider` 交互）
- **浮层模式**：窗口宽度 &lt; 当前侧栏宽度 × 2.5 时侧栏浮于内容之上；≥ × 3 时窗口放大可自动展开内联侧栏
- **右侧顶栏**：关注 / 组合 / 详情为文字 Tab；进入详情时显示「详情」Tab
- **窗口标题栏**：macOS 为 `hiddenInset`，系统红绿灯隐藏后由二级 chrome 内紧凑自定义红绿灯（约 14px）承接；侧栏展开时顶栏工具与 Windows 一致——收起在左（红绿灯右侧）、前进/后退靠右贴侧栏分割线。Windows / Linux 在窗口最顶部额外一条与左侧栏同色毛玻璃的 frame titlebar：左侧 App 图标 + 纯文字「Opptrix工作台」（无 wordmark SVG、无版本号）+ 模拟原生菜单（文件 / 编辑 / 视图 / 窗口 / 帮助），右侧为 Win11 风格 caption 按钮（高满条、宽 46px；关闭 hover 红底白标，其余灰底深色标）。左侧栏分割线不向上贯穿该 frame titlebar。
- **附件预览**（右侧文件预览面板）：PDF 内嵌紧凑阅读器（翻页 / 缩放 / 适合宽度，目录默认收起可展开跳页）；**音视频**（`kind=audio|video`）由 `MediaPreviewPlayer` 自定义控件播放，下方轮询展示转写文稿（整理中 / 就绪 / 失败）；**画布**（`kind=canvas`）由 `CanvasPreviewHost` 以 `@opptrix/canvas` curated 组件（流体 `Surface` + `Stack` / `Stat` / `Table` 等）渲染 Agent TSX；**脑图**（`kind=mindmap`）由 `MindmapPreviewHost` 以开源 **mind-elixir** 编辑器展示与编辑（存盘仍为扁平 `{ version, rootId, nodes }`；消息内脑图为 mind-elixir 只读缩略）；消息内画布/脑图均为缩略卡，点击打开右侧面板（桌面）或弹层（移动）；均可从消息附件芯片/卡片或文件箱打开
- **消息目录轨**（桌面）：`bodyShell` 左侧中部比例时间轴（宽约 22px；线程/composer 左侧留白 `chatThreadPaddingLeft`≈32px，避免正文压住轨）；**仅收录助手有正文的消息**（user 不进轨）；节点默认约 5px（深灰 `textSecondary`），hover/focus 当前节点放大至约 11px（`motion.fast`；active/hot 为 `textPrimary` 黑系，不用 accent）；当前进度以轨上 `textPrimary` 填充同步滚动高亮；hover/focus 节点右侧气泡预览开头（「助手」+ 友好时间 + 约 80 字）；点击跳转对应消息；不劫持滚轮。mobile 隐藏
- **本对话附件抽屉 / 文件箱**（桌面）：顶栏文件箱按钮切换开合（无抽屉内标题栏/关闭按钮；Escape 可关）；自右侧滑入（z-index 低于输入区）；底边留白对齐消息区固定底 padding（`CHAT_COMPOSER_BOTTOM_PAD`=100）；已引用附件不可删除。种类文案含：图片 / PDF / 文档 / 视频 / 音频 / **画布** / **脑图**（与 `mediaCapabilities` 标签一致）。mobile 隐藏

代码：`client-ui/src/chat/ChatApp.tsx`、`client-ui/src/chat/ChatView.tsx`、`client-ui/src/chat/MessageOutlineRail.tsx`、`client-ui/src/chat/SessionAttachmentsDrawer.tsx`、`client-ui/src/market/RightMarketPanel.tsx`、`client-ui/src/desktop/WindowFrameTitleBar.tsx`、`client-ui/src/desktop/MacTrafficLights.tsx`、`client-ui/src/chat/FilePreviewPanel.tsx`、`client-ui/src/chat/MediaPreviewPlayer.tsx`、`client-ui/src/chat/PdfPreviewViewer.tsx`、`client-ui/src/chat/CanvasPreviewHost.tsx`、`client-ui/src/chat/CanvasInlineCard.tsx`、`client-ui/src/chat/MindmapPreviewHost.tsx`、`client-ui/src/chat/MindmapInlineCard.tsx`。

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
| 市场动态 | MarketDynamicsPage | 大盘/板块/龙虎榜 + 对话内工作流技能（早报、收盘、产业链） |
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
3. 消息区 scroll（用户消息为全宽气泡；助手为无底 Markdown；消息间距约 10px）
4. 输入区浮层 dock（Composer：Cursor 式——`scrollViewport` 绝对铺满 `bodyShell`，底部多层 `maskImage` 淡出与 `composerBottomPad` 联动：不透明截止在 `100% - pad`，再约 38px 内渐隐到透明，右侧 scrollbar 条带全程不透明（实测 gutter，至少 6px）；**无**全宽 dock 毛玻璃 / `composerDockScrim`；`composerDock` / `composerInner` / `composerFooter` 透明（Electron 融入 vibrancy、Web 与主区 canvas 同色），`pointerEvents: none` 仅内容区可点；输入卡 `panel` 仍为实色圆角 + 阴影；消息区 `paddingBottom` 由 ResizeObserver 测 `composerInner` 高度，下限 `CHAT_COMPOSER_BOTTOM_PAD`；卡顶极小 padding、空态输入约一行高、工具栏与 28px 按钮齐平；底栏轻量居中文案「内容由AI生成，不构成投资建议，请核实重要信息」，右侧小号上下文用量。布局两行：上行全宽 contentEditable（录音中仍可见已输入文字）；下行 toolbar 为左 `+` / 授权、中弹性空白、右 模型 / mic/send/stop（模型在麦克风或停止左侧，窄宽时模型名省略收缩且不挤掉 28px 圆钮；空态仅麦为 primary 实心圆 CTA；有可发送内容时麦在发送左侧为透明 ghost 次级、发送为主；录音为红圆且 hover 保持浅色图标/偏红底，toolbar 维持 28px 齐平；生成中为模型 + 停止）。语音聆听条（纵向柱波 + 下方次要灰文案）绝对定位叠在整个 `panel` 正中（`pointer-events: none` overlay，条自身可点结束），不夹在 toolbar 中缝、不替换 editor DOM。`+` 菜单可添加附件 / 授权文件夹 / 引用技能；`@` 与 `/` 面板互斥；Enter 发送、Shift+Enter 换行）

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
│ 默认 260px（可拖） │  ┌─ contentScroll ─────────────────┐ │
│                   │  │  ┌─ contentColumn ─────────────┐│ │
│ 常规              │  │  │  maxWidth: 720px            ││ │
│ 大模型            │  │  │  padding: clamp(12,3.5vw,32)││ │
│ 数据源            │  │  │  margin: 0 auto             ││ │
│ 新闻订阅          │  │  │                             ││ │
│ 研报库            │  │  │  [SettingsGroup]            ││ │
│ 翻译              │  │  │  ├─ SettingsRow ────────────┤│ │
│ 多模态            │  │  │  ├─ SettingsRow ────────────┤│ │
│ MCP 服务          │  │  │  ├─ SettingsDivider ────────┤│ │
│ 工作流技能        │  │  │  └─ SettingsRow ────────────┤│ │
│ 沙盒              │  │  │                             ││ │
│ 计划任务          │  │  │  [SettingsCard]             ││ │
│ Python            │  │  │  └─ 独立卡片内容 ───────────┘││ │
│ 关于              │  │  └─────────────────────────────┘│ │
│ 用户交流群        │  └─────────────────────────────────┘ │
│  （弹 Dialog）    │                                      │
└───────────────────┴──────────────────────────────────────┘
```

侧栏宽度默认 **260px**，panel 模式可通过 `WorkspaceSplitDivider` 拖拽调整（约 **200–360px**，并受内容区最小宽度约束），写入 `localStorage`（`opptrix-settings-sidebar-width`）。分割条与聊天左侧栏同宽、同色（默认 `tone`，非 `subtle`），panel 不另叠 `opptrix-sidebar-edge`。Overlay / 窄屏模式无分割条，仍使用同一动态宽度。内容区仅保留章节 `pageTitle` / `pageSubtitle`；不渲染 mac 次级「设置」title band。列表型章节（工作流技能、新闻订阅源、大模型提供商）默认只展示名称行；详情 / 地址在 Dialog 中编辑；「添加」入口用 `SettingsPanelHeader` 顶栏按钮。

侧栏「用户交流群」为动作项（`WechatCommunityDialog`）：点击弹出扫码入群 Dialog，不切换右侧章节；二维码图为远程资源 `https://opptrix.org/images/wechat-group-qr.jpg`。

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
| 行 | `SettingsActionRow` | 可点击整行（页内导航） |
| 行 | `SettingsExternalLinkRow` | 外链整行（trailing 外开图标） |
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
