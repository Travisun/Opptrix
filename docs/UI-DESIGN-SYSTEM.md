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

### 2.1 品牌色（Terracotta）

| Token | Hex | 用途 |
|-------|-----|------|
| `accent` | `#D17A5D` | Logo、主按钮、选中指示条 |
| `accentHover` | `#C4694F` | Hover |
| `accentSoft` | `#F5E8E3` | 浅底标签、AI 按钮背景 |
| `accentMuted` | `#E8C4B8` | 热力图低档 |

### 2.2 中性色

| Token | Hex | 用途 |
|-------|-----|------|
| `canvas` | `#F5F4F0` | 页面背景 |
| `surface` | `#FFFFFF` | 卡片、侧栏内嵌块 |
| `surfaceMuted` | `#EFEEEA` | 侧栏底、Hover 底 |
| `border` | `#E8E6E1` | 分割线、卡片描边 |
| `borderStrong` | `#D4D2CC` | 输入框 focus 前 |

### 2.3 文本

| Token | Hex | 用途 |
|-------|-----|------|
| `textPrimary` | `#1A1A1A` | 标题、正文 |
| `textSecondary` | `#6B6B6B` | 副标题、说明 |
| `textTertiary` | `#9A9A9A` | Kicker、分组标签 |
| `textOnAccent` | `#FFFFFF` | 主按钮文字 |

### 2.4 语义色

| Token | Hex | 用途 |
|-------|-----|------|
| `success` | `#5A9A6E` | 涨、在线 |
| `warning` | `#D4A054` | 警告 |
| `error` | `#C75B5B` | 跌、离线 |

## 3. Typography

字体栈：`"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif`

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

### 3.2 字体预设切换

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
Electron **固定左侧栏**：macOS / Windows 走窗口原生毛玻璃（侧栏透明穿透）；Linux 与窄窗浮层侧栏仍用 CSS `.opptrix-glass-sidebar` / `.opptrix-overlay-sidebar`。  
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

### 7.8 浮层与反馈（统一组件）

| 场景 | 组件 | 样式类 / Provider |
|------|------|-------------------|
| 二次确认（删除、清空等） | `OpptrixDialogAlert`、`useOpptrixDialogAlert()` | `.opptrix-glass-dialog-surface`；根节点 `OpptrixDialogAlertProvider`（`main.tsx`） |
| 复杂表单 Dialog | Fluent `Dialog` + `OpptrixField` 等 | `.opptrix-dialog-surface` |
| 操作结果 Toast | `useSettingsToast()` | `SettingsToastProvider`（设置页等）；mixin `glassPanel` |
| 侧栏内联确认 | 列表行内 `inlineEditRow` + 按钮 | 与行同高，不用 Dialog |
| 分段 Tab（胶囊） | `OpptrixSegmentedControl` | `.opptrix-segmented-control`；侧栏用 `variant="embedded"` |

### 7.9 设置页组件体系

设置页 (`SettingsPage.tsx`) 使用 `settings/SettingsPrimitives.tsx` 提供的基础组件：

| 组件 | 用途 | 说明 |
|------|------|------|
| `SettingsGroup` | 圆角卡片组 | 1px border + `radiusXl`，overflow hidden，多行设置项的容器 |
| `SettingsCard` | 独立卡片 | 与 Group 同风格，带 padding，适合单张独立的卡片 |
| `SettingsSectionHeader` | 页面标题区 | Kicker（大写标签）+ 主标题 + 副标题，Apple 风格页面头部 |
| `SettingsRow` | 设置行 | 标题 + 描述 + 控件，flex 布局，窄屏自动竖向堆叠 |
| `SettingsPanelHeader` | 面板标题行 | Group 内小写大写分组标签 + action 区域 |
| `SettingsInlineInput` | 行内输入框容器 | `inputShellInteractive` 外壳，最大宽 240px |
| `SettingsTextField` | 文本输入 | 封装 `SettingsInlineInput` + Fluent `Input` |
| `SettingsCredentialRow` | 密钥编辑行 | 密码框 + 眼睛切换 + 测试/保存按钮，连续编组 |
| `SettingsActionRow` | 可点击行 | 整行可点击的导航/操作入口 |
| `SettingsDivider` | 分割线 | 可选 fullWidth |
| `SettingsStaticBlock` | 静态文本块 | 只读信息展示 |
| `SettingsProviderRow` | 模型提供商行 | 头像 + 名称 + 模型查看 |
| `SettingsEmptyState` | 空状态 | 居中图标 + 标题 + 描述，无内容时的占位展示 |

**Apple 风格规范**（对齐 Apple HIG: Clarity / Simplicity / Craft）：
- 行内边距：`11px 20px`（窄屏 `10px 16px`）
- 分割线用 `separator`（已加粗至 0.14 alpha）
- 圆角：Group/Card 统一 `radiusXl(18px)`
- 侧栏导航：默认 `textSecondary` + `fontWeight: 400`，选中态加深加粗
- hover：`surfaceHover` 半透明底，不用实体灰块
- 响应式断点：`660px` 竖向堆叠
- 过渡：`motion.fast(140ms)` + `cubic-bezier(0.4, 0, 0.2, 1)`（Apple 默认曲线）
- 输入框：`size="small"` + `minHeight: 30px`，更紧凑
- 文案：面向最终用户，禁止技术术语（细则：`ui-copy-standard.mdc`）

**禁止**：`window.confirm` / `alert` / `prompt`；无类名的裸 `DialogSurface`。  
细则：`.cursor/rules/ui-overlay-components.mdc`。

### 7.9 TabList

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

### 暗色 palette（Apple 风格 monochrome）

| Token | Light | Dark |
|-------|-------|------|
| `canvas` | `#FFFFFF` | `#1C1C1E` |
| `canvasAlt` | `#F5F5F7` | `#2C2C2E` |
| `textPrimary` | `#1D1D1F` | `#F5F5F7` |
| `accent` | `#1D1D1F` | `#F5F5F7` |
| `accentForeground` | `#FFFFFF` | `#1C1C1E` |
| `surfaceGlass` / `glassSurfaceBg` | 白半透明 | `rgba(44,44,46,0.72)` |
| `separator` / `border*` | 深灰低 alpha | 浅灰低 alpha |
| `inputBg*` | 浅灰 | 抬升灰 `#3A3A3C` 等 |

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
