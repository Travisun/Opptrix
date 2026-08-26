# 扶摇（Fuyao）基金 API — Opptrix 对接说明

> 官方文档：<https://fuyao.aicubes.cn/docs/api-reference/fund-profile/>
> Provider ID：`tonghuashun`（同花顺金融数据，Base URL `https://fuyao.aicubes.cn`）
> **字段与端点以 `@opptrix/fuyao` SDK + FuyaoNPM `API_AUDIT.md` §12 为准**；站点旧文档若与 SDK 冲突，以 SDK/审计为准。
> **运行时 HTTP**：依赖 npm 包 `@opptrix/fuyao`（SDK）；`packages/.../tonghuashun/api/client.ts` 为薄适配层（保留历史方法名与 unwrap 后的 `{ item? }` 形状）。markets / Engine 边界仍为 `Standard*` 行与 `queryInstrumentData`，勿在 markets 直连 SDK。

## 认证与通用约定

| 项 | 说明 |
|---|---|
| Base URL | `https://fuyao.aicubes.cn` |
| 请求头 | `X-api-key: <用户配置的 API Key>`（存于 Provider 设置，非代码硬编码；由 SDK 注入） |
| 响应信封 | SDK 返回整包 `ApiResponse<T>`；适配层 unwrap 为 `data`，调用方继续用 `.item` |
| 时间戳 | 毫秒 Unix，时区 `Asia/Shanghai` |
| `fund_type` | `otc`（场外开放式）、`exchange`（场内 ETF/LOF）、`reits`（公募 REITs）；SDK 入参 camelCase `fundType` |
| `thscode` | 必须带后缀：`025480.OF`、`510300.SH`、`161725.SZ` |

### Opptrix 代码路由（`resolveFuyaoFundRoute`）

| 输入 | `fund_type` | `thscode` |
|---|---|---|
| 6 位场外基金（非场内代码表） | `otc` | `{code}.OF` |
| 6 位场内基金 / ETF / LOF | `exchange` | `{code}.SH` 或 `.SZ` |
| 已带 `.OF` / `.SH` / `.SZ` | 按后缀推断 | 原样规范化 |

## 全量 REST 端点清单

| 分类 | 路径 | FuyaoClient 方法 | Opptrix 状态 |
|---|---|---|---|
| 基本资料 | `GET /api/fund/profile/detail` | `fundProfileDetail` | ✅ `fundProfile` |
| 重仓持仓 | `GET /api/fund/portfolio/holdings` | `fundPortfolioHoldings` | ✅ `fundHoldings` |
| 股票持仓历史 | `GET /api/fund/portfolio/stock-history` | `fundPortfolioStockHistory` | ✅ Client（Agent 扩展） |
| 债券持仓历史 | `GET /api/fund/portfolio/bond-history` | `fundPortfolioBondHistory` | ✅ Client |
| 股票报告期 | `GET /api/fund/portfolio/stock-report-dates` | `fundPortfolioStockReportDates` | ✅ Client |
| 债券报告期 | `GET /api/fund/portfolio/bond-report-dates` | `fundPortfolioBondReportDates` | ✅ Client |
| 资产配置 | `GET /api/fund/portfolio/asset-allocation` | `fundPortfolioAssetAllocation` | ✅ `fundAllocation` |
| 行业配置 | `GET /api/fund/portfolio/industry-allocation` | `fundPortfolioIndustryAllocation` | ✅ `fundAllocation` |
| 净值序列 | `GET /api/fund/performance/nav` | `fundPerformanceNav` | ✅ `fundProfile` / `fundNav` / `fundQuote`（**须传 `range`**，见下方分工） |
| 区间收益 | `GET /api/fund/performance/returns` | `fundPerformanceReturns` | ✅ `fundProfile`（概览近一年）+ `fundReturns` |
| 风险指标历史 | `GET /api/fund/performance/indicators-historical` | `fundPerformanceIndicatorsHistorical` | ✅ Client |
| 回撤 | `GET /api/fund/performance/drawdowns` | `fundPerformanceDrawdowns` | ✅ `fundDrawdown` |
| 持有人结构 | `GET /api/fund/holders/detail` | `fundHoldersDetail` | ✅ `fundProfile`（扩展字段）+ `fundHolders` |
| 十大持有人 | `GET /api/fund/holders/top` | `fundHoldersTop` | ✅ `fundHolders` |
| 分红 | `GET /api/fund/corporate-actions/dividends` | `fundCorporateActionsDividends` | ✅ `fundDividend` |
| 经理详情 | `GET /api/fund/managers/detail` | `fundManagersDetail` | ✅ `fundManager` |
| 经理业绩 | `GET /api/fund/managers/performance` | `fundManagersPerformance` | ✅ `fundManager` |
| 经理经历 | `GET /api/fund/managers/experience` | `fundManagersExperience` | ✅ `fundManager` |
| 投资风格 | `GET /api/fund/managers/investment-style` | `fundManagersInvestmentStyle` | ✅ `fundManager` |
| 基金公司 | `GET /api/fund/companies/detail` | `fundCompaniesDetail` | ✅ `fundProfile` enrich（有 `company_id` 时并行） |
| 基金诊断 | `GET /api/fund/diagnostics/detail` | `fundDiagnosticsDetail` | ✅ `fundDiagnosis` |
| 财务指标 | `GET /api/fund/financials/indicators` | `fundFinancialsIndicators`（`sdk.funds.financials.indicators`） | ✅ `fundFinancials` → `mapFundFinancialsRow` |
| 利润表 | `GET /api/fund/financials/income-statements` | `fundFinancialsIncomeStatements`（SDK） | ✅ Client；详情主路径暂用 indicators |
| 资产负债表 | `GET /api/fund/financials/balance-sheets` | `fundFinancialsBalanceSheets`（SDK） | ✅ Client；详情主路径暂用 indicators |
| 场内快照 | `GET /api/fund/market/snapshot` | `fundMarketSnapshot` | ✅ ETF 路径；**场内公募基金 `fundQuote` 合并交易所价** |
| 场内历史 | `GET /api/fund/market/historical` | `fundMarketHistorical` | ✅ ETF K 线 |
| 资讯列表 | `GET /api/fund/news/article-list` | `fundNewsArticleList` | ✅ `fundNews` |
| 募集公告 | `GET /api/fund/offerings/list` | `fundOfferingsList` | ✅ Client |

## Opptrix Capability 映射

| Capability | Driver 方法 | 绑定 | 默认优先级 |
|---|---|---|---|
| `FUND_PROFILE` | `fundProfile` | CN / FUND | 120（同花顺全局） |
| `FUND_HOLDINGS` | `fundHoldings` | CN / FUND | 120 |
| `FUND_QUOTE` | `fundQuote` | CN / FUND | 120；**场内**并行 `fundMarketSnapshot` 合并交易所价；失败时回退 A 股 `realtime` |
| `FUND_NAV` | `fundNav` | CN / FUND | 120（`FundDetailTab` 走势） |
| `FUND_RETURNS` | `fundReturns` | CN / FUND | 120；独立 Capability，详情页业绩由 `fund_snapshot` profile 派生 |
| `FUND_DRAWDOWN` | `fundDrawdown` | CN / FUND | 120；独立 Capability，**不**纳入 `fund_detail` |
| `FUND_ALLOCATION` | `fundAllocation` | CN / FUND | 120（持仓 Tab 资产配置；仅拉 asset，不拉 industry） |
| `FUND_HOLDERS` | `fundHolders` | CN / FUND | 120；独立 Capability，详情页持有人结构由 `fund_snapshot` profile 派生 |
| `FUND_DIVIDEND` | `fundDividend` | CN / FUND | 120；独立 Capability，**不**纳入 `fund_detail` |
| `FUND_MANAGER` | `fundManager` | CN / FUND | 120；独立 Capability，**不**纳入 `fund_detail` |
| `FUND_DIAGNOSIS` | `fundDiagnosis` | CN / FUND | 120；独立 Capability，**不**纳入 `fund_detail` |
| `FUND_NEWS` | `fundNews` | CN / FUND | 120；独立 Capability，**不**纳入 `fund_detail` |
| `FUND_FINANCIALS` | `fundFinancials` | CN / FUND | 120；独立 Capability，**不**纳入 `fund_detail` |
| `ETF_*` | `etfProfile` 等 | CN / ETF | 120（`fund_type=exchange`） |

### `get_fund_performance_nav` / `fundPerformanceNav` 的 `range` 分工

扶摇净值接口：**不传 `range` 时最多返回 1 条**。Opptrix 调用约定：

| 调用方 | 常量 / `range` | 用途 |
|---|---|---|
| `fundNav` | `FUYAO_FUND_NAV_SERIES_OPTS` → `range=fyear` | 历史净值走势 |
| `fundProfile` / `fundQuote` | `FUYAO_FUND_NAV_RECENT_OPTS` → `range=month` | 近月序列，取 latest+prev 算涨跌；报价取排序后首条 |
| （勿省略） | 不传 `range` | 最多 1 条，无法算涨跌、也无法画走势 |

无 API Key 或 Provider 未启用时，`withFuyaoClient` 返回 `null`，Engine 自动 failover 至 **Tushare** 等现役栈（`eastmoney` / 新浪等已自内置 Registry 移除）。

## 右侧基金详情（`FundDetailTab`）数据流

```
InstrumentRef (CN:PF)
  → research.fundDetail  → Hub fund_detail
      并行 queryInstrumentData：
        fund_snapshot / fund_holdings / fund_allocation
      快照失败 → 整页失败（UI 再回退 research.fundSnapshot）
      持仓/配置失败 → data.failed[]（如「持仓」「配置」），不拖垮整页
  → Hero：净值 / 涨跌 / 规模 / 经理；`accNav` 展示为「复权净值」
  → Tab「走势」→ 场内非 LOF：K 线；其余：FundNavChart（图例「复权净值」）
  → Tab「档案」→ snapshot.profile（含公司 enrich、经理任职、持有人结构字段）
  → Tab「业绩」→ snapshot.profile.performance / ranks / peerAvg（与 fund_returns 同源，不重复拉取）
  → Tab「持仓」→ fund_holdings + fund_allocation（资产配置）
  → Tab「持有人」→ snapshot.profile 持有人结构（无十大持有人明细）
```

**请求量（扶摇，打开一只基金）**

| 动作 | 上游调用 |
|---|---|
| 打开详情 | Hub 并行：snapshot（profile + nav + returns + holdersDetail + 可选 companies/detail）+ holdings + asset allocation。**不**并行 returns/holders/dividend/manager/drawdowns/diagnostics/financials/news/industry |
| 点走势 | 场外/LOF：`performance/nav`（`range=fyear`，可复用缓存）；场内非 LOF：K 线通道 |

**Hero / 档案字段来源**

| UI 字段 | Standard 字段 | 扶摇来源 |
|---|---|---|
| 头部净值 / 涨跌 | `unitNav`, `changePct`, `navDate` | `performance/nav` 最近两日 |
| **复权净值**（Hero / 图例） | `accNav` | `performance/nav` **`adj_nav`**（字段名历史兼容，**不是**累计净值） |
| 场内交易所价 / 折溢价 | `exchangePrice`, `premiumPct` | `fundMarketSnapshot` |
| 基金类型 | `fundType` | `profile/detail` |
| 基金经理 / 公司 | `manager`, `company`, `managerId`, `companyId` | `profile/detail` |
| 公司类型 / 旗下基金数 / 规模 / 成立日 | `companyType`, `companyFundCount`, `companyScale`, `companyEstablishDate` | `companies/detail` |
| 经理任职 | `managerStartDate`, `managerOfficeDays`, `managerTenureReturn` | `manager_info[0]` |
| 规模 / 份额 | `scale`（亿）, `totalShares` | `fund_scale` / `total_shares` |
| 近一年收益 | `return1y` | `returns.return_year` |

### 字段映射要点（官方 SDK → Opptrix，§12）

| 能力 | 官方字段（优先） | 兼容 fallback |
|---|---|---|
| 同类均 | `peer_average_week`…`peer_average_now` | `avg_return_*` / `similar_avg_*` |
| 排名分母 | `rank_total_week`…`rank_total_now` | `count_*` |
| 十大持有人占比 | `hold_rate_pct` | `hold_ratio` / `ratio` |
| 管理人持有占比 | `mgmt_staff_hold_rate` | → `mgmtStaffHoldRatio` |
| 分红日 | `ex_dividend_date_ms` → `payment_date_ms` → `registration_date_ms` | `ex_date_ms` 等旧别名 |
| 登记日 | `registration_date_ms` | `record_date_ms` |
| 每十份派现 | `per_ten_cash_before_tax`（优先）/ `per_ten_cash_after_tax` | `unit_dividend` |
| 分红进度 | `progress` | `bonus_type` |
| 资讯日期 | `publish_time_ms` | `publish_date_ms` 等 |
| 回撤 | `week` / `month` / `year` / `now` … | `drawdown_*` / `max_drawdown_*` |
| 净值展示 | `adj_nav` → Standard `accNav` | UI 文案：**复权净值** |

## 实现文件索引

| 路径 | 职责 |
|---|---|
| `providers/tonghuashun/api/client.ts` | 全量基金 REST 方法（financials 走 SDK；`get`/`rawGet` 仍供 dump 旁路） |
| `providers/tonghuashun/api/fund-symbols.ts` | `resolveFuyaoFundRoute` |
| `providers/tonghuashun/normalize/fund.ts` | 标准化 `StandardFund*` 行 |
| `providers/tonghuashun/markets/cn/fund.ts` | `mixTonghuashunFund` |
| `providers/tonghuashun/manifest.ts` | `TONGHUASHUN_CN_FUND_CAPABILITIES` 绑定 |
| `client-ui/src/market/FundDetailTab.tsx` | 右侧详情 UI |
| `client-ui/src/market/fundDetailPanels.tsx` | 档案 / 业绩 / 持仓 / 持有人面板 |
| `packages/research-hub/src/fund-detail.ts` | Hub `fund_detail` 聚合 `mergeFundDetailParts` |
| `client-ui/src/market/FundNavChart.tsx` | 历史净值折线图（图例「复权净值」） |

## 验证

```bash
npm run build -w @opptrix/a-stock-layer
npm run build -w @opptrix/research-hub
npm run check:ui
node --import tsx/esm --test tests/fuyao-fund-profile.test.mjs tests/fund-detail-merge.test.mjs tests/instrument-fund-routing.test.mjs
```

配置同花顺 API Key 并启用 Provider 后，打开 CN:PF 基金详情，`source` 应为 `tonghuashun`。

## 已知限制

- **`accNav` = `adj_nav`（复权净值）**，UI 已标「复权净值」；勿当作累计净值或伪造累计净值。
- **基金 financials** 已由 `@opptrix/fuyao` ≥1.0.2 暴露；详情页不并行拉取，Agent 可经独立 `fund_financials` Capability 查询。
- `fundList` 未实现；名录/搜索走扶摇 + Tickflow + 本地；列表补路可走 Tushare 等现役栈。
- `fundManager` 依赖 profile 的 `manager_id` 或 `manager_info[0].manager_id`；缺失时返回 null（不硬失败），UI 可回退档案姓名。
- 诊断接口官方样例中 `dimensions` / `resilience` 可为空 object；归一化后无可用标量则整行返回 null，避免 UI 出现 `[object Object]`。
