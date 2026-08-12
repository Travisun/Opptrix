# Opptrix UI Design System

> 实现或修改 **任何** client-ui 可见界面前须先读本文与 [`UI-LAYOUT.md`](./UI-LAYOUT.md)。Agent 浮层/Dialog/Toast 规则： [`.cursor/rules/ui-overlay-components.mdc`](../.cursor/rules/ui-overlay-components.mdc)。

> 参考 EchoBird 风格：**暖色浅色画布、陶土橙强调、圆角卡片、紧凑信息密度**。基于 Fluent UI v9 组件，自定义 Design Tokens。

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **Calm Canvas** | 大面积暖灰背景，减少视觉噪音 |
| **Card-First** | 信息以圆角卡片分组，轻阴影分层 |
| **Accent Sparingly** | 陶土橙仅用于品牌、选中态、关键 CTA |
| **Compact Clarity** | 紧凑间距，但保持 12px+ 正文可读性 |
| **Plain Language** | 按钮、提示、空状态等文案面向最终用户，易懂、可操作；细则见 `.cursor/rules/client-ui-guidelines.mdc` |
| **Icon Consistency** | 统一 `@fluentui/react-icons` Regular 20px |

## 1.1 界面参考

仓库根目录 [`screenshot.jpg`](../screenshot.jpg) 为当前产品主界面截图，可作为布局与信息密度的对照：

- **左栏**：会话列表与新建对话
- **中栏**：Agent 回复、工具执行过程、输入区与模型选择
- **右栏**：关注/发现/行业/个股详情与 K 线

实现入口：`client-ui/src/chat/ChatApp.tsx`、右侧 `client-ui/src/market/RightMarketPanel.tsx`。

## 2. Color Tokens

### 2.1 品牌强调色（墨色，非 Cursor 按钮蓝）

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `accent` | `#141414` | `#F0F0F0` | 主按钮、选中强调 |
| `accentHover` | `#000000` | `#FFFFFF` | Hover |
| `accentSoft` | `rgba(20,20,20,0.08)` | `rgba(240,240,240,0.08)` | 浅底标签、弱强调 |
| `accentMuted` | `rgba(20,20,20,0.14)` | `rgba(240,240,240,0.14)` | 次级强调填充 |
| `accentForeground` | `#FCFCFC` | `#181818` | 强调色上的前景 |

> 刻意保留 Opptrix 单色墨，**未**采用 Cursor Light/Dark 的按钮蓝（`#2778C1` / `#81A1C1`）。

### 2.2 中性色（对齐 Cursor Light / Dark）

> 层级与 Cursor `theme-cursor` 一致：主编辑区亮于侧栏（Light `#FCFCFC` / `#F3F3F3`；Dark `#181818` / `#141414`）。
> 品牌强调色仍为 Opptrix 墨色，**未**采用 Cursor 按钮蓝（`#2778C1` / `#81A1C1`）。

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `canvas` | `#FCFCFC` | `#181818` | 主内容区（Cursor `editor.background`） |
| `canvasAlt` | `#F3F3F3` | `#141414` | 左侧边栏 / chrome（略深于主区） |
| `canvasMuted` | `#EEEEEE` | `#2A2A2A` | 次级填充（侧栏下一档） |
| `surface` | `#FCFCFC` | `#181818` | 与主区同底的表面 |
| `surfaceHover` | `rgba(20,20,20,0.08)` | `rgba(240,240,240,0.067)` | 列表 hover（Cursor `list.hoverBackground`） |
| `border` / `separator` | `rgba(20,20,20,0.08)` | `rgba(240,240,240,0.075)` | 发丝分割（Cursor `#14141414` / `#F0F0F013`）；hairline 与 separator 同值 |
| `textPrimary` | `#141414` | `#F0F0F0` | 正文墨色 |
| `textSecondary` | `rgba(20,20,20,0.74)` | `rgba(240,240,240,0.74)` | 次级文案 |
| `textTertiary` | `rgba(20,20,20,0.60)` | `rgba(240,240,240,0.60)` | 弱化文案 |

### 2.3 文本

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `textPrimary` | `#141414` | `#F0F0F0` | 标题、正文 |
| `textSecondary` | `rgba(20,20,20,0.74)` | `rgba(240,240,240,0.74)` | 副标题、说明 |
| `textTertiary` | `rgba(20,20,20,0.60)` | `rgba(240,240,240,0.60)` | 弱化标签 |
| `accentForeground` | `#FCFCFC` | `#181818` | 主按钮文字 |

### 2.4 语义色

| Token | Hex | 用途 |
|-------|-----|------|
| `success` | `#5A9A6E` | 涨、在线 |
| `warning` | `#D4A054` | 警告 |
| `error` | `#C75B5B` | 跌、离线 |

## 3. Typography

跨平台统一打包开源字体（三端同一套；禁止仅 Windows 特判系统字体）。运行时通过 CSS 变量注入：

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `--opptrix-font-sans` | `"Noto Sans SC", sans-serif` | 界面正文 |
| `--opptrix-font-mono` | `"JetBrains Mono", …` | 代码 / 等宽 |

字重打包：Regular(400) + Medium(500) + Bold(700)。思源黑体与 Noto Sans SC 同源，通过 `@font-face family: "Source Han Sans SC"` 指向同一字体文件，避免双份 CJK 体积。许可证见 `client-ui/public/fonts/LICENSE`（OFL）。

`client-ui/src/styles/source-han-alias.css` **不入库**（gitignore），由 `npm run prepare:fonts`（`scripts/prepare-ui-fonts.mjs`）在构建前从 `@fontsource/noto-sans-sc` 生成。根目录 `npm run build`、`client-ui` 的 `prebuild`、`check:ui` 与 CI 均会调用；升级 `@fontsource/noto-sans-sc` 后须重跑 `prepare:fonts`。

### 3.1 字体大小变量

所有组件必须使用 CSS 变量（`var(--opptrix-font-*)`），禁止硬编码 px 值。变量定义在 `theme/tokens.ts` 的 `FONT_SCALES` 中，运行时通过 `fontScale.ts` 注入到 `<html>`。

| Level | 变量 | 默认值 | 用途 |
|-------|------|--------|------|
| xs | `--opptrix-font-xs` | 10px | Kicker、极小标签 |
| sm | `--opptrix-font-sm` | 11px | 辅助说明、提示、面板标题 |
| md | `--opptrix-font-md` | 12px | 正文小字、搜索元信息 |
| base | `--opptrix-font-base` | 13px | 正文、导航项、行标题 |
| lg | `--opptrix-font-lg` | 14px | 行标题、空状态标题 |
| xl | `--opptrix-font-xl` | 15px | 区段标题 |
| 2xl | `--opptrix-font-2xl` | 16px | 页面标题 |
| 3xl | `--opptrix-font-3xl` | 20px | 大标题、SectionHeader |
| 4xl | `--opptrix-font-4xl` | 24px | 统计数字 |
| display | `--opptrix-font-display` | 36px | 展示型大标题 |

### 3.2 界面字体预设

用户可在「设置 → 常规 → 外观 → 界面字体」切换正文族（等宽始终为 JetBrains Mono）：

| 预设 id | 展示名 | 字体栈 |
|---------|--------|--------|
| `noto-sans`（默认） | 清晰黑体 | `"Noto Sans SC", sans-serif` |
| `inter` | 现代无衬线 | `"Inter", "Noto Sans SC", sans-serif` |
| `source-han` | 思源黑体 | `"Source Han Sans SC", "Noto Sans SC", sans-serif` |

实现：`theme/fontFamily.ts` 提供 `applyFontFamily` / `readFontFamilyPreference` / `writeFontFamilyPreference`，持久化到 `localStorage` key `opptrix-font-family`；切换时派发 `opptrix-font-family-change`，行情图 / Mermaid / Canvas 监听并刷新。

### 3.3 字体大小预设切换

用户可在「设置 → 常规 → 外观 → 字体大小」切换 4 套预设：

| 预设 | 偏移 | 适用场景 |
|------|------|----------|
| 紧凑 | -1px | 信息密度优先 |
| 默认 | 基准 | 标准阅读 |
| 较大 | +1px | 舒适阅读 |
| 超大 | +2px | 无障碍/大字号 |

实现：`theme/fontScale.ts` 提供 `applyFontScale(name)` / `readFontScalePreference()` / `writeFontScalePreference()`，持久化到 `localStorage` key `opptrix-font-scale`。

行高：Body 1.5，标题 1.3。

## 4. Spacing & Radius

| Token | Value |
|-------|-------|
| `space-xs` | 4px |
| `space-sm` | 8px |
| `space-md` | 12px |
| `space-lg` | 16px |
| `space-xl` | 24px |
| `radius-sm` | 6px |
| `radius-md` | 10px |
| `radius-lg` | 14px |
| `radius-full` | 9999px |

## 5. Elevation

| Token | Value |
|-------|-------|
| `shadow-card` | `0 1px 2px rgba(26,26,26,0.04), 0 4px 12px rgba(26,26,26,0.06)` |
| `shadow-panel` | `0 0 0 1px #E8E6E1, 0 8px 24px rgba(26,26,26,0.08)` |

桌面端浮层优先使用 **毛玻璃（Frosted Glass）** 而非重阴影分层（见 §5.1）。

### 5.1 毛玻璃浮层（Panel / Dialog / Dropdown）

**统一用于**：Dialog、抽屉、下拉面板、策略选择器、聊天选区工具条、侧栏浮层等所有「盖在内容之上」的面板。

| 属性 | 值 |
|------|-----|
| 背景 | `rgba(255, 255, 255, 0.72)` |
| 模糊 | `blur(16px) saturate(160%)` |
| 描边 | `1px solid rgba(0, 0, 0, 0.06)` 或 `separator` token |
| 阴影 | `0 8px 32px rgba(0, 0, 0, 0.08)`（轻量，不抢毛玻璃质感） |

**实现**：

- 全局类：`.opptrix-glass-panel`（`global.css`）
- 二次确认 Dialog：`.opptrix-glass-dialog-surface` + `OpptrixDialogAlert`（`components/opptrix/OpptrixDialogAlert.tsx`）
- 复杂表单 Dialog：`.opptrix-dialog-surface`（Fluent `DialogSurface`）
- Mixins：`glassDropdown`、`glassPanel`（`theme/mixins.ts`）
- Tokens：`glass`、`glassBlur`、`surfaceGlass`（`theme/tokens.ts`）

**原则**：浮层与二次确认 Dialog **默认毛玻璃**；实体卡片（SurfaceCard、列表行）仍用 `surface` 实底 + 轻描边，不用毛玻璃。  
Electron **固定左侧栏**：macOS 用窗口 `vibrancy: 'sidebar'`（浅/深窗底色对齐 Cursor `#00FFFFFF` / `#40000000`），Windows 用 `backgroundMaterial: 'mica'`。vibrancy 开启时对齐 Cursor glass：`color-mix` 侧栏约 **42% / 36%**（`canvasAlt`）；主区 **单层** tint 约 **84% / 72%**（`canvas`）落在 `.opptrix-app-main` / `.opptrix-settings-content`，子级 chrome / 面板 / 聊天根节点（`.opptrix-chat-panel`、`ChatView` root、title-bar、`.opptrix-right-panel`、新闻/市场/专家全高页根等）保持透明以免叠层；内部卡片与列表 surface 仍可实底；启动 / onboarding 仍实色。Linux 与窄窗浮层侧栏仍用 CSS `.opptrix-glass-sidebar` / `.opptrix-overlay-sidebar`。  
二次确认 Dialog（`.opptrix-glass-dialog-surface` / `.opptrix-dialog-alert-surface`）对齐 Cursor pretty-dialog 紧凑度：圆角约 12px、标题 ~13px / weight 600、正文 ~12px 次级色、按钮行 gap 6px / min-height 28px；表面 `color-mix(canvas 92%, transparent)` + `blur(16px)`。**accent 仍为 Opptrix 墨色**，不用 Cursor 按钮蓝。  
聊天 `ask_user` 面板（`.opptrix-composer-user-prompt-panel`）同为 glass bubble：无 uppercase 喊麦标签、option hover 用 `rgba(20,20,20,0.08)`、确认行紧凑右对齐。  
**Agent 规则**：`.cursor/rules/ui-overlay-components.mdc`（组件选型表与禁止项）。

## 6. Layout Constants

| Token | Value |
|-------|-------|
| `sidebar-width` | 220px |
| `panel-width` | 320px |
| `header-height` | 56px |
| `nav-item-height` | 36px |
| `content-max-width` | 1200px（主内容区可选居中） |

## 7. Components

### 7.1 SidebarNavItem

- 高度 36px，圆角 `radius-md`
- 默认：透明底，Secondary 文字
- Hover：`surfaceMuted` 背景
- Active：`surfaceMuted` 底 + 左侧 3px `accent` 指示条 + Primary 文字 + 图标 accent 色

### 7.2 SurfaceCard

- 背景 `surface`，圆角 `radius-lg`，`shadow-card`
- 内边距 `space-lg`
- 可选标题 H2 + Caption 副标题

### 7.3 StatCard

- 最小宽 120px，圆角 `radius-md`
- 标签 Caption，数值 Stat 字号
- 用于工作台指标、诊断摘要

### 7.4 ModuleCard（工作台入口）

- 可点击 SurfaceCard
- Hover：边框 `accent` 1px + 轻抬升 shadow
- 左侧图标 24px accent 色

### 7.5 PageHeader

- Kicker（橙色 CAPS）+ H1 标题
- 右侧：刷新 / 设置 / 自定义 actions

### 7.6 AgentPanel（右栏）

- 宽 320px，背景 `surface`
- 左边框 `border`
- 空态居中 Caption 文字
- 对话气泡：用户 `accentSoft` 底，助手 `surfaceMuted` 底

### 7.7 毛玻璃浮层面板

- 发现页策略下拉、设置抽屉、Follow 对话框、SkillSheet 等浮层使用 **§5.1 毛玻璃**
- 类名 `.opptrix-glass-panel` 或 mixin `glassDropdown`
- 列表内选项 Hover：半透明白底 `rgba(255,255,255,0.45)`，不用实体灰块
- 自定义锚定面板：`OpptrixDropdownPanel`；Fluent 下拉 listbox：`mergeOpptrixDropdownListboxProps`

### 7.7.1 OpptrixButton

统一按钮组件（`components/opptrix/OpptrixButton.tsx`），交互态来自 `theme/mixins.ts`，禁止在业务页手写 hover/active。

| variant | 视觉 | 适用场景 |
|---------|------|----------|
| `primary` | 墨色实心（`#141414` / `#F0F0F0`），圆角 `radiusSm`（6px） | 主操作（创建、保存、开始聊天） |
| `secondary` | `surfaceHover` 轻填充，hover 略加深；圆角 6px | 次要实心操作（刷新、编辑、Dialog 取消） |
| `outline` | 白底 + 描边；hover 变浅灰、描边加深；focus-visible 焦点环 | 紧凑行内操作（列表「聊天」） |
| `ghost` | 透明 | 弱操作（取消、删除旁） |
| `danger` | 错误色软底 | 破坏性确认 |
| `icon` | 透明图标按钮 | 工具栏图标 |

尺寸：`small`（min 22px）/ `medium`（min **28px**、paddingX 12、font 13px，对齐 Cursor monaco-button）/ `large`（min 40px）。所有变体共享 hover、active（含轻微缩放）与 focus-visible。**禁止**把 accent 改成 Cursor 按钮蓝 `#2778C1`。

### 7.7.2 OpptrixInlineEdit

行内编辑（`components/opptrix/OpptrixInlineEdit.tsx`）：输入 + 确认/取消，供 titlebar 会话重命名等场景复用。

| `sizeMode` | 行为 | 适用 |
|------------|------|------|
| `auto`（默认） | 隐形 sizer 随文案撑宽，`minWidth` / `maxWidth` 可约束 | 标题栏重命名 |
| `fill` | 输入占满父级剩余宽度 | 侧栏/归档行内 |

Enter 确认、Esc 取消；Electron 宿主需挂 `-webkit-app-region: no-drag`（类名 `.opptrix-inline-edit`）。

### 7.8 浮层与反馈（统一组件）

| 场景 | 组件 | 样式类 / Provider |
|------|------|-------------------|
| 二次确认（删除、清空等） | `OpptrixDialogAlert`、`useOpptrixDialogAlert()` | `.opptrix-glass-dialog-surface`；根节点 `OpptrixDialogAlertProvider`（`main.tsx`） |
| 复杂表单 Dialog | Fluent `Dialog` + `OpptrixField` 等 | `.opptrix-dialog-surface` |
| 操作结果 Toast | `useSettingsToast()` | `SettingsToastProvider`（设置页等）；mixin `glassPanel` |
| 侧栏内联确认 | `OpptrixInlineEdit`（`sizeMode="fill"`）或列表行内按钮 | 与行同高，不用 Dialog |
| 分段 Tab（胶囊） | `OpptrixSegmentedControl` | `.opptrix-segmented-control`；侧栏用 `variant="embedded"` |

### 7.9 设置页组件体系

设置页 (`SettingsPage.tsx`) 使用 `settings/SettingsPrimitives.tsx` 提供的基础组件，**视觉对齐 Cursor 现代设置页**（`cursor-settings-*` / `.cursor-settings-cell` / `.cursor-settings-sub-section-list` / `.cursor-settings-sidebar-cell`），而非旧版 VS Code settings-editor。Accent 仍用 Opptrix 墨色，不用 Cursor 按钮蓝。

| 组件 | 用途 | 说明 |
|------|------|------|
| `SettingsGroup` | 分组容器 | ink 4% 浅底 + 发丝边框，`border-radius: 12px`，`overflow: hidden`；行间无 gap，靠分割线分隔 |
| `SettingsCard` | 独立卡片 | 与 Group 同表面规格，带内边距 |
| 表面常量 | `settingsSurfaceTint` / `settingsHairlineBorder` / `settingsSurfaceRadius` | 供 section 列表卡复用，避免复制 color-mix 魔法字符串 |
| `SettingsSectionHeader` | 分组标题区 | 标题 12px / `textSecondary`（无 uppercase）；描述 12px / `textTertiary`；容器 gap 8px |
| `SettingsRow` | 设置行 | 对齐 `.cursor-settings-cell`：`padding 12×14`、标题/描述 13/400、描述用 `textSecondary`、控件区 trailing gap 8px |
| `SettingsPanelHeader` | Group 内小标题 | 12px / `textSecondary`，`padding ≈ 8×14`，**禁止** uppercase / 大 letter-spacing；可带右侧 `action`（如「+ 添加」）将入口置于列表顶部 |
| `SettingsSectionLabel` | Group 上方页级标签 | `font-md` / 400 / `textSecondary` / line-height 16px；**禁止** `font-base`+600 或 uppercase |
| `SettingsListPanel` | 列表面板 | 与 Group 同表面规格；可选固定 `height`；容纳 `SettingsAddBar` + `SettingsListScroll` + `SettingsListRow` |
| `SettingsAddBar` | 列表顶栏 | 左侧说明（meta）+ 右侧添加/导入等操作；与 `SettingsPanelHeader` 互补（独立 listPanel 用本组件） |
| `SettingsListScroll` | 列表滚动区 | 置于 AddBar 与行之间，自带 hover 滚动条样式 |
| `SettingsListRow` | 列表行 | **默认只展示名称**（+ 可选一行说明）+ trailing 控件；勿默认暴露 URL / 路径 / 技术 id |
| `SettingsInlineInput` | 行内输入框容器 | `inputShellInteractive` 外壳，最大宽约 **160px**（对齐 Cursor `.settings-input-cell-field`） |
| `SettingsTextField` | 文本输入 | 封装 `SettingsInlineInput` + Fluent `Input` |
| `SettingsMonospaceEditor` | 等宽多行编辑 | CodeMirror（`@uiw/react-codemirror`）：行号、折行、括号匹配；默认高 320px。用于**沙盒环境**访问白名单与 **MCP 服务器** JSON 高级编辑 |
| `SettingsCredentialRow` | 密钥编辑行 | 密码框 + 眼睛切换 + 测试/保存按钮，连续编组 |
| `SettingsActionRow` | 可点击行 | 整行可点击；hover 用 `surfaceHover`；文字规格与 `SettingsRow` 一致；trailing 可用 Chevron（页内导航） |
| `SettingsExternalLinkRow` | 外链行 | 可选 leading icon + 标题/一行说明 + trailing `OpenRegular`（外开）；单层可点、`surfaceHover`；勿用 Chevron 冒充外链 |
| `SettingsDivider` | 分割线 | 高 1px / `separator`；左右缩进与 cell padding 对齐（约 `0 14px`）；可选 fullWidth |
| `SettingsStaticBlock` | 静态文本块 | 只读信息展示 |
| `SettingsProviderRow` | 模型提供商行 | 头像 + 名称 +「N 个模型」副标题（可点打开列表）；右侧仅编辑/删除，不展示 URL |
| `SettingsEmptyState` | 空状态 | 居中图标 + 标题 + 描述，无内容时的占位展示 |
| `SettingsRemoteModelSelector` | 设置页远程选模 | 薄封装聊天 `ModelSelector`：按提供商分组一步选定，同时写入 `provider_id` + `model`（翻译 / 多模态视觉） |
| 数据源列表 | `ProviderSettingsCatalog` | 紧凑行（名称 / 状态 / 启用 / 拖拽）；点击行或「配置」打开 glass Dialog 编辑密钥与连接，不再行内 accordion |

**Cursor 设置页规格**（本机 glass CSS 实测对齐）：

- **页头（tab header）**：`pageTitle` ≈ 17px / 500 / line-height 21px / `textPrimary`；`pageSubtitle` 13px / 400 / line-height 18px / `textSecondary`；header 内间距约 4px（subtitle `marginTop: 4px`）。内容区保留章节 `pageTitle` / `pageSubtitle`；**不**再叠 mac 专用 `StandaloneElectronTitleBar`「设置」次级 band（与非 mac 一致）。
- **Section 标签（Group 上方）**：`sectionLabel` 12px / line-height 16px / `textSecondary`；**禁止 uppercase / 大 letter-spacing**；与 Group gap 8px；多 section 列表间距约 12–16px（`contentBody` gap）
- **Group / Card**：背景 `color-mix(in srgb, var(--opptrix-text-primary) 4%, transparent)`（对齐 Cursor `--cursor-bg-quinary`）；发丝边框同级 ink 4%；**不要**厚边框实心 `canvas` 卡片感；圆角 12px
- **Row / Cell**：`padding: 12px 14px`；`gap: 20px`；默认 `align-items: center`，stack 时 `flex-start`
- **侧栏导航（`SettingsSidebar`）**：对齐 `.cursor-settings-sidebar-cell` — 项 padding ≈ `5×8`、`border-radius: 6px`、字号约 12–13px、默认 `textSecondary`；选中 `sidebarSelected` / `surfaceHover` 浅底 + `textPrimary`（勿过重）；搜索框保持紧凑
- **侧栏分割线**：panel 模式与聊天左侧栏一致 — `WorkspaceSplitDivider` 默认 `tone`（`separatorStrong`），宽度 `WORKSPACE_SPLITTER_WIDTH`；panel 不叠 `opptrix-sidebar-edge`（发丝右缘仅 drawer 等需独立边时使用），避免与分割条「双线」
- hover：`surfaceHover` 半透明底，不用实体灰块
- 响应式断点：`660px` 竖向堆叠
- 过渡：`motion.fast(140ms)` + `cubic-bezier(0.4, 0, 0.2, 1)`
- 输入框：`size="small"` + `minHeight: 30px`，更紧凑
- 文案：面向最终用户，禁止技术术语（细则：`ui-copy-standard.mdc`）

**禁止**：`window.confirm` / `alert` / `prompt`；无类名的裸 `DialogSurface`；调用方手写厚边框大圆角 `canvas` 卡片与 `SettingsGroup` 打架。  
细则：`.cursor/rules/ui-overlay-components.mdc`。

### 7.10 TabList

- Fluent Tab `appearance="subtle"` 或自定义 pill
- 选中：白底 + shadow-card + accent 下划线

## 8. Fluent UI 映射

| 设计 Token | Fluent Token |
|------------|--------------|
| canvas | `colorNeutralBackground1` |
| surface | `colorNeutralBackground2` |
| surfaceMuted | `colorNeutralBackground3` |
| border | `colorNeutralStroke2` |
| accent | `colorBrandBackground` |
| textPrimary | `colorNeutralForeground1` |
| textSecondary | `colorNeutralForeground2` |
| textTertiary | `colorNeutralForeground3` |

主题实现：`client-ui/src/theme/opptrixTheme.ts`、`client-ui/src/theme/ThemeContext.tsx`

## 8.1 暗色模式与主题偏好

用户可在 **设置 → 常规 → 外观** 选择：

| `ThemePreference` | 说明 |
|-------------------|------|
| `system` | 跟随操作系统浅色/深色 |
| `light` | 始终浅色 |
| `dark` | 始终深色 |

持久化：`localStorage` key `opptrix-theme-preference`。启动时 `index.html` 内联脚本读取偏好并设置 `html[data-theme]`，避免闪白。

运行时桥接：

- `document.documentElement.dataset.theme` → `light` | `dark`
- CSS 变量 `--opptrix-*`（`global.css` + `applyCssVars`）
- Griffel `makeStyles` 使用 `opptrixCssVars.*`（值为 `var(--opptrix-*)`），禁止新增静态 hex 字面量
- `FluentProvider` 通过 `getOpptrixFluentTheme(resolvedScheme)` 切换

### 暗色 palette（对齐 Cursor Dark / Light 中性层级）

> 来源：本机 `/Applications/Cursor.app/.../extensions/theme-cursor/` 的 `cursor-light` / `cursor-dark`。
> 结构：主编辑区亮于侧栏；墨色 `#141414` / `#F0F0F0` + alpha 做边框与 hover。品牌强调色仍保持 Opptrix 单色墨，**未**改用 Cursor 按钮蓝。

| Token | Light | Dark |
|-------|-------|------|
| `canvas` | `#FCFCFC` | `#181818` |
| `canvasAlt` | `#F3F3F3` | `#141414` |
| `canvasMuted` | `#EEEEEE` | `#2A2A2A` |
| `textPrimary` | `#141414` | `#F0F0F0` |
| `accent` | `#141414` | `#F0F0F0` |
| `accentForeground` | `#FCFCFC` | `#181818` |
| `surfaceGlass` / `glassSurfaceBg` | `rgba(252,252,252,0.72)` | `rgba(24,24,24,0.72)` |
| `separator` / `border*` | `rgba(20,20,20,0.08)` | `rgba(240,240,240,0.075)` |
| `separatorHairline` | 与 `separator` 同值（无 color-mix 再淡化） | 同左 |
| `inputBg*` | `#FCFCFC` / hover `#F3F3F3` | `rgba(240,240,240,0.039)` 等 |

语义色（`success` / `warning` / `error`）保留色相，仅调整 `*Soft` 背景 alpha。Markdown 与 Mermaid 分别见 `styles/markdown/tokens.css`、`MermaidBlock.tsx`。


- 库：`@fluentui/react-icons`
- 风格：**Regular**（线型），禁用 Mixed/Filled 混用
- 尺寸：导航 20px，卡片 24px，按钮内 16px
- 颜色：默认 `textSecondary`，Active `accent`

## 10. 动效

- 过渡：`150ms ease`（背景、边框、shadow）
- 禁止大面积动画；加载用 Fluent `Spinner size="tiny"`

## 11. 无障碍

- 对比度：正文对 canvas ≥ 4.5:1
- 焦点环：Fluent 默认 focus visible
- 图标按钮必须 `aria-label`
