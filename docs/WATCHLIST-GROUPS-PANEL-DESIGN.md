# 关注分组面板 — UI / 交互设计规格

> **分支**：`feat/watchlist-groups-panel-design`  
> **状态**：设计稿（待评审后分阶段实现）  
> **关联**：[`UI-DESIGN-SYSTEM.md`](./UI-DESIGN-SYSTEM.md)、[`UI-LAYOUT.md`](./UI-LAYOUT.md) §1.1、`WatchlistTab` / `WatchlistGroupsDialog` / `PortfolioTab`

---

## 1. 背景与目标

### 1.1 用户诉求

投资者希望按**主题 / 策略 / 账户**把关注列表拆开看：既要「一眼看全」，也要「按组看收益与持仓」。组合 Tab 已支持与关注共用分组筛选；**分组的管理与浏览体验**仍分散在：

- 顶栏 **芯片筛选**（仅切换视图）
- **Dialog 弹窗**（新建 / 重命名 / 排序 / 批量加入分组）

二者割裂，窄右栏内 Dialog 双栏布局拥挤，且筛选条缺少**分组摘要**（几只、几持有、组内涨跌）。

### 1.2 设计目标

| 目标 | 说明 |
|------|------|
| **一屏读懂** | 选中分组后，顶区即展示该组：标的数、持有数、组内关注收益 / 组合盈亏（有能力时） |
| **少打断** | 管理分组尽量在右栏内完成，避免全屏 Modal 遮挡 K 线与详情 |
| **与产品一致** | 沿用 Opptrix 墨色 accent、紧凑密度、`ghostInteractive` 行 hover、Regular 14px 图标 |
| **关注 ⇄ 组合对齐** | 同一套 `WatchlistGroupFilterBar` + 同一 `selectedGroupId`，文案与空状态口径一致 |
| **投资者语言** | 禁止「membership / Dialog / Provider」；用「分组 / 移入 / 移出 / 持有」 |

### 1.3 非目标（本期不做）

- 分组级独立组合账本（仍共用全局成交记录）
- 拖拽标的跨分组（可列入 Phase 2）
- 分组颜色 / 图标自定义（避免与 accent 体系冲突）

---

## 2. 现状审计

### 2.1 已有结构

```
RightMarketPanel
├── Tab: 关注 | 组合 | 详情
├── WatchlistTab
│   ├── 搜索
│   ├── chipRow（全部 + 分组 + ⚙️ → WatchlistGroupsDialog）
│   ├── 表格式列表（名称 + 四列指标）
│   └── footer（计数 + 刷新）
└── PortfolioTab（已复用 chipRow + 同一 selectedGroupId）
```

### 2.2 痛点

| # | 问题 | 影响 |
|---|------|------|
| P1 | ⚙️ 打开 Modal，与右栏窄宽冲突 | 左 240px 分组列表 + 右批量勾选，640px 以下叠列，操作路径长 |
| P2 | 芯片仅显示标题，无数量 / 盈亏 | 用户不知道「科技组今天怎样」 |
| P3 | 筛选与管理是两套入口 | 认知负担：「改分组」必须找齿轮 |
| P4 | 空分组 hint 指向齿轮 | 应支持在面板内直接「从全部关注添加」 |
| P5 | 组合 Tab 芯片与管理 Dialog 重复入口 | 两处 ⚙️ 打开同一 Dialog，但无统一面板感 |

---

## 3. 设计原则（对齐 Opptrix）

1. **Calm Canvas**：分组面板背景 `canvas` / `canvasAlt`，分割用 `separator` 发丝线，不用重边框。
2. **Compact Clarity**：行高 34–36px（与关注列表一致）；摘要区 metric 卡片 `surfaceMuted` + `radiusMd`。
3. **Accent Sparingly**：选中芯片 / 选中分组行用 `accentSoft` + `accent` 字色；destructive 才用 `error`。
4. **Card-First 摘要**：分组选中后，摘要 2×2 metric 网格（与 `PortfolioTab.summary` 同构）。
5. **Plain Language**：见 §8 文案表。
6. **Icon Consistency**：`@fluentui/react-icons` Regular 14px（行内操作 14，标题区 16）。

---

## 4. 方案对比（≥3 套）

### 方案 A — 保留 Dialog，仅增强芯片摘要

- **做法**：芯片显示 `标题 · N`；hover 显示持有数；⚙️ 仍开现有 Dialog。
- **优点**：改动最小，风险低。
- **缺点**：P1/P3 未解决；窄屏 Dialog 体验仍差。

### 方案 B — 右栏内嵌「分组面板」模式（推荐）

- **做法**：Tab 内增加第三态 **「分组」** 或在芯片行右侧增加 **「管理」** 切换到全高内嵌面板（非 Modal）。面板结构：上摘要、左分组列表、右关注勾选（复用 Dialog 逻辑，改容器）。
- **优点**：不遮挡详情；与 Session 附件抽屉同一层级感；可展示组级盈亏摘要。
- **缺点**：需重构 `WatchlistGroupsDialog` → 可嵌入的 `WatchlistGroupsPanel`。

### 方案 C — 底部 Sheet（移动优先）

- **做法**：桌面仍 Dialog，窄屏用 Sheet 上滑。
- **优点**：移动端友好。
- **缺点**：桌面与移动两套容器；Electron 桌面为主场景，优先级低于 B。

### 推荐：**方案 B**，芯片摘要作为 Phase 1 快速增益

| 阶段 | 内容 |
|------|------|
| **Phase 1** | 抽取 `WatchlistGroupFilterBar`；芯片显示计数；选中分组时顶栏摘要 strip |
| **Phase 2** | `WatchlistGroupsPanel` 内嵌模式，替代 Modal 为主入口 |
| **Phase 3** | 组级盈亏、拖拽排序分组内标的（可选） |

---

## 5. 推荐方案 — 信息架构

### 5.1 组件树（目标态）

```
WatchlistGroupFilterBar          ← 关注 / 组合共用
├── Chip「全部」
├── Chip「{分组名} · {n}」× k   ← 横向 scroll，opptrix-scroll-x
└── Button「管理分组」           ← 进入 Panel 模式（替代裸 ⚙️）

WatchlistGroupSummaryStrip       ← selectedGroupId != null 或 全部且有持有
├── Metric: 标的数
├── Metric: 持有数
├── Metric: 组内关注收益（加权或均值，见 §5.4）
└── Metric: 组内持仓收益（仅 portfolio 能力 + 有账本）

WatchlistTab | PortfolioTab
└── 列表（filteredItems / scopedHoldings）

WatchlistGroupsPanel             ← Phase 2，替换 Dialog 主路径
├── Header: 标题 + 关闭
├── Left: 分组列表（新建 / 重命名 / 排序 / 删除）
└── Right: 关注多选 + 加入/移出当前组
```

### 5.2 布局线框（右栏宽 320–360px）

**常态 — 关注 Tab + 选中「科技」分组**

```
┌─────────────────────────────────────┐
│ [搜索...........................]   │
├─────────────────────────────────────┤
│ (全部) (科技·8) (消费·5) ... [管理] │  ← FilterBar，高 34px
├─────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐             │
│ │ 8 只    │ │ 3 持有  │             │  ← SummaryStrip，可选 2×2
│ └─────────┘ └─────────┘             │
│ ┌─────────┐ ┌─────────┐             │
│ │关注收益 │ │持仓收益 │             │
│ │ +2.1%   │ │ +5.3%   │             │
│ └─────────┘ └─────────┘             │
├─────────────────────────────────────┤
│ 名称      最新价  关注收益 成本 持仓 │  ← 现有表头
│ ...                                 │
├─────────────────────────────────────┤
│ 8 只 · 科技 · 3 持有 · 约1分钟更新  │  ← footer
└─────────────────────────────────────┘
```

**分组管理 Panel 模式（覆盖列表区，不盖 Tab 顶栏）**

```
┌─────────────────────────────────────┐
│ ← 返回    管理分组                  │
├──────────┬──────────────────────────┤
│ 我的分组 │  全部分组内关注           │
│ + 新建   │  [☑] 贵州茅台  600519    │
│ ● 科技   │  [☐] 宁德时代  300750    │
│   消费   │  ...                     │
│          │  [加入当前分组] [移出]    │
└──────────┴──────────────────────────┘
```

- Panel 高度：`RightMarketPanel.content` 全高，**不**用全屏 Dialog。
- 关闭：左上角「返回」或 Esc → 回到列表，**保留**当前 `selectedGroupId`。

---

## 6. 视觉规格

### 6.1 WatchlistGroupFilterBar

| 属性 | 值 |
|------|-----|
| 容器 padding | `4px 15px 8px`（与现 chipRow 一致） |
| 底部分割 | `1px separator` |
| Chip 高度 | 26px，`radiusFull` |
| Chip 字号 | `--opptrix-font-sm` (11px)，选中 `fontWeight 500` |
| Chip 默认 | `textSecondary`，背景 transparent |
| Chip 选中 | `accentSoft` 底 + `accent` 字 |
| Chip 内容 | `{title}` 或 `{title} · {count}`；count 用 `textTertiary` 可略淡 |
| 管理按钮 | 文案「管理」或 `SettingsRegular` 14px；`chipEditBtn` 26×26 |
| 滚动 | `opptrix-scroll-x`，隐藏滚动条样式沿用全局 |

### 6.2 WatchlistGroupSummaryStrip

| 属性 | 值 |
|------|-----|
| padding | `8px 15px 6px` |
| 布局 | `flex-wrap`，gap 6px，与 PortfolioTab.summary 相同 |
| Metric 卡片 | `surfaceMuted`，`radiusMd`，min-width 72px，max-width calc(50% - 3px) |
| Label | `--opptrix-font-xs`，`textTertiary`，fontWeight 600 |
| Value | `--opptrix-font-base`，tabular-nums |
| 涨跌色 | `MARKET_UP` / `MARKET_DOWN` / `textSecondary`（与行情一致） |

**显示规则**

| 视图 | 条件 | 展示 |
|------|------|------|
| 全部 | 始终（有关注时） | 标的总数、持有总数、可选全库关注收益均值 |
| 某分组 | `selectedGroupId` 非空 | 组内标的数、组内持有数、组内收益指标 |
| 无数据 | 分组 0 只 | **不显示** SummaryStrip，仅 Empty |

### 6.3 WatchlistGroupsPanel

| 区域 | 规格 |
|------|------|
| Header 高 | 40px；标题 `--opptrix-font-lg`；返回按钮 ghost 28px |
| 左栏宽 | 固定 112px（右栏窄于 Dialog 240px，仅显示分组名） |
| 分组行 | 32px；选中 `accentSoft`；右侧 ⋯ 或 inline 上下移 |
| 右栏 | 关注行 36px；Checkbox Fluent small；批量工具栏 sticky 顶 |
| 主按钮 | `OpptrixButton` secondary small「加入当前分组」 |
| 危险操作 | 删除分组 → `OpptrixDialogAlert` 二次确认 |

### 6.4 动效

| 场景 | 参数 |
|------|------|
| Panel 进入 | translateX(8px→0) + opacity，240ms，`ease-out` |
| Panel 退出 | 反向 200ms |
| Chip 切换 | 无 layout shift；列表 cross-fade 可选 120ms |
| reduced-motion | 瞬时切换，无位移 |

---

## 7. 交互流程

### 7.1 筛选分组（主路径）

1. 用户点芯片「消费 · 5」
2. `selectedGroupId` 更新（Context 全局，关注 + 组合同步）
3. SummaryStrip 刷新组内指标；列表过滤；footer 文案更新
4. 再次点同一芯片 → **不取消**（避免误触）；切「全部」才取消筛选

### 7.2 新建分组

1. 点「管理」→ Panel 打开，左栏底部「新建分组」
2. 内联 Input 出现，默认名「新分组」选中态
3. Enter 保存 / Esc 取消；保存后自动 `activeGroupId` = 新组
4. 右栏提示「勾选关注后加入当前分组」

### 7.3 批量加入 / 移出

1. 左栏选中目标分组
2. 右栏勾选若干关注 →「加入当前分组」
3. 已在组内的项显示 tag；勾选后点「移出当前分组」
4. 操作乐观更新 + 后台 `saveWatchlistGroups`（与现 Dialog 一致）

### 7.4 删除分组

1. 左栏分组行 → 删除图标
2. `OpptrixDialogAlert`：「删除后，组内关注不会被取消关注，只是不再属于此分组。」
3. 确认后删除；若删的是当前筛选组 → `selectedGroupId` 回 null（全部）

### 7.5 空状态

| 场景 | 标题 | 说明 | 动作 |
|------|------|------|------|
| 无关注 | 还没有关注的股票 | 在上方搜索并添加 | — |
| 分组无标的 | 「{名}」还没有标的 | 搜索添加，或在管理分组里从全部移入 | 按钮「管理分组」 |
| 分组无持有（组合 Tab） | 「{名}」暂无持仓 | 在详情页录入买卖后这里会汇总 | — |
| 无自定义分组 | — | 芯片区仅「全部」+「管理」 | Panel 内引导新建 |

### 7.6 键盘与无障碍

- FilterBar chips：`role="tablist"`，chip `role="tab"`，`aria-selected`
- 左右键切换芯片（可选 Phase 2）
- Panel：焦点陷阱在 Panel 内；Esc 关闭
- 列表行：保留现有 Enter 选中标的

---

## 8. 文案规范（产品级）

| 场景 | 文案 | 避免 |
|------|------|------|
| Panel 标题 | 管理分组 | 管理关注分组 Dialog |
| 返回 | 返回 | 关闭 Modal |
| 新建 | 新建分组 | 创建 Group |
| 加入 | 加入当前分组 | 写入 membership |
| 移出 | 移出当前分组 | 删除映射 |
| 删除确认 | 删除「{名}」？关注列表里的股票不会一并删除。 | DROP 分组 |
| Summary 标签 | 标的 / 持有 / 关注收益 / 持仓收益 | 浮动 PnL API |
| Footer | `{n} 只 · {组名} · {m} 持有` | instrument count |
| 组合 Summary | `{组名} · 市值` / `分组收益` | 组合 PnL 接口 |

---

## 9. 数据与计算（前端）

### 9.1 芯片计数 `count`

- 来源：`filterWatchlistByGroup(items, membership, groupId).length`
- 不区分是否持有（持有数放 SummaryStrip）

### 9.2 组内关注收益（SummaryStrip）

- 对有 `addedPrice` 且拿到现价的项：沿用 `followReturnPct`
- 聚合：**市值加权平均**（有 live price）或 **简单平均**（缺价则跳过）
- 无有效样本：显示「—」

### 9.3 组内持仓收益

- 对 `lookupHoldingSnapshot` 有持仓的项：`holdingReturnPctFromQuote` 或 `displayPortfolioHoldingReturnPct`
- 聚合：**按市值加权**总盈亏率，与 `aggregatePortfolioScopeSummary` 一致
- 组合 Tab 直接复用 `portfolioGroupCalc`

### 9.4 状态同步

- 单一数据源：`WatchlistGroupsContext`（`groups`, `membership`, `selectedGroupId`）
- Panel 编辑 = 现 `replaceDoc`；**不**新增 API

---

## 10. 与组合 Tab 对齐

| 维度 | 关注 Tab | 组合 Tab |
|------|----------|----------|
| FilterBar | 相同组件、相同 chips | 相同 |
| selectedGroupId | 共享 | 共享 |
| SummaryStrip | 标的 / 持有 / 关注收益 / 持仓收益 | 市值 / 分组收益 / 浮动盈亏 / 持仓数 |
| 列表 | 四列行情表 | 持仓行（名 + 收益率 + 市值） |
| 管理入口 | 「管理」→ Panel | 同左 |
| Footer | 关注口径 | 持仓口径 |

用户在「科技」分组下切换 关注 ↔ 组合，**分组不变、摘要语义随 Tab 变**。

---

## 11. 实现清单（供开发拆分）

### Phase 1 — 低风险的体验增益

- [ ] `WatchlistGroupFilterBar.tsx` — 从 WatchlistTab / PortfolioTab 抽出
- [ ] 芯片 `{title} · {n}` 计数
- [ ] `WatchlistGroupSummaryStrip.tsx` — 关注 Tab 组内摘要
- [ ] 统一 footer 文案生成函数
- [ ] `npm run check:ui`

### Phase 2 — Panel 替代 Dialog 主路径

- [ ] `WatchlistGroupsPanel.tsx` — 自 Dialog 抽离内容区
- [ ] `WatchlistGroupsDialog` 薄封装 Panel（设置页等仍可用 Dialog）
- [ ] RightMarketPanel 内 Panel 路由态 `watchlistView: 'list' | 'groups'`
- [ ] 空状态 CTA 接 Panel

### Phase 3 — 增强（可选）

- [ ] 分组内拖拽排序（仅 UI 顺序，不影响 sortOrder）
- [ ] 芯片过多时「更多 ▾」溢出菜单
- [ ] 组级迷你 sparkline（需额外行情 batch）

---

## 12. 验收标准（AC）

1. 关注与组合 Tab 的分组芯片**外观与顺序一致**，切换 Tab 不丢选中组。
2. 选中分组后 1 秒内可见**组内标的数**；有持仓时可见**持有数**。
3. 管理分组在 360px 宽右栏内**无需横向滚动**即可完成：新建 → 加入 1 只关注。
4. 所有用户可见文案符合 §8，无技术术语。
5. 浅色 / 深色主题下 chips、Summary、Panel 对比度可读（沿用现有 tokens）。
6. `prefers-reduced-motion: reduce` 下无滑入动画。

---

## 13. 附录：与现有文件映射

| 设计组件 | 现有 / 目标文件 |
|----------|-----------------|
| FilterBar | 新建 `client-ui/src/market/WatchlistGroupFilterBar.tsx` |
| SummaryStrip | 新建 `client-ui/src/market/WatchlistGroupSummaryStrip.tsx` |
| GroupsPanel | 重构自 `WatchlistGroupsDialog.tsx` |
| 分组计算 | 扩展 `portfolioGroupCalc.ts` + 新建 `watchlistGroupCalc.ts`（关注收益聚合） |
| Context | `WatchlistGroupsContext.tsx`（不变） |
| 布局锚点 | `RightMarketPanel.tsx`、`WatchlistTab.tsx`、`PortfolioTab.tsx` |

---

*文档版本：2026-08-26 · 分支 `feat/watchlist-groups-panel-design`*
