# Zzshare Provider — API 覆盖说明

> 面向 Opptrix 开发者。协议与字段以 Python `zzshare` SDK（`client.py` / `core.py`）为准；Opptrix 侧通过 REST 客户端 + normalize 层接入。

## 概述

| 项 | 说明 |
|---|---|
| 数据源 | [自在量化 Zzshare](https://quant.zizizaizai.com) — 大部分接口可匿名，Token 免费获取 |
| 传输 | HTTPS REST，`https://api.zizizaizai.com`（固定，不可覆盖） |
| 鉴权 | 请求头 `sdk-key: {token}`；未配置时使用 `anonymous` |
| 环境变量 | `ZZSHARE_TOKEN`、`OPPTRIX_ZZSHARE_API_KEY` |
| Provider ID | `zzshare`；`defaultPriority: 110`（免费 CN 第 1 顺位） |
| 配置 | `enabled` + 可选 `apiKey`（`required: false`，留空即匿名） |

**鉴权层级说明：**

| 层级 | 含义 |
|---|---|
| **open** | 匿名 `sdk-key: anonymous` 可调用（有频率限制） |
| **token** | 需有效 Token；部分接口匿名会 401 或无法返回数据 |

**实现路径：**

```
api/client.ts          → ZzshareClient（REST + 429 重试 + 快捷方法）
markets/cn/handler.ts → 行情 / 列表 / 日历 / 分时
markets/cn/research.ts  → 龙虎榜 / 涨跌停 / 情绪 / 板块等
normalize/*            → 行数据 → Opptrix schema
driver.ts + manifest.ts
```

---

## 核心方法（自定义实现）

| Python 方法 | Opptrix Capability | Handler 方法 | 鉴权 | 备注 |
|---|---|---|---|---|
| `daily()` | `STOCK_KLINE` | `kline()` | open | 日/周/月；`adj`→`candle_mode`；分页 `offset`/`limit` |
| `daily()` | `INDEX_KLINE` | `indexKline()` | open | 指数/板块码 `88xxxx`；周月线客户端聚合 |
| `daily()` | `STOCK_REALTIME` | `realtime()` / `batchRealtime()` | open | **无 Token 时**取最新日 K 模拟快照 |
| `daily()` | `INDEX_REALTIME` | `indexRealtime()` | open | 同上，指数日 K 末 bar |
| `stk_mins()` | `STOCK_KLINE` | `kline()`（分钟周期） | open | `1min`/`5min`/…/`60min`；匿名约 30 次/分钟 |
| `stk_mins()` | `INTRADAY_TICK` | `fetchIntradaySessions()` / `minuteTrendKline()` | open | 分钟 K 聚合当日分时 |
| `rt_k()` | `STOCK_REALTIME` | `realtime()` / `batchRealtime()` | **token** | 盘中实时快照；约 20 次/分钟 |
| `rt_k()` | `INDEX_REALTIME` | `indexRealtime()` | **token** | 指数/个股实时 |
| `stock_basic()` | `STOCK_LIST` | `stockList()` | open | 多交易所聚合 `v3/open/stocks/list` |
| `stock_info()` + `stock_basic()` | `STOCK_PROFILE` | `profile()` | open | 扩展资料 + 基础字段 |
| `trade_days()` | `TRADE_CALENDAR` | `tradeCalendar()` | open | A 股交易日历 |
| `plate_kline()` | `INDEX_KLINE` | `indexKline()` | open | 板块日线（如全 A `883957`） |
| `topic_kline()` | `INDEX_KLINE` | `indexKline()` | open | 题材合成指数 K 线 |
| `plates_rank()` | `SECTOR_LIST` | `sectorList()` / `zzPlatesRank()` | open | 板块热度排名 |
| `plates_rank_days()` | — | `zzPlatesRank()`（可扩展） | open | 区间板块排名 |
| `plates_rank_days_new()` | — | （客户端直调） | open | 区间排名 + 新进标记 |

---

## SHORTCUTS 快捷方法

| Python 方法 | Opptrix Capability | Handler / 扩展方法 | 鉴权 | 备注 |
|---|---|---|---|---|
| `uplimit_hot` | — | `zzUplimitHot()` | open | 涨停热点板块与连板梯队 |
| `uplimit_stocks` | `LIMIT_UPDOWN` | `limitUpdown()` | open | 与 `review_uplimit_reason_open` 合并 |
| `review_uplimit_reason_open` | `LIMIT_UPDOWN` | `limitUpdown()` | open | 当日涨停汇总与原因 |
| `review_uplimit_reason` | — | （未映射标准 Capability） | open | 分页涨停复盘 |
| `review_uplimit_hot_step` | — | `zzUplimitHot()` | open | 板块下涨停梯队 |
| `stock_uplimit_reason` | — | （未映射） | open | 单股单日涨停原因 |
| `stock_uplimit_reason_history` | — | （未映射） | open | 个股历史涨停记录 |
| `lhb_list` | `DRAGON_TIGER` | `dragonTiger()` | open | 龙虎榜每日列表 |
| `lhb_detail` | — | `zzLhbDetail()` | open | 席位买卖详情 |
| `lhb_stock_history` | — | （未映射） | open | 个股/营业部历史 |
| `lhb_trader_history` | — | （未映射） | open | 知名游资轨迹 |
| `updown_distribution` | `MARKET_BREADTH` | `marketBreadth()` | open | 涨跌家数分布 |
| `uplimit_trend` | — | （未映射） | open | 涨停家数趋势 |
| `market_sentiment` | `SENTIMENT` | `sentiment()`（全市场） | open | 综合情绪 K 线 |
| `market_hot_sentiment` | — | `zzMacroSentiment()` | open | 市场热度 K 线 |
| `market_style` | — | （未映射） | open | 市场风格择时 |
| `open_sentiment_data` | — | `zzMacroSentiment()` | open | 多维情绪聚合 |
| `sentiment_timing` | — | （未映射） | **token** | VIP 择时信号（需 sentiment_vip） |
| `sentiment_trend` | — | （未映射） | open | 单日情绪分时 |
| `sentiment_trend_range` | — | （未映射） | open | 区间情绪分时 |
| `sentiment_market_hot_day` | — | （未映射） | open | 当日市场热点 |
| `sentiment_hot_day` | — | （未映射） | open | 日度人气热点 |
| `sentiment_bull_data` | — | `zzMacroSentiment()` | open | 多空 / 牛熊情绪 |
| `stock_ths_hot` | `SENTIMENT` | `sentiment(code)` | open | 个股同花顺热度 |
| `ths_hot_top` | — | （未映射） | open | 同花顺热搜 Top N |
| `plates_list` | `SECTOR_LIST` | `sectorList()` | open | 题材/概念/行业列表 |
| `plates_trend` | — | （未映射） | open | 板块分时 |
| `plates_stocks` | — | （未映射） | open | 板块成分股 |
| `market_plate_stocks` | — | （未映射） | open | 板块内人气排名 |
| `market_plate_popular_reason` | — | （未映射） | open | 板块爆点原因 |
| `uplimit_market_value` | — | （未映射） | open | 涨停市值分布 |
| `movement_alerts` | — | `zzMovementAlerts()` | open | 异动 / 监管预警 |
| `zdjk_get` | — | （未映射） | open | 已触发监管列表 |
| `stock_moneyflow` | `STOCK_MONEY_FLOW` | `moneyFlow()` | open | 个股主力流向；字段透传，上层再规范化 |
| `market_mf` | `MARKET_MONEY_FLOW` | `marketMoneyFlow()` | open | 全市场资金流分钟概览 |
| `sentiment_market_top_n` | — | `zzSentimentMarketTopN()` | open | 市场 TopN 热点概念 |
| `ai_report_list` | — | `zzAiReports()` | open | AI 收盘/盘前报告列表 |
| `ai_report_detail` | — | （未映射） | open | AI 报告详情 |
| `topic_table_list` | — | `zzTopicTables()` | open | 题材库表格 |
| `topic_table_detail` | — | （未映射） | open | 题材库详情 |
| `topic_table_stocks` | — | （未映射） | open | 题材关联个股 |

---

## Python 有、Opptrix 暂不映射

| Python 方法 | 说明 |
|---|---|
| `query()` | 通用 REST 入口；可按需直调 `ZzshareClient.query()` |

---

## 已知限制

| 限制 | 详情 |
|---|---|
| **实时行情需 Token** | `rt_k` 匿名不可用或受限；Handler 无 Token 时 `STOCK_REALTIME` 回退最新日 K |
| **频率限制** | 匿名全局较低；`rt_k` 约 20 次/分钟；`stk_mins` 匿名约 30 次/分钟（以官方为准） |
| **429 限流** | 客户端自动退避重试；仍失败则返回错误 |
| **周/月线** | 由日 K 在客户端聚合，非服务端原生周期 |
| **ETF / 北交所** | 覆盖以 Zzshare 服务端为准；未单独保证 Opptrix ETF 路由 |
| **VIP 接口** | `sentiment_timing` 等需账号权限，非仅 Token 即可 |

---

## 与 Tushare / TickFlow / Baostock 选型

| 场景 | 推荐 | 原因 |
|---|---|---|
| 涨停复盘、龙虎榜、市场情绪 | **Zzshare** | 原生 SHORTCUTS，匿名可用 |
| 盘中实时价、批量快照 | **TickFlow** / **Zzshare（Token）** | Baostock 无 live quote |
| 长历史日 K 回测（1990 起） | **Baostock** / **Tushare** | Zzshare 约 2005 年起 |
| 财务三表、股东、新闻 | **Tushare** / 东财 | Zzshare 不提供 |
| 无 Token 的历史 K + 日历 | **Baostock** | 免费 TCP，跨度长 |
| 板块热度、题材库 | **Zzshare** | 特色数据 |

**默认优先级链（CN）：** **Zzshare (110)** → **Baostock (105)** → Tushare (90) → TickFlow (80) → 其他。

---

## 连接测试

`testZzshareConnection(token?)`：

1. 调用 `trade_days({ days: 5 })` 验证网络与匿名/open 接口；
2. 若 Token 非 `anonymous`，额外调用 `rt_k('600000.SH')` 验证实时权限。

设置页「测试连接」通过 `ProviderLoader` 注册的内置 hook 调用，支持 `apiKey` 覆盖与环境变量。
