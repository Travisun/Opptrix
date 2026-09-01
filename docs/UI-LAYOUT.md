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

产品默认以 **聊天 + 右侧投研面板** 为主布局（见根目录 [`screenshot.webp`](../screenshot.webp)）：

```
┌─────────────┬──────────────────────────────┬──────────────────┐
│  Session    │  Chat + 工具过程 + 输入区     │  关注/发现/个股   │
│  Sidebar    │  (flex 1)                    │  RightMarketPanel │
│  可调宽     │                              │                   │
└─────────────┴──────────────────────────────┴──────────────────┘
```

- **默认宽度** 250px；拖拽范围约 196–360px，持久化至 `localStorage`（`opptrix-sidebar-width`）
- **品牌行**：macOS / Web / 移动抽屉侧栏在「新对话」菜单区之上展示纯文字「Opptrix 工作台」与 `useAppVersion` 的 `v…` 版本（baseline 对齐，无 wordmark SVG）；左右内边距 `20px`，与顶部菜单行图标左缘（`margin 10 + padding 10`）对齐。Windows / Linux Electron 侧栏**不**再展示该行（品牌移至 frame titlebar），菜单区上边距收紧为约 `6px`
- **内联模式**：侧栏右缘可拖拽调宽（复用 `WorkspaceSplitDivider` 交互）
- **浮层模式**：窗口宽度 &lt; 当前侧栏宽度 × 2.5 时侧栏浮于内容之上；≥ × 3 时窗口放大可自动展开内联侧栏
- **Web 打开入口**：移动 Web（≤767）在聊天 `MobileTopBar` 与新闻 / 市场 / 社区 / 专家页顶栏使用同一套 `PanelLeftExpand/Contract` 侧栏开合按钮（随 `drawerOpen` 切换，点击 toggle）；桌面 Web 聊天顶栏左侧常显侧栏开合按钮，不依赖 Electron 标题栏工具
- **移动端顶栏规格**：共享 `client-ui/src/theme/mobileChrome.ts`（触控目标 40、图标 20、内边距 `4px 8px`、safe-area；内容带约 48px）。聊天 / 各 Web 页顶栏、设置「返回应用」、右栏全屏 sheet 顶栏均对齐该规格；右 sheet 外壳已垫 safe-area 时内栏用 inset 变体避免双垫。左会话抽屉不设独立关闭钮（由主列顶栏侧栏 icon 收起），品牌行上移与顶栏内容带对齐。移动端 composer 底栏 inset 为 `max(12px, safe-area-inset-bottom)`（桌面仍为 25px）。
- **移动推开布局**：左会话栏与右关注/文件栏均为三列固定宽滑轨（drawer + 视口宽主列 + 视口宽右栏），以 `translate3d` **整轨平移**；主列宽度恒为视口，不被挤压。关闭时轨偏移 `-drawerW` 露出主列；开左归零；开右再偏 `-(drawerW+视口宽)`。左栏与右栏均**常驻于轨上**（不二次挂载），开合只改轨偏移；时长与 `DESKTOP_SIDEBAR_LAYOUT_MS` 对齐。开右时关左；开左时若右开则先关右。
- **移动端右栏**：聊天 `MobileTopBar` 可打开关注/持仓与文件预览为轨上全屏列（复用 `RightPanel` `fullWidth`，非并排分栏）；关闭后轨回到主列。
- **右侧顶栏**：关注 / 组合 / 详情为文字 Tab；进入详情时显示「详情」Tab
- 左列名称（名录同步全称，过长 hover 横向滚动）+ 代码在下；右列表头四指标——最新价、关注收益、成本价、持仓收益（持仓成本与收益来自组合账本，含费率）；列表区 `overflow: auto` 支持横向滚动，收窄时不重叠；hover 行显示编辑/删除，操作钮 sticky 吸附在面板可视区右缘（行不横滚时保持行尾原位）
- **窗口标题栏**：macOS 为 `hiddenInset`，系统红绿灯隐藏后由二级 chrome 内紧凑自定义红绿灯（约 14px）承接；侧栏展开时顶栏工具与 Windows 一致——收起在左（红绿灯右侧）、前进/后退靠右贴侧栏分割线。Windows / Linux 在窗口最顶部额外一条与左侧栏同色毛玻璃的 frame titlebar：左侧 App 图标 + 纯文字「Opptrix工作台」（无 wordmark SVG、无版本号）+ 模拟原生菜单（文件 / 编辑 / 视图 / 窗口 / 帮助），右侧为 Win11 风格 caption 按钮（高满条、宽 46px；关闭 hover 红底白标，其余灰底深色标）。左侧栏分割线不向上贯穿该 frame titlebar。
- **附件预览**（右侧文件预览面板）：与行情面板**平级**——预览自左滑入、行情向右推出（含各自二级 title header）；关闭预览回到行情面板（不整栏收起）。二者宽度各自记忆；切换时**滑动与 panel 宽度同帧启动、同曲线并行 morph**（滑轨 + shell + aside 均为 **640ms**，缓动 `cubic-bezier(0.32, 0.72, 0, 1)` 减速落位；workspace 不足时扩窗与调宽并行，不等 slide 结束）。顶栏文件预览按钮（`titleBarTrailing`）的 `right` 与右栏宽度同曲线跟移，拖拽分隔条时无 transition 拖尾。侧栏开合仍用 480ms 全局常量。关闭预览时 preview 内容在 slide 结束后再清。PDF 内嵌紧凑阅读器（翻页 / 缩放 / 适合宽度，目录默认收起可展开跳页）；**音视频**（`kind=audio|video`）由 `MediaPreviewPlayer` 自定义控件播放，下方轮询展示转写文稿（整理中 / 就绪 / 失败）；**画布**（`kind=canvas`）由 `CanvasPreviewHost` 以 `@opptrix/canvas` curated 组件（流体 `Surface` + `Stack` / `Stat` / `Table` 等）渲染 Agent TSX；**脑图**（`kind=mindmap`）由 `MindmapPreviewHost` 以开源 **mind-elixir** 编辑器展示与编辑（存盘仍为扁平 `{ version, rootId, nodes }`）。**产物条**（`web` / `canvas` / `mindmap`）在助手消息末尾、meta（时间/token/复制等）上方；用户消息附件条仍在气泡外、footer 之上。进入含产物的会话时（桌面可预览分栏），默认打开按消息时间顺序的第一个产物预览；用户关闭后本会话停留期间不再自动打开。点击产物行或附件芯片：桌面打开右侧面板；**移动 Web 打开全屏文件 sheet**
- **消息目录轨**（桌面）：**浮层覆盖消息区左侧**，不占布局 gutter、不影响 composer 左右边距；线程/composer 左右同为 `chatThreadPaddingX`（25px），消息与输入对称对齐。左侧约 16px hit 区**贴左常显**（整轨默认半透明约 35%，`motion.fast` 过渡；`prefers-reduced-motion` 瞬时），**hover / focus-within / 拖拽 scrub 时不透明且圆点变黑**（`textPrimary`）。**仅收录助手有正文的消息**（user 不进轨）；节点约 5px（idle 灰点，active 略深 `textSecondary`）；engaged 时 hover/focus 当前节点放大（active/hot 为 `textPrimary` 黑系，不用 accent）；当前进度随滚动同步高亮；hover/focus 节点右侧气泡预览开头（「助手」+ 友好时间 + 约 80 字）；点击跳转对应消息；不劫持滚轮。无助手正文时不渲染轨；mobile 隐藏
- **本对话附件抽屉 / 文件箱**（桌面）：顶栏文件箱按钮切换开合（无抽屉内标题栏/关闭按钮；Escape 可关）；自右侧滑入（z-index 低于输入区）；底边留白对齐消息区固定底 padding（`CHAT_COMPOSER_BOTTOM_PAD`=100）；已引用附件不可删除。种类文案含：图片 / PDF / 文档 / 视频 / 音频 / **画布** / **脑图**（与 `mediaCapabilities` 标签一致）。移动端改由 `MobileTopBar` 文件入口打开全屏 `FilePreviewPanel`（列表/空态/预览）

代码：`client-ui/src/chat/ChatApp.tsx`、`client-ui/src/chat/ChatView.tsx`、`client-ui/src/chat/MessageOutlineRail.tsx`、`client-ui/src/chat/SessionAttachmentsDrawer.tsx`、`client-ui/src/market/RightMarketPanel.tsx`、`client-ui/src/desktop/WindowFrameTitleBar.tsx`、`client-ui/src/desktop/MacTrafficLights.tsx`、`client-ui/src/chat/FilePreviewPanel.tsx`、`client-ui/src/chat/MediaPreviewPlayer.tsx`、`client-ui/src/chat/PdfPreviewViewer.tsx`、`client-ui/src/chat/CanvasPreviewHost.tsx`、`client-ui/src/chat/ComposerAttachmentStrip.tsx`（生成物 `ArtifactOpenRow`）、`client-ui/src/chat/MindmapPreviewHost.tsx`、`client-ui/src/chat/MessageInlineRefs.tsx`。

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
| 市场动态 | MarketDynamicsPage | A股 **Stocky 式 Dashboard**：英雄指数卡 → 紧凑 KPI → 主区左（大价 K 线 + 数据明细）/ 右（板块发现 + 热榜）。**移动 Web**：单列信息流——更宽指数卡（隐代码）→ KPI → 更高紧凑图 → 板块（2 列）→ 明细 → 热榜；点个股走势以底部抽屉拉出；选中板块时标题展示完整板块名、清除为图标。美股不变 |
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
4. 输入区浮层 dock（Composer：Cursor 式——`scrollViewport` 绝对铺满 `bodyShell`，底部多层 `maskImage` 淡出与 `composerBottomPad` 联动：不透明截止在 `100% - pad`，再约 38px 内渐隐到透明，右侧 scrollbar 条带全程不透明（实测 gutter，至少 6px）；**无**全宽 dock 毛玻璃 / `composerDockScrim`；`composerDock` / `composerInner` / `composerFooter` 透明（Electron 融入 vibrancy、Web 与主区 canvas 同色），`pointerEvents: none` 仅内容区可点；输入卡 `panel` 仍为实色圆角 + 阴影；消息区 `paddingBottom` 由 ResizeObserver 测 `composerInner` 高度，下限 `CHAT_COMPOSER_BOTTOM_PAD`；卡顶极小 padding、空态输入约一行高、工具栏与 28px 按钮齐平；底栏轻量居中文案「内容由AI生成，不构成投资建议，请核实重要信息」，右侧小号上下文用量。布局两行：上行全宽 contentEditable（录音中仍可见已输入文字）；下行 toolbar 为左 `+` / 授权、中弹性空白、右 模型 / mic/send/stop（模型在麦克风或停止左侧，窄宽时模型名省略收缩且不挤掉 28px 圆钮；空态仅麦为 primary 实心圆 CTA；有可发送内容时麦在发送左侧为透明 ghost 次级、发送为主；录音为红圆且 hover 保持浅色图标/偏红底，toolbar 维持 28px 齐平；生成中为模型 + 停止；**移动 Web**：输入框长按说话、松手结束（短按仍聚焦输入；不显示麦钮；桌面仍为麦钮点击 toggle）；对话完成铃经首次手势解锁后播放）。**协作 Tabs（`SessionCollaborationTabs`）**：只要本会话有可见协作任务，消息区上方显示「主对话」+ 各任务 label Tab；点进协作任务 Tab 用 `getSession(child_session_id)` 只读展示进展（Composer 隐藏，提示「此协作任务仅供查看进展」）；切回主对话恢复正常输入。子会话**不**进入侧栏。点 Composer 协作任务条某项会切到对应协作 Tab（`onSelectRun`）；任务为「需要在主对话处理」时自动/引导切回主对话。主对话生成中仍走 soft steer（`steerSessionChat`）；有协作任务时 placeholder 为「发送补充说明」。**Composer 卡顶状态条（自上而下）**：进行中的后台任务条（`ComposerBackgroundJobsBar`）→ 协作任务条（`ComposerCollaborationTasksBar`，文案「协作任务」，可取消进行中 / 终态「知道了」）→ 待执行提示队列。历史助手气泡内顺序为正文 → 附件 → 思考/执行步骤（`ChatProcessTrace`）→ meta；生成中的实时过程条（`liveTrace`）仍在消息列表底部独立展示；协作任务开始/结束会写入 `phaseLabel` 与对应步骤。语音聆听条（纵向柱波 + 下方次要灰文案）绝对定位叠在整个 `panel` 正中（`pointer-events: none` overlay，条自身可点结束），不夹在 toolbar 中缝、不替换 editor DOM。`+` 菜单可添加附件 / 授权文件夹 / 引用技能；`@` 与 `/` 面板互斥；Enter 发送、Shift+Enter 换行）

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
| ComposerBackgroundJobsBar | `client-ui/src/chat/ComposerBackgroundJobsBar.tsx` |
| ComposerCollaborationTasksBar | `client-ui/src/chat/ComposerCollaborationTasksBar.tsx` |
| SessionCollaborationTabs | `client-ui/src/chat/SessionCollaborationTabs.tsx` |
| ChatProcessTrace | `client-ui/src/chat/ChatProcessTrace.tsx` |
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
│ 组合费率          │  │  │  padding: clamp(12,3.5vw,32)││ │
│ 大模型            │  │  │  margin: 0 auto             ││ │
│ 数据源            │  │  │                             ││ │
│ 新闻订阅          │  │  │  [SettingsGroup]            ││ │
│ 研报库            │  │  │  ├─ SettingsRow ────────────┤│ │
│ 翻译              │  │  │  ├─ SettingsRow ────────────┤│ │
│ 多模态            │  │  │  ├─ SettingsDivider ────────┤│ │
│ MCP 服务          │  │  │  └─ SettingsRow ────────────┤│ │
│ 工作流技能        │  │  │                             ││ │
│ 自进化            │  │  │  [SettingsCard]             ││ │
│ 沙盒              │  │  │  └─ 独立卡片内容 ───────────┘││ │
│ 计划任务          │  │  └─────────────────────────────┘│ │
│ Python            │  │                                      │
│ 关于              │  │                                      │
│ QQ 群             │  └─────────────────────────────────┘ │
│  （弹 Dialog）    │                                      │
└───────────────────┴──────────────────────────────────────┘
```

侧栏宽度默认 **260px**，panel 模式可通过 `WorkspaceSplitDivider` 拖拽调整（约 **200–360px**，并受内容区最小宽度约束），写入 `localStorage`（`opptrix-settings-sidebar-width`）。分割条与聊天左侧栏同宽、同色（默认 `tone`，非 `subtle`），panel 不另叠 `opptrix-sidebar-edge`。Overlay / 窄屏模式无分割条，仍使用同一动态宽度。内容区仅保留章节 `pageTitle` / `pageSubtitle`；不渲染 mac 次级「设置」title band。列表型章节（工作流技能、新闻订阅源、大模型提供商）默认只展示名称行；详情 / 地址在 Dialog 中编辑；「添加」入口用 `SettingsPanelHeader` 顶栏按钮。

侧栏「QQ 群」为动作项（`WechatCommunityDialog`）：点击弹出扫码入群 Dialog，不切换右侧章节；二维码为打包资源 `/images/qq-group-qr.jpg`（与 `author/qq_group.jpg` 同步）。

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
| 环境状态 | `SandboxEnvironmentStatusCard` | 调用 `GET /api/settings/sandbox/status`；展示总体就绪、隔离保护、网络隔离能力（完整/基础）、说明文案；桌面版在需系统授权时显示「完成设置」（经 `shellInstallWindowsSandbox` / `shellInstallLinuxSandbox` IPC）；完整隔离未就绪时可「改用基础隔离」；支持「刷新状态」 |
| 隔离强度（Windows） | `SandboxSettingsSection` | 「完整隔离 / 基础隔离」；写入 `windows_isolation_mode`（默认基础隔离） |
| 永久允许的目标 | `SettingsMonospaceEditor` | 每行一条域名或地址；支持 `*.example.com`；500ms 防抖自动保存；底部保存状态提示 |
| 局域网 | `SettingsGroup` + Switch | 「允许局域网访问」；开启后在 `SettingsStaticBlock` 显示风险提示 |

### 7.4 浏览器通知与 PWA

浏览器端对话完成/确认提醒与可安装 PWA 说明见 [`docs/PWA.md`](./PWA.md)（Notification API，无 Web Push；需 HTTPS 或 localhost）。
