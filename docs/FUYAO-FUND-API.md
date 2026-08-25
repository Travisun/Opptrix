# 扶摇（Fuyao）基金 API — Opptrix 对接说明

> 官方文档：<https://fuyao.aicubes.cn/docs/api-reference/fund-profile/>
> Provider ID：`tonghuashun`（同花顺金融数据，Base URL `https://fuyao.aicubes.cn`）

## 认证与通用约定

| 项 | 说明 |
|---|---|
| Base URL | `https://fuyao.aicubes.cn` |
| 请求头 | `X-api-key: <用户配置的 API Key>`（存于 Provider 设置，非代码硬编码） |
| 响应信封 | `{ code, message, request_id, data }`；`code=0` 为成功 |
| 时间戳 | 毫秒 Unix，时区 `Asia/Shanghai` |
| `fund_type` | `otc`（场外开放式）、`exchange`（场内 ETF/LOF）、`reits`（公募 REITs） |
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
| 经理详情 | `GET /api/fund/managers/detail` | `fundManagersDetail` | ✅ Client |
| 经理业绩 | `GET /api/fund/managers/performance` | `fundManagersPerformance` | ✅ Client |
| 经理经历 | `GET /api/fund/managers/experience` | `fundManagersExperience` | ✅ Client |
| 投资风格 | `GET /api/fund/managers/investment-style` | `fundManagersInvestmentStyle` | ✅ Client |
| 基金公司 | `GET /api/fund/companies/detail` | `fundCompaniesDetail` | ✅ Client |
| 基金诊断 | `GET /api/fund/diagnostics/detail` | `fundDiagnosticsDetail` | ✅ Client |
| 财务指标 | `GET /api/fund/financials/indicators` | `fundFinancialsIndicators` | ✅ Client |
| 利润表 | `GET /api/fund/financials/income-statements` | `fundFinancialsIncomeStatements` | ✅ Client |
| 资产负债表 | `GET /api/fund/financials/balance-sheets` | `fundFinancialsBalanceSheets` | ✅ Client |
| 场内快照 | `GET /api/fund/market/snapshot` | `fundMarketSnapshot` | ✅ ETF 路径；**场内公募基金 `fundQuote` 合并交易所价** |
| 场内历史 | `GET /api/fund/market/historical` | `fundMarketHistorical` | ✅ ETF K 线 |
| 资讯列表 | `GET /api/fund/news/article-list` | `fundNewsArticleList` | ✅ Client |
| 募集公告 | `GET /api/fund/offerings/list` | `fundOfferingsList` | ✅ Client |

## Opptrix Capability 映射

| Capability | Driver 方法 | 绑定 | 默认优先级 |
|---|---|---|---|
| `FUND_PROFILE` | `fundProfile` | CN / FUND | 120（同花顺全局） |
| `FUND_HOLDINGS` | `fundHoldings` | CN / FUND | 120 |
| `FUND_QUOTE` | `fundQuote` | CN / FUND | 120；**场内**并行 `fundMarketSnapshot` 合并交易所价；失败时回退 A 股 `realtime` |
| `FUND_NAV` | `fundNav` | CN / FUND | 120（`FundDetailTab` 走势） |
| `FUND_RETURNS` | `fundReturns` | CN / FUND | 120（业绩 Tab） |
| `FUND_DRAWDOWN` | `fundDrawdown` | CN / FUND | 120（业绩 Tab 回撤） |
| `FUND_ALLOCATION` | `fundAllocation` | CN / FUND | 120（持仓 Tab 资产/行业配置） |
| `FUND_HOLDERS` | `fundHolders` | CN / FUND | 120（持有人 Tab；无数据不显示） |
| `FUND_DIVIDEND` | `fundDividend` | CN / FUND | 120（分红 Tab；无数据不显示） |
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
        fund_snapshot / fund_holdings / fund_returns / fund_drawdown
        fund_allocation / fund_holders / fund_dividend
      快照失败 → 整页失败（UI 再回退 research.fundSnapshot）
      其余失败 → data.failed[]（如「持仓」「业绩」），不拖垮整页
  → Hero：净值 / 涨跌 / 规模 / 经理（来自 snapshot.profile + quote）
  → Tab「走势」→ 场内非 LOF：K 线；其余：FundNavChart（fund_nav，range=fyear）
  → Tab「档案」→ snapshot.profile（资料 / 经理 / 成立日 / 基准 / 费率）
  → Tab「业绩」→ fund_returns + fund_drawdown（可回退 profile.performance）
  → Tab「持仓」→ fund_holdings + fund_allocation
  → Tab「持有人」→ fund_holders（有结构或十大持有人时才显示）
  → Tab「分红」→ fund_dividend（有记录才显示）
```

**请求量（扶摇，打开一只基金）**

| 动作 | 上游调用 |
|---|---|
| 打开详情 | Hub 并行：profile/nav/returns/holders + holdings + drawdowns + asset/industry allocation + holders top + dividends（单路失败不阻塞） |
| 点走势 | 场外/LOF：`performance/nav`（`range=fyear`，可复用缓存）；场内非 LOF：K 线通道 |

**Hero / 档案字段来源**

| UI 字段 | Standard 字段 | 扶摇来源 |
|---|---|---|
| 头部净值 / 涨跌 | `unitNav`, `changePct`, `navDate` | `performance/nav` 最近两日 |
| 场内交易所价 / 折溢价 | `exchangePrice`, `premiumPct` | `fundMarketSnapshot`（`fundQuote` / `fundSnapshot` 合并） |
| 基金类型 | `fundType` | `profile/detail` |
| 基金经理 / 公司 | `manager`, `company` | `profile/detail` |
| 规模 | `scale`（亿） | `fund_scale` ÷ 1e8 |
| 成立日期 | `establishDate` | `estab_date` |
| 近一年收益 | `return1y` | `returns.return_year` |
| 托管人 / 费率 | `custodian`, `expenseRatio` | `profile` + `rate_info` |
| 业绩基准 | `benchmark` | `profile` |
| 累计净值 | `accNav` | `performance/nav` `adj_nav` |

## 实现文件索引

| 路径 | 职责 |
|---|---|
| `providers/tonghuashun/api/client.ts` | 全量基金 REST 方法 |
| `providers/tonghuashun/api/fund-symbols.ts` | `resolveFuyaoFundRoute` |
| `providers/tonghuashun/normalize/fund.ts` | 标准化 `StandardFund*` 行 |
| `providers/tonghuashun/markets/cn/fund.ts` | `mixTonghuashunFund` |
| `providers/tonghuashun/manifest.ts` | `TONGHUASHUN_CN_FUND_CAPABILITIES` 绑定 |
| `client-ui/src/market/FundDetailTab.tsx` | 右侧详情 UI（走势 / 档案 / 业绩 / 持仓 / 持有人 / 分红） |
| `client-ui/src/market/fundDetailPanels.tsx` | 档案 / 业绩 / 持仓 / 持有人 / 分红面板 |
| `packages/research-hub/src/fund-detail.ts` | Hub `fund_detail` 聚合 `mergeFundDetailParts` |
| `client-ui/src/market/FundNavChart.tsx` | 历史净值折线图 |

## 验证

```bash
npm run build:packages
npm run check:ui
node --import tsx/esm --test tests/fuyao-fund-profile.test.mjs tests/fund-detail-merge.test.mjs tests/instrument-fund-routing.test.mjs
```

配置同花顺 API Key 并启用 Provider 后，打开 CN:PF 基金详情，`source` 应为 `tonghuashun`。

## 已知限制

- `adj_nav` 为复权净值，**不等同**累计净值；UI「累计净值」在扶摇路径下展示复权净值，与天天基金口径可能略有差异。
- `fundList` 未实现；名录/搜索走扶摇 + Tickflow + 本地；列表补路可走 Tushare 等现役栈。
- 扩展接口（诊断、财务、经理详情等）已挂 Client，待 Hub Feature / Agent Tool 按需接入。
