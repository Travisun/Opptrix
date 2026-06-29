# innoAStock UI Design System

> 参考 EchoBird 风格：**暖色浅色画布、陶土橙强调、圆角卡片、紧凑信息密度**。基于 Fluent UI v9 组件，自定义 Design Tokens。

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **Calm Canvas** | 大面积暖灰背景，减少视觉噪音 |
| **Card-First** | 信息以圆角卡片分组，轻阴影分层 |
| **Accent Sparingly** | 陶土橙仅用于品牌、选中态、关键 CTA |
| **Compact Clarity** | 紧凑间距，但保持 12px+ 正文可读性 |
| **Plain Language** | 按钮、提示、空状态等文案面向最终用户，易懂、可操作；细则见 `.cursor/rules/engineering-guidelines.mdc` |
| **Icon Consistency** | 统一 `@fluentui/react-icons` Regular 20px |

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

| Level | Size | Weight | 用途 |
|-------|------|--------|------|
| Kicker | 11px | 600 | 英文/拼音分组标签，letter-spacing 0.06em，大写 |
| H1 | 22px | 600 | 页面主标题 |
| H2 | 16px | 600 | 卡片标题 |
| Body | 13px | 400 | 正文 |
| Caption | 12px | 400 | 辅助说明 |
| Stat | 24px | 600 | 统计数字 |

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

- 全局类：`.inno-glass-panel`（`global.css`）
- Dialog：`.inno-glass-dialog-surface`（Fluent `DialogSurface`）
- Mixins：`glassDropdown`、`glassPanel`（`theme/mixins.ts`）
- Tokens：`glass`、`glassBlur`、`surfaceGlass`（`theme/tokens.ts`）

**原则**：面板与 Dialog **默认毛玻璃**；实体卡片（SurfaceCard、列表行）仍用 `surface` 实底 + 轻描边，不用毛玻璃。

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
- 类名 `.inno-glass-panel` 或 mixin `glassDropdown`
- 列表内选项 Hover：半透明白底 `rgba(255,255,255,0.45)`，不用实体灰块

### 7.8 TabList

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

主题实现：`client-ui/src/theme/innoTheme.ts`

## 9. 图标规范

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
