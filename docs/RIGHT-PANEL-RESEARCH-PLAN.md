# 右侧投研面板升级规划

> 目标：将右侧面板从「行情监视器」升级为 **扫描 → 排序 → 触发研讨** 的投研工作台，与聊天区深度论证形成闭环。  
> 框架参考：国际投行研究流程（自上而下 + 自下而上）与主流因子体系（价值、质量、成长、动量、风险、资金流）。

## 现状与缺口

### 已有能力

| 层级 | 内容 |
|------|------|
| **关注 Tab** | 价格、涨跌幅、持有/关注收益、备注 |
| **个股 Tab** | K 线 + CYQ、基本面、公司信息、新闻、F10 |
| **数据层** | `a-stock-layer` 50+ Capability（行情、财报、资金流、筹码、龙虎榜等） |
| **ResearchHub** | `stock_diagnosis`、`institution_rating`、`screening`、`strategy_signal`、`portfolio_analysis`、`industry_mining` 等 |

### 缺口

| 用户目标 | 列表层缺什么 |
|---------|-------------|
| 选股 / 发现 | 没有「为什么值得关注」的结构化信号 |
| 持仓 / 买卖点 | 没有与成本、策略、资金/筹码共振相关的决策提示 |
| 行业透视 | 没有行业相对位置、同业对比、产业链上下文 |

---

## 信息架构（目标态）

在现有 **「关注 | 个股」** 上演进为四层：

```
┌─────────────────────────────────────┐
│ 关注 │ 发现 │ 行业 │ 组合              │  ← 顶栏 Tab
├─────────────────────────────────────┤
│ ① 情境条（市场/行业/组合一句话）        │
│ ② 主列表 / 主视图                      │
│ ③ 选中标的「决策卡」摘要               │
│ ④ 「送入聊天研讨」快捷动作             │
└─────────────────────────────────────┘
```

**原则**：右栏负责扫描与排序；聊天负责深度论证。面板生成结构化 context，一键注入对话。

---

## 数据维度规划

### 1. 关注列表 — 决策雷达

| 维度 | 展示 | 后端 | 依据 |
|-----|------|------|------|
| 综合评分 | 72 或 B+ | `latest_evaluation` / `stock_diagnosis` | 多因子 scorecard |
| 策略倾向 | 偏多 / 中性 / 偏空 | `strategy_signal` | 技术 + 资金 + 基本面融合 |
| 机构共识 | 增持 / 覆盖数 | `institution_rating` | 卖方共识 |
| 估值位置 | PE/PB 分位 | stock-eval `pe_percentile` 等 | 相对历史估值 |
| 资金态度 | 主力净流入 | `stock_money_flow` | 聪明钱行为 |
| 筹码结构 | 获利% / 90% 成本带 | `stock_cyq` / chart CYQ | 行为金融 |
| 事件催化 | 财报 / 解禁 / 调研 | `perf_forecast` 等 | 事件驱动 |
| 相对行业 | 行业排名 | `IndustryNeutralizer` | 行业中性 alpha |

**列表第二行示例：**

```
半导体 · B+ · PE 18%分位 · 主力 +1.8亿
```

**持有 vs 关注：**

- **持有**：成本偏离、浮盈、距 MA20 / 筹码均成、策略是否仍偏多
- **关注**：关注收益、评分变化、是否进入「观察买入区」

### 2. 发现 Tab — 策略化选股

预设策略池（`screening` + scorecard）：

| 策略 | 逻辑 |
|------|------|
| 价值回归 | PE/PB 低分位 + ROE 稳定 |
| GARP | PEG < 1 + 盈利增速 |
| 质量成长 | ROE↑ + 毛利率↑ + 低负债 |
| 动量突破 | 12-1 动量 + 放量 |
| 资金共振 | 主力连续流入 |
| 事件催化 | 业绩预增 + 机构调研 |

结果字段：综合分、key_factors、与关注重复度、一键加入关注 / 送聊天。

### 3. 行业 Tab — Sector Lens

- 行业选择器（从关注聚合或手动）
- 行业仪表盘：`industry_mining`、`sector_money_flow`
- 产业链：`industry_mermaid`
- Comps 表：PE/PB 分位、ROE、增速、评分、相对行业

### 4. 个股决策卡 — 买卖点研讨

固定 **One-pager 决策卡**（评分、机构、策略、估值、逻辑/风险 bullet、技术/筹码/持仓、送聊天按钮）。

与 `FollowStockDialog`（交易记录、备注）打通：备注 = 投资逻辑，交易 = 策略验证。

### 5. 组合 Tab（可选）

`portfolio_analysis` + 本地持仓：行业暴露、组合评分、弱链、再平衡建议。

---

## 窄面板展示优先级

1. **必显（列表）**：评分 / 策略 / 涨跌 / 持有或关注收益  
2. **次显（第二行）**：估值分位、主力流、行业  
3. **详情（个股顶）**：决策卡 + 图表  
4. **深度（聊天）**：机构报告、策略验证、行业 mining 全文  

---

## 分期实施

| 阶段 | 内容 | 主要接口 | 状态 |
|-----|------|---------|------|
| **P0** | 关注列表决策雷达（评分、估值分位、主力流） | `watchlist_radar`、缓存 `latest_evaluation` | ✅ 已完成 |
| **P1** | 个股决策卡 + 送聊天研讨 | `stock_diagnosis`、`strategy_signal`、CYQ、holdings | ✅ 已完成 |
| **P2** | 发现 Tab（3–5 个预设筛选） | `screening` | ⬜ 待做 |
| **P3** | 行业 Tab + Comps | `industry_mining`、neutralizer | ⬜ 待做 |
| **P4** | 组合 Tab | `portfolio_analysis` | ⬜ 待做 |

### 性能约定

- 列表层：**批量轻量 API**，不逐只跑完整 `stock_diagnosis`
- 选中 / 展开：再拉完整评估与策略
- 评分优先读 `SnapshotStore` 缓存，后台或首次选中时刷新
- 策略信号：列表仅对**当前选中**标的拉取 `strategy_signal`

---

## P0 实现说明

### API：`watchlist_radar`

`POST /api/research` `{ feature: 'watchlist_radar', params: { codes: string[] } }`

返回每只：

- `total_score`、`scorecard`（来自 SnapshotStore，无则 null）
- `pe_percentile`、`pb_percentile`（来自缓存因子）
- `pe`、`pb`（实时行情）
- `main_net`、`flow_date`（最新主力净流入）

### UI：`WatchlistTab`

- 第二行：`行业 · 评分等级 · 估值 · 主力`
- 选中行额外异步加载 `strategy_signal` 显示「偏多/偏空/中性」

### 评分等级映射

| 分数 | 等级 |
|------|------|
| ≥ 80 | A |
| ≥ 70 | B+ |
| ≥ 60 | B |
| ≥ 50 | C |
| < 50 | D |

---

## 与聊天协作

| 动作 | 注入 context |
|------|-------------|
| 研讨买入点 | 评分维度、CYQ、资金流、持仓成本、用户备注 |
| 研讨卖出点 | 估值分位、策略转空、获利筹码、背离 |
| 行业对比 | Comps + 产业链摘要 |
| 发现池标的 | screening 条件 + key_factors |

---

## P1 实现说明

### 组件：`StockDecisionCard`

位于个股 Tab 标题区下方，展示：

- 评分 / 策略 / 机构 / 估值四格摘要
- 因子推导的逻辑与风险 bullet
- 现价、持仓、筹码、主力流一行上下文
- **研讨买入点** / **研讨卖出点** 按钮

### 数据加载（`useStockDecisionCard`）

并行请求：`latestEval`、`strategySignals`、`institutionRating`（可选）、`stockCyq`；资金流优先用 `stockDetail` 已有数据。

### 送聊天

点击研讨按钮 → 生成 Markdown 决策卡 context → 写入会话 `contextRef`（selection 类型）→ 预填 composer 提示语。用户确认后发送即可展开论证。

---

## 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — ResearchHub 与数据层
- [API.md](./API.md) — HTTP / research feature 列表
- [UI-LAYOUT.md](./UI-LAYOUT.md) — 右侧面板布局

---

## 待办事项

### 市况判断 `market_regime` — 外部宏观/期权数据源（后续）

**现状（已实现）**

- 实现位置：`packages/shared/src/market-regime.ts`，Hub feature `market_regime`，发现页市况横幅消费 `indicators`。
- 已接入（本地或行情层可得）：沪深300 动量、MA125 位置、250 日价格分位、HV20、成交额相对 20 日均值、市场广度、涨跌停家数、北向净流入、Marks 周期（PE 分档 / 价格分位代理）、综合情绪分。

**说明：以下指标需外部宏观/期权数据源，当前未接入**

| 来源框架 | 待接入指标 | 典型数据源 |
|---------|-----------|-----------|
| 14 宏观观察 | 社融规模及增速、M1-M2 剪刀差、LPR/MLF、10Y 国债收益率、信用利差 | 央行、中债登、Wind/同花顺宏观 |
| 15 市场情绪 | 中国波指 iVIX、50ETF 期权隐含波动率、认沽/认购比 | 上交所期权、行情商 |
| 15 市场情绪 | 融资买入占比、两融余额变化、新增开户数 | 交易所、中国结算 |
| 16 Marks 周期 | 社融增速触底、破净股数量、回购潮等确认信号 | 多源聚合 |

**后续扩展方式（无需改 UI 结构）**

1. 在 `MarketRegimeInputs`（`packages/shared/src/market-regime.ts`）增加可选字段，例如 `social_financing_yoy`、`m1_m2_spread`、`ivix` 等。
2. 在 `computeSentimentScore` / `computeMarketRegime` 中纳入新权重；`MarketRegimeIndicators` 同步暴露展示字段。
3. Hub `marketRegime()` 从宏观服务或新 driver 拉数后填入 inputs；发现页 `DiscoverTab` 已读取 `indicators`，无需改组件结构。

**验收参考**：极端市况仍遵循「多指标共振」原则（见 policies 15）；单源宏观数据接入后应写单元测试覆盖阈值与 regime 映射。
