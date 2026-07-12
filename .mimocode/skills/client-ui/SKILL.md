---
name: client-ui
description: >-
  client-ui engineering rules — UI/UX, desktop layout, overlay components,
  investor-facing copy, and mandatory post-edit verification (check:ui).
  Use when editing client-ui/** or any visible UI.
---

# client-ui 工程规范

## 动手前必读

- `docs/UI-DESIGN-SYSTEM.md`、`docs/UI-LAYOUT.md`
- Electron 壳：`docs/DESKTOP.md`
- 浮层/Dialog：下文「浮层与反馈」

## UI / UX

- React + Fluent UI v9、项目 tokens（`theme/tokens.ts`）、mixins、`global.css`
- 优先 `OpptrixButton`、`OpptrixField`、`OpptrixDialogAlert` 等封装
- 未获指示不引入移动版布局、额外 header、冲突的 shadow/圆角/间距
- **禁止** `window.confirm` / `alert` / `prompt`

## 桌面 / 聊天 UI

- Electron **始终 desktop 布局**（不因窗口变窄切 MobileTopBar）
- 小窗口侧栏：宽 < 侧栏 × 2.5 时**全高浮层**（`top:0; bottom:0`），白底轻毛玻璃，**无全屏遮罩**
- z-index（低→高）：`DESKTOP_Z_TITLE` → `DESKTOP_Z_OVERLAY_SIDEBAR` → `DESKTOP_Z_PANEL_TITLE` → `DESKTOP_Z_TOPBAR` → `DESKTOP_Z_SESSION_TITLE`（`desktop/constants.ts`）
- 最小宽度 `DESKTOP_CHAT_MIN_WIDTH`（510px），与 `apps/desktop/electron/main.cjs` 同步
- 小窗口左侧 8px 边缘 hover 可唤出浮层侧栏

## 界面文案（面向投资者）

- 写给使用者，非开发者；日常中文，避免裸用 hydrate、MCP、F10
- 按钮/标题用动词或明确结果；耗时操作给预期；失败说明可采取动作
- 一句能说清不写两句；空状态说明「为什么没有」和「下一步」
- 未经要求不批量改 Agent 系统提示或后端日志

## 浮层与反馈组件

| 场景 | 用法 | 样式 |
|------|------|------|
| 二次确认 | `OpptrixDialogAlert` 或 `useOpptrixDialogAlert().confirm()` | `opptrix-glass-dialog-surface` |
| 复杂表单 Dialog | Fluent `Dialog` + `OpptrixField` / `OpptrixInput` | `opptrix-dialog-surface` 或毛玻璃 |
| 搜索 / 命令面板 | 专用组件（如 `WorkspaceSearchDialog`） | `opptrix-dialog-surface` |
| 下拉 / 锚定浮层 | `OpptrixDropdownPanel`、`mergeOpptrixDropdownListboxProps` | `opptrix-glass-panel` |
| Transient 通知 | `useSettingsToast()`（需 `SettingsToastProvider`） | mixin `glassPanel` |
| 侧栏内联确认 | 同行 `inlineEditRow` + ✓/✕ | 不用额外 Dialog |
| 分段切换 | `OpptrixSegmentedControl` | `opptrix-segmented-control` |
| 分组设置块 | `OpptrixSurface`、`SettingsGroup` | 实底卡片 |

```tsx
const { confirm } = useOpptrixDialogAlert()
const ok = await confirm({
  title: '确定删除？',
  message: '删除后无法恢复。',
  confirmLabel: '删除',
  confirmTone: 'danger',
})
if (!ok) return
```

样式单一事实：`global.css` 的 `.opptrix-glass-dialog-surface` / `.opptrix-dialog-surface` / `.opptrix-glass-panel`；tokens 在 `theme/tokens.ts`。

新 UI **优先组合**现有 `Opptrix*`；仅当设计文档未覆盖且用户明确要求时才新增封装，并同步 `docs/UI-DESIGN-SYSTEM.md`。

## 改码后收尾验证（硬性）

```bash
npm run check:ui
```

| 步骤 | 脚本 | 能抓什么 |
|---|---|---|
| 类型 | `typecheck:ui` | TS、错误 props、缺导出 |
| ESLint | `lint:ui` | Hooks、`exhaustive-deps`、`react/jsx-key` |
| 模式审查 | `audit:ui` | 内联 instrument 传 hook、`listRowKey`、effect 依赖 `reset` |

| 改动范围 | 必跑 |
|---|---|
| `client-ui/**` | **`npm run check:ui`** |
| 仅 `packages/**`、`apps/server/**` | `npm run build:packages` |
| 同时改了两者 | **先** `build:packages`，**再** `check:ui` |

纯文档 / 规则且确定不影响编译可跳过；有疑虑一律跑。必须本地执行循环到通过；不得仅凭「应该没问题」结束。

原文：`.cursor/rules/client-ui-guidelines.mdc`、`ui-overlay-components.mdc`、`post-edit-verification.mdc`。
