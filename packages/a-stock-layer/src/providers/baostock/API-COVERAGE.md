# Baostock Provider — API 覆盖说明

> 面向 Opptrix 开发者。协议与字段以 Python `baostock` 0.9.x 为准；Opptrix 侧通过 Node TCP 客户端复刻同一套 query 方法。

## 概述

| 项 | 说明 |
|---|---|
| 数据源 | [证券宝 BaoStock](http://www.baostock.com) — **免费、开源、无需注册** |
| 传输 | **非 REST**；TCP Socket `public-api.baostock.com:10030` |
| 协议 | 报文分隔 `\x01`；头 21 字节；响应 type `96` 为 zlib 压缩 |
| 会话 | `login()` → 各 `query_*()` → `logout()`；匿名账号即可 |
| Provider ID | `baostock`；`defaultPriority: 105`（免费 CN 第 2 顺位；特色板块/宏观数据已接入 provider 层） |
| 配置 | 仅需 `enabled`，**无 API Key** |

**实现路径（已实现）：**

```
api/client.ts          → BaostockClient（TCP + 分页）
markets/cn/handler.ts  → BaostockCnHandler
normalize/*            → 行数据 → Opptrix schema
driver.ts + manifest.ts
```

---

## API 清单

| Python 方法 | Opptrix Capability | Handler 方法 | 状态 / 备注 |
|---|---|---|---|
| `login()` / `logout()` | — | （`BaostockClient` 会话） | 每次请求前登录；非 Capability |
| `query_history_k_data_plus()` | `STOCK_KLINE` | `kline()` | 日/周/月 + 5/15/30/60 分钟；`adjustflag` 2=前复权；分页 500 条 |
| `query_history_k_data_plus()` | `INDEX_KLINE` | `indexKline()` | 指数仅日/周/月；**无分钟线** |
| `query_history_k_data_plus()` | `STOCK_REALTIME` | `realtime()` / `batchRealtime()` | **非实时**：取最新日 K 模拟快照 |
| `query_history_k_data_plus()` | `INDEX_REALTIME` | `indexRealtime()` | 同上，指数日 K 末 bar |
| `query_history_k_data_plus()` | `INTRADAY_TICK` | `fetchIntradaySessions()` / `minuteTrendKline()` | 由分钟 K 聚合当日分时；非逐笔 |
| `query_all_stock()` | `STOCK_LIST` | `stockList()` | 含 A 股、指数等；与日 K 同步更新 |
| `query_stock_basic()` + `query_stock_industry()` | `STOCK_PROFILE` | `profile()` | 基本资料 + 行业分类 |
| `query_trade_dates()` | `TRADE_CALENDAR` | `tradeCalendar()` | 上交所日历，1990 年起 |
| `query_dividend_data()` | `DIVIDEND` | `dividend()` | 除权除息，1990 年起 |
| `query_adjust_factor()` | — | （内部） | 复权因子；供 normalize，不单独暴露 |
| `query_profit_data()` | `FINANCIAL_SUMMARY` / `INCOME_STMT` | `financials()` | 季频盈利能力 |
| `query_operation_data()` | `FINANCIAL_SUMMARY` | `financials()` | 季频营运能力 |
| `query_growth_data()` | `FINANCIAL_SUMMARY` | `financials()` | 季频成长能力 |
| `query_balance_data()` | `BALANCE_SHEET` | `balanceSheet()` | 季频偿债/资产负债 |
| `query_cash_flow_data()` | `CASH_FLOW` | `cashFlow()` | 季频现金流量 |
| `query_dupont_data()` | `FINANCIAL_SUMMARY` | `financials()` | 杜邦指标并入摘要 |
| `query_performance_express_report()` | `PERF_FORECAST` | `perfForecast()` | 与预告合并返回，`kind=express` |
| `query_forecast_report()` | `PERF_FORECAST` | `perfForecast()` | 与快报合并返回，`kind=forecast` |
| `query_stock_industry()` | `STOCK_PROFILE` | `profile()` | 每周一更新 |
| `query_sz50_stocks()` | `INDEX_CONST` | `indexConstituents()` | 上证 50；按指数代码路由 |
| `query_hs300_stocks()` | `INDEX_CONST` | `indexConstituents()` | 沪深 300 |
| `query_zz500_stocks()` | `INDEX_CONST` | `indexConstituents()` | 中证 500 |
| `query_deposit_rate_data()` | `MACRO_INDICATOR` | `macroIndicator()` | 存款利率 |
| `query_loan_rate_data()` | `MACRO_INDICATOR` | `macroIndicator()` | 贷款利率 |
| `query_required_reserve_ratio_data()` | `MACRO_INDICATOR` | `macroIndicator()` | 存款准备金率 |
| `query_money_supply_data_month()` | `MACRO_INDICATOR` | `macroIndicator()` | 货币供应量（月） |
| `query_money_supply_data_year()` | `MACRO_INDICATOR` | `macroIndicator()` | 货币供应量（年） |
| `query_shibor_data()` | `MACRO_INDICATOR` | `macroIndicator()` | `indicatorKey=shibor` |
| `query_cpi_data()` | `MACRO_INDICATOR` | `macroIndicator()` / `bsMacroCpi()` | CPI |
| `query_ppi_data()` | `MACRO_INDICATOR` | `macroIndicator()` / `bsMacroPpi()` | PPI |
| `query_pmi_data()` | `MACRO_INDICATOR` | `macroIndicator()` / `bsMacroPmi()` | PMI |
| `query_stock_concept()` | — | `bsStockConcept()` | 个股概念分类 |
| `query_stock_area()` | — | `bsStockArea()` | 个股地域分类 |
| `query_adjust_factor()` | — | `bsAdjustFactor()` | 复权因子 |
| `query_gem_stocks()` | — | `bsGemStocks()` | 创业板成分 |
| `query_starst_stocks()` | — | `bsStarStStocks()` | 科创板 ST |
| `query_st_stocks()` | — | `bsStStocks()` | ST 股票 |
| `query_ame_stocks()` | — | `bsAmeStocks()` | 中小板 |
| `query_suspended_stocks()` | — | `bsSuspendedStocks()` | 停牌 |
| `query_terminated_stocks()` | — | `bsTerminatedStocks()` | 终止上市 |
| `query_stocks_in_risk()` | — | `bsStocksInRisk()` | 风险警示 |
| `query_shhk_stocks()` | — | `bsShhkStocks()` | 沪港通标的 |
| `query_szhk_stocks()` | — | `bsSzhkStocks()` | 深港通标的 |

### Python 有、Opptrix 暂不映射

| Python 方法 | 说明 |
|---|---|
| （无） | 上述特色 API 均已接入 provider 层；上层 UI 待完善 |

---

## 已知限制

| 限制 | 详情 |
|---|---|
| **无真实时行情** | 无独立 quote API；`STOCK_REALTIME` / `INDEX_REALTIME` 由**最新日 K** 推导，盘中延迟 |
| **分钟线窗口** | 5/15/30/60 分钟约 **近 5 年**（官方：2020-01-03 起）；更久历史仅日/周/月 |
| **指数无分钟** | `query_history_k_data_plus` 对指数不支持 `frequency=5/15/30/60` |
| **ETF 数据较新** | 日/周/月及分钟 K：**2026-01-05 起**；此前 ETF 需 Tushare / 东财等 |
| **周线/月线** | 仅每周/每月**最后一个交易日**可拉取 |
| **北交所** | 覆盖以 Baostock 服务端为准；Opptrix 未单独保证 920 代码 |
| **财务滞后** | 季报到库约晚于披露；见下方更新时间表 |
| **错误 10004020** | 多为**参数不匹配**：K 线 `fields` 缺 `date`/`code`、字段拼写错误、日期非 `YYYY-MM-DD`；Opptrix 已自动补全 K 线 fields、修正响应 fields 解析 |
| **并发 / 吞吐** | 单 TCP 连接、分页拉取；不适合高频轮询 |

---

## 与 Tushare / TickFlow 选型

| 场景 | 推荐 | 原因 |
|---|---|---|
| 长历史日 K 回测（1990 起） | **Baostock** | 免费、无需 Token、日线跨度长 |
| 分钟 K（近 5 年） | **Baostock** | 免费；TickFlow 需 Key 且有配额 |
| **盘中实时价、批量快照** | **TickFlow** / 新浪 / 腾讯 | Baostock 无 live quote |
| **当日分时 / 逐笔级** | **TickFlow** | Baostock 仅历史分钟 K 聚合 |
| 资金流、龙虎榜、股东、新闻 | **Tushare** / 东财 | Baostock 不提供 |
| 全市场 bulk、2000 积分接口 | **Tushare** | 字段更全；需 Token |
| 港股 / 美股 | **TickFlow** / Yahoo | Baostock 仅 A 股相关 |
| ETF（2026 年前历史） | **Tushare** | Baostock ETF 自 2026-01-05 |
| 无 Token 的财务 / 除权 / 指数成分 | **Baostock** | 季频财务 + 指数成分免费 |
| 宏观利率 / 货币供应 | **Baostock** | 内置宏观 query_* |

**优先级链（默认）：** **Zzshare (110)** → **Baostock (105)** → Tushare (90) → TickFlow (80) → 其他。

---

## 数据更新时间表（Baostock 官方）

| 数据类型 | 更新时间 |
|---|---|
| 日 K 线 | 当前交易日 **17:30** |
| 复权因子 | 当前交易日 **18:00** |
| 分钟 K 线 | 当前交易日 **20:00**（部分文档写 20:30） |
| 其它财务报告 | 次自然日 **01:30**（前交易日） |
| 周 K 线 | 周六 **17:30** |
| 月 K 线 | 每月 1 日 **17:30**（上月） |
| 上证 50 / 沪深 300 / 中证 500 成分 | **每周一** 下午 |
| 行业分类 `query_stock_industry` | **每周一** |

**建议：** 交易日 **17:30 后** 再拉当日日 K / 证券列表；分钟线 **20:00 后**；财务数据 **次日凌晨 1:30 后**。

---

## 数据时间范围（官方）

| 类别 | 范围 |
|---|---|
| A 股日/周/月 K | 1990-12-19 — 今 |
| A 股分钟 K | 近 5 年（约 2020-01-03 — 今） |
| 指数日/周/月 K | 2006-01-01 — 今 |
| ETF K 线 | 2026-01-05 — 今 |
| 季频财务 / 杜邦等 | 2007 — 今 |
| 业绩预告 / 快报 | 2003 / 2006 — 今 |
| 交易日历 | 1990 — 今 |
