# MCP 投研数据维度缺口分析

> 分支：`docs/mcp-research-data-dimension-gap`  
> 日期：2026-07-14  
> 目的：对照**行业领先的多资产投研科学家 / 买方卖方研究员工作流**，盘点 Agent 现有 MCP 工具覆盖，并列出**优先可接入的数据维度**，便于后续按 `mcp-tool-pack-routing.mdc` 挂 pack / 意图精排。

---

## 1. 现状总览

### 1.1 当前 Chat MCP 工具（按 Pack）

| Pack | 工具 | 主数据面 |
|------|------|----------|
| **core** | `search_instruments`, `get_instrument_capabilities`, `get_instrument_snapshot`, `get_instrument_quotes`, `batch_instrument_snapshots`, `ask_user`, `get_current_time`, 系统信息类 | 发现、身份消歧、价量截面、会话时钟 |
| **meta** | `list_tool_packs`, `activate_tool_pack` | 工具加载 |
| **fundamentals** | `get_instrument_profile`, `get_instrument_financials`, `get_instrument_shareholders`, `get_instrument_dividend` | **基本面事实表**（经 `queryInstrumentData`） |
| **instrument_analytics** | `get_instrument_chart`, `evaluate_instrument`, `get_instrument_strategy_signal`, `get_instrument_indicators`, `verify_instrument_strategy`, `get_instrument_latest_evaluation`, `get_instrument_cyq`, `get_instrument_institution_*` | K 线/技术、内部评分卡、策略信号、筹码、**内部**「机构风格」评估 |
| **market** | `get_market_regime`, `get_market_dynamics`, `get_trend_brief`, `get_closing_report`, `get_morning_brief`, `get_instrument_money_flow` | 宏观状态、市场全景、单股趋势快评、开闭市报告、**个股资金流** |
| **etf** | `get_etf_list`, `get_etf_nav`, `get_etf_holdings` | ETF 目录/净值/成分 |
| **portfolio** | `get_watchlist`, `get_portfolio_holdings`, `portfolio_*`, `analyze_portfolio` | 自选、实盘组合暴露 |
| **industry** | `industry_mining`, `industry_mermaid` | 产业链叙事 + 图谱 |
| **news** | 资讯中心 list/detail + `get_instrument_notices` + `get_notice_content` | RSS/自建资讯 + **标的公告列表** + URL 公告正文 |
| **strategy_extra** | `run_backtest`, `strategy_report` | IC/评分卡回测、单股策略文报 |
| **provider_ext** | list/invoke custom methods | 逃生舱，非标准能力 |

约 **50+** 个聊天工具；Hub `InstrumentHubCapability` 已扩 `profile` / `financials` / `shareholders` / `dividend`（其余仍偏行情 + 内部评价）。

### 1.2 数据层已有、但 Agent MCP **未一等公民暴露**的能力

`InstrumentDataCapability`（`a-stock-layer`）中已规划/实现部分 Provider，但 **无独立 MCP 工具**（多数亦未进 `InstrumentHubCapability`）：

| Capability | 投研含义 | Agent 现状 |
|------------|----------|------------|
| `profile` | F10 公司概要、概念、上市信息 | 可能埋在 snapshot 碎片；无 `get_instrument_profile` |
| `financials` | 利润表/关键率同比等财务摘要 | **严重缺口**；评分可能间接用，Agent 无法核验「事实表」 |
| `dividend` | 分红派息史 | 无专用工具 |
| `shareholders` | 十大股东/流通股东 | 无专用工具 |
| `money_flow` | 个股资金流向 | 无专用工具 |
| `sector_list` | 板块/行业目录 | ✅ `get_sector_list` + `get_sector_constituents` |
| `etf_profile` | ETF 档案（跟踪指数、费率等） | ✅ `get_etf_profile` |
| `news` / `notices`（标的绑定） | 个股新闻/公告列表 | ✅ `get_instrument_notices` + `get_notice_content` |
| `stock_list` | 全市场名录分页 | 🟡 search + 成分；缺通用筛选器 |

结论：**数据层与 Agent 的 capability 面不对齐** —— 研究员缺的往往是「财务/股东/资金流/日历/宏观序列」这些**可引用的事实表**，而不是更多技术指标包装。

---

## 2. 专业投研科学家的「知识面 × 数据面」框架

以下按国际买方/卖方标准工作流（Equity Research、Multi-asset、Quant-informed discretionary）拆解。Agent 要「科学」，不是堆指标，而是能取到**可复核的多维证据**。

```
自上而下                    自下而上                    组合与风控
──────                      ──────                      ────────
宏观体制/政策/利率           商业模式与治理               持仓/暴露/归因
市场结构/流动性/波动         财务与估值                   情景与敏感性
板块轮动/风格因子            竞争格局与产业链             合规与建议边界
事件与日历                   资金/股东/预期差
```

| # | 研究维度 | 科学家通常依赖的数据 | 当前 MCP | 缺口等级 |
|---|----------|----------------------|----------|----------|
| A | **标的身份与范围** | 代码、交易所、资产类别、可交易性、上市状态 | search / capabilities / snapshot | 🟡 概念板块列表弱 |
| B | **价量与市场微观结构** | 现价、OHLCV、盘口/分时、波动、成交结构 | quotes / chart / indicators | 🟡 缺 Level-2/分时独立工具；美股盘前盘后有字段但无专项解读工具 |
| C | **基本面财务** | 三表、同比/环比、质量、现金流、指引 vs 实际 | （间接 evaluate） | 🔴 **P0** |
| D | **估值与相对估值** | PE/PB/EV、历史分位、同业分位、预期 PE | 实时可能带 pe/pb；无专用 | 🔴 **P0** |
| E | **增长与预期** | 一致预期 EPS/收入、上调下调、surprise | 无 | 🔴 **P0**（一致预期） |
| F | **公司质地与治理** | profile、管理层、股权结构、质押、回购 | 无独立 profile/股东 | 🟠 **P1** |
| G | **资本回报股东** | 分红、回购、增发、解禁 | dividend 层有能力未暴露 | 🟠 **P1** |
| H | **资金与持仓结构** | 北向/主力资金、融资融券、龙虎榜个股、ETF 申赎 | market_dynamics 笼统；money_flow 未暴露 | 🟠 **P1** |
| I | **卖方与内部模型观点** | 券商目标价、评级变更；内部 scorecard | institution_* = **Opptrix 内部风格评估**，非真实券商一致预期 | 🔴 命名易误导；缺真·一致预期 |
| J | **技术与行为** | 均线/动量/筹码/相对强弱 | chart / indicators / cyq / trend_brief | 🟢 相对成熟（偏 A 股） |
| K | **宏观与大类资产** | 体制、利率、汇率、商品、跨市场指数 | regime / dynamics / 开闭市报 | 🟡 缺利率/汇率/经济数据序列；偏快照叙述 |
| L | **行业与主题** | 产业链、市占、供需、政策 | industry_mining / mermaid | 🟡 偏结构化叙事，缺行业财务聚合/景气指标 |
| M | **事件、披露与舆情** | 官方公告、财报电话会、舆情 | RSS + notice_content(URL) | 🟠 **缺标的公告列表/财报日历** |
| N | **可比公司与筛选** | Peer set、多因子筛选、板块成分 | batch_snapshots；筛选策略已砍许多 screen_* | 🟠 **缺 peer / sector constituents / 结构化 screener** |
| O | **ETF / 产品工具** | 费率、跟踪误差、溢价、成分漂移 | list/nav/holdings | 🟡 缺 profile/溢价时间序列专项解读工具 |
| P | **组合构建与风险** | 持仓、因子暴露、回撤、相关性、情景 | portfolio_* / analyze / backtest | 🟡 缺波动/协方差/VaR/压力测试；归因浅 |
| Q | **另类与 ESG** | ESG 评分、供应链、卫星/专利等 | 无 | ⚪ P3 可选 |
| R | **跨市场深度** | 港美基本面、ADR、双重上市溢价 | 行情可；财务/股东弱 | 🟠 随 financials 一并规划 |
| S | **时效与日历** | 交易时段、休市、财报日、期权到期 | 会话时钟；无交易日历工具 | 🟡 **P1 交易日历** |

等级：🔴 阻塞「基本面科学家」叙事 · 🟠 强烈提升完整度 · 🟡 增强 · 🟢 已够用 · ⚪ 远期

---

## 3. 关键洞见（读完现有设计后）

### 3.1 「机构评级」≠ 卖方一致预期

`get_instrument_institution_rating/report` 走内部 `ConsolidatedEngine` 多「风格」打分，**不是** wind/bloomberg 式券商一致评级与目标价。提示词与 UI 已部分澄清，但对外接入新维度时建议：

- 保留内部模型工具命名带 `internal_` 或文档强制标注；
- 另开 `consensus_estimates` / `sellside_ratings`（若以后接第三方）。

### 3.2 Snapshot 不能替代财务事实表

Agent 做「分析茅台」时若只会 snapshot → evaluate，容易变成**模型黑盒话术**，违反我们刚部署的证据纪律（事实层 vs 推断层）。**必须**有可点开的 `financials` / `profile` / `shareholders` 工具。

### 3.3 Provider 逃生舱不能当主路径

`invoke_provider_custom_method` 可补洞，但不利于：选型卡、跨 Provider 缓存、证据引用、Discover 对齐。标准维度应进 **Hub capability + MCP 一等工具**。

### 3.4 筛选工具曾被收敛

多市场 `screen_*` / 本地库重度工具已移除；科学家仍需要**可控的**「板块成分 + 简单筛选」——应用标准 `sector_list` / `stock_list` + 在线筛选，而不是复活本地因子宇宙。

---

## 4. 建议新增的 MCP 工具（按接入优先级）

遵循：`tools.ts` + `TOOL_META` + `TOOL_PACK_MEMBERSHIP` + `INTENT_RULES` + 测试黄金用例。  
优先复用已有 `queryInstrumentData(ref, capability)`。

### P0 — 基本面事实层（建议新 pack：`fundamentals`）

| 建议工具名 | 数据 | 底层 | 意图示例 |
|------------|------|------|----------|
| `get_instrument_profile` | 公司概要、行业、概念、上市信息 | `profile` | 「公司是做什么的」「所属概念」 |
| `get_instrument_financials` | 财务摘要多期 YoY | `financials` | 「营收利润」「ROE 趋势」 |
| `get_instrument_valuation` | 估值指标 + 可选历史分位（可先薄后厚） | realtime 字段 + 后续专用 | 「估值贵不贵」「历史 PE 分位」 |

**为什么是 P0**：没有这三件，L3「深度投研备忘录」基本面维只能空缺或编造。

### P0′ — 预期与「真」卖方（建议 pack：`estimates`，可后做若依赖付费源）

| 建议工具名 | 数据 | 备注 |
|------------|------|------|
| `get_instrument_consensus` | EPS/收入一致预期、评级分布、目标价 | 需 TickFlow/Tushare 等权限；与内部 institution_* 并存 |
| `get_instrument_earnings_surprise` | 历史 beats/misses | 可与财报日历绑定 |

### P1 — 持有结构、资金、日历、事件

| 建议工具名 | Pack 建议 | Capability / 源 |
|------------|-----------|-----------------|
| `get_instrument_shareholders` | `fundamentals` | `shareholders` |
| `get_instrument_dividend` | `fundamentals` | `dividend` |
| `get_instrument_money_flow` | `flow`（新）或 `market` | `money_flow` |
| `get_instrument_notices` | `news` | 标的公告列表（再链 `get_notice_content`） |
| `get_market_calendar` | `core` 或 `market` | ⬜ 厚交易日/休市；薄层已有 `get_market_session` |
| `get_earnings_calendar` | `news` 或 `estimates` | 即将披露日 |

### P1′ — 可比与板块

| 建议工具名 | Pack 建议 | 说明 |
|------------|-----------|------|
| `get_sector_list` / `get_sector_constituents` | `industry` | ✅ Phase3 |
| `compare_instruments` | `instrument_analytics` | ⬜ 封装 batch snapshot + 关键财务列对齐 |

### P2 — 宏观序列、风控深化、ETF 产品、另类

| 建议工具名 | Pack | 说明 |
|------------|------|------|
| `get_macro_series` | `market` | 利率/汇率/商品/信用利差（时间序列） |
| `get_style_factors` | `market` | 大小盘/成长价值等风格表现 |
| `analyze_portfolio_risk` | `portfolio` | 波动、相关性、回撤、简单压力 |
| `get_etf_profile` | `etf` | ✅ Phase3 |
| `get_etf_premium_history` | `etf` | 溢价折价序列（nav 已有可增强） |
| ESG / 供应链等 | `alt_data` | 远期 |

### P2′ — 命名与提示词治理（非新数据）

- 文档/选型卡明确：`institution_*` = 内部多策略合成，不是券商一致预期。  
- L3 覆盖检查表增加：**财务 / 估值 / 股东或资金** 维；缺则 `activate fundamentals` 或声明缺口。

---

## 5. 建议 Pack 演进（与现有不冲突）

| Pack ID | 状态 | 建议 |
|---------|------|------|
| `fundamentals` | **新建** | profile, financials, valuation, shareholders, dividend |
| `estimates` | **新建（可晚于 fundamentals）** | consensus, surprise, earnings_calendar |
| `flow` | **新建或并入 market** | money_flow, 北向（若拆出） |
| `industry` | 扩展 | ✅ + sector_list / constituents |
| `news` | 扩展 | ✅ + instrument notices list |
| `market` | 扩展 | ✅ + money_flow / market_session；macro/厚日历待定 |
| `etf` | 扩展 | ✅ + etf_profile |
| `core` | 保持精简 | 仅考虑 calendar 是否 always-on（倾向放 market，避免 core 膨胀） |

---

## 6. 对「研究员日常问题」的覆盖缺口例

| 用户问题 | 今天靠什么 | 合理证据链（目标） |
|----------|------------|-------------------|
| 茅台贵不贵？ | pe 字段或 evaluate | financials + valuation 分位 + peer compare |
| 增速如何？ | evaluate 黑盒 | financials 多期 +（有则）consensus |
| 谁在减持？ | 无 | shareholders + notices |
| 北向在买吗？ | dynamics 摘要？ | money_flow |
| 下周四有没有财报？ | 无 | earnings_calendar + market_calendar |
| 同业比怎样？ | 手工 search + batch | sector constituents + compare |
| ETF 跟得紧吗？ | holdings + nav | etf_profile + premium + tracking proxy |

---

## 7. 推荐接入路线图（给后续 PR 用）

```
Phase 1（1–2 PR）— 证据纪律闭环
  Hub: instrument_profile / instrument_financials（经 queryInstrumentData）
  MCP: get_instrument_profile, get_instrument_financials
  Pack: fundamentals；INTENT + L3 覆盖检查更新
  测试：route accuracy 黄金用例 + Agent 集成

Phase 2
  get_instrument_shareholders, get_instrument_dividend
  get_instrument_notices（列表）+ 既有 get_notice_content
  get_market_calendar

Phase 3
  get_instrument_money_flow
  get_sector_constituents + compare_instruments
  get_etf_profile

Phase 4（依赖数据源合同）
  consensus / earnings surprise
  macro_series / portfolio risk
```

每一步：**禁止**只改 Engine 循环；挂 membership + 精排 + AGENT-GUIDE + `mcp-tool-pack-routing.mdc` 自检。

---

## 8. 非目标（刻意不做 / 慎做）

- 复活已移除的本地全市场因子 `screen_*` 作为 Agent 主路径  
- 用自定义方法**永久**替代 financials/profile 标准工具  
- 在无数据源时假装「一致预期」  
- 一次塞几十个新工具导致选型卡失效（必须随 pack + L1/L2/L3）

---

## 9. 一句话结论

今天的 Agent **强在行情、内部评分卡、ETF 产品浅层、资讯中心与工具路由**；作为「投研科学家」仍缺 **基本面事实表（财务/画像/股东）、真预期、资金流、标的级公告日历、板块可比与交易日历**。  

**最先该接的是 `fundamentals` pack（profile + financials ± valuation）** —— 数据层 capability 已在路上，与现有证据纪律 / L3 备忘录直接咬合；一致预期与宏观序列按数据源成熟度跟进。

---

## 10. 现有 MCP × 研究维度热力图（摘要）

```
维度        覆盖
身份发现    ████████░░
价量技术    ████████░░
内部模型    ███████░░░
ETF 浅层    ██████░░░░
资讯 RSS    ██████░░░░
宏观快照    █████░░░░░
产业叙事    █████░░░░░
组合持仓    █████░░░░░
基本面财务  ██████░░░░  ← Phase1 已接 profile/financials MCP
股东资金    ██████░░░░  ← 股东 + 个股资金流已接
一致预期    ░░░░░░░░░░
交易/财报日历 ██░░░░░░░░
可比公司    ██░░░░░░░░
组合风控深  ██░░░░░░░░
另类 ESG    ░░░░░░░░░░
```

---

## 11. 第一轮对照：标准 Capability × MCP × Provider Custom

> 结论先说：**缺口常在「MCP 一等公民」而非「引擎完全没数据」**。CN `get_instrument_snapshot` 已走 `stockDetail`，可内嵌 profile/financials/分红/资金流/股东/公告；但仍缺可核验、可分页的独立事实表工具。Custom 适合补标准外维度，不该永久替代标准能力。

### 11.1 标准 `InstrumentDataCapability` 对照表

| 标准 Capability | Engine / 详情页 | 独立 MCP（本轮后） | 代表 Custom（重叠或补齐） | 判定 |
|-----------------|-----------------|-------------------|---------------------------|------|
| `realtime` | ✅ | ✅ quotes / snapshot | 盘口类（Tickflow depth） | 🟢 价量够用；L2 另议 |
| `kline` | ✅ | ✅ `get_instrument_chart` | `tencent*Kline` | 🟢 |
| `snapshot` | ✅ 富（CN） | ✅ | F10 碎片多被详情吸收 | 🟡 胖快照 ≠ 事实表 |
| `profile` | ✅ | ✅ **`get_instrument_profile`** | `sinaCorpInfo`、HK/US Profile | 🟢 Phase1 |
| `financials` | ✅ | ✅ **`get_instrument_financials`** | `sinaFinancialPivot`、HK/US 财报 | 🟢 Phase1 |
| `dividend` | ✅ | ✅ **`get_instrument_dividend`** | `sinaDividends`、`tencentHkDividends` | 🟢 Phase1 |
| `shareholders` | ✅ | ✅ **`get_instrument_shareholders`** | `sinaMajor/Circulate*` | 🟢 Phase1 |
| `money_flow` | ✅ | ✅ **`get_instrument_money_flow`** | Provider `moneyFlow` | 🟢 Phase2 |
| `news` / `notices` | ✅ | ✅ **`get_instrument_notices`** + `get_notice_content` | `sinaBulletins*`、`tencent*Notices` | 🟢 Phase2 |
| `instrument_search` | ✅ | ✅ | `tencentStockSearch` | 🟢 |
| `stock_list` | ✅ | 🟡 search / ETF list / **constituents** | `tencent*StockList`、stockindex | 🟡 成分经 MCP |
| `sector_list` | ✅ | ✅ **`get_sector_list`** + **`get_sector_constituents`** | `tencentIndustry*`、`zzPlatesRank` | 🟢 Phase3 |
| `etf_*` | 部分 | ✅ list/nav/holdings/**profile** | `tencentFund*` 更全 | 🟢 Phase3（profile） |
| `technical_analysis` | 部分 | ✅ indicators/cyq/signal | `tencentHkTechnicalAnalysis` | 🟢 偏 A 股 |

### 11.2 Custom 增量面（标准外，勿误当已 MCP 化）

| 维度 | 代表方法 | MCP 现状 |
|------|----------|----------|
| 板块热度/成分/所属 | `tencentIndustry*`、`tencentStockPlates`、`zzPlatesRank` | 无结构化工具体 |
| 宏观序列 CPI/PPI/PMI | `bsMacro*` | 无；regime 偏叙事 |
| 龙虎榜/两融/解禁/内部人 | `sinaDragonTiger*`、`sinaMargin*`、`zzLhbDetail` | 无 |
| Level-2 盘口 | `fetchDepth`、`tfDepthBatch` | 无 |
| 港美投资评级/关联股 | `tencentHkInvestRating`、`*RelatedStocks` | 碎片 / ≠ 内部 institution_* |
| AkShare 另类大杂烩 | ~216 方法 | 仅 `provider_ext` |

### 11.3 仍缺清单

| 优先级 | 缺口 | 说明 |
|--------|------|------|
| P0′ | 真·一致预期 / surprise | 与内部 `institution_*` 并存；依赖数据源 |
| P1 | 完整交易/财报日历 | 仅有 `get_market_session` 轻量时段；厚日历仍走 provider_ext |
| P1′ | peer compare | 成分已有；缺结构化对比工具 |
| P2 | 宏观序列、组合风控深、L2 | — |
| P3 | ESG / AkShare 另类 | 保持逃生舱 |

### 11.4 Phase 实施状态

| 项 | 状态 |
|----|------|
| Pack `fundamentals` | ✅ |
| Hub `instrument_profile` / `instrument_financials` / `instrument_shareholders` / `instrument_dividend` | ✅（经 `queryInstrumentData`） |
| MCP 四工具 + 意图精排 + AGENT-GUIDE | ✅ |
| Phase2：`get_instrument_money_flow` / `get_instrument_notices` | ✅ |
| Phase3：`get_sector_list` / `get_sector_constituents` / `get_etf_profile` / `get_market_session` | ✅ |
| 完整交易日历 / valuation 专用 / comparison | ⬜ 后续 |

*接入以 CodeGraph + `mcp-tool-pack-routing.mdc` 为准；本节随实现同步更新。*
