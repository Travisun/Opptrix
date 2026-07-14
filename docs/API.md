# API 参考

浏览器访问 **http://127.0.0.1:5173**，API 路径 `/api/*` 由 Vite 代理到后台（默认 `127.0.0.1:8711`）。直接调 API 示例：`curl http://127.0.0.1:8711/api/health`

## 通用响应

### `GET /api/health`

```json
{
  "status": "ok",
  "version": "0.6.0",
  "runtime": "node",
  "llm_configured": true,
  "model": "deepseek-chat",
  "scorecard": "综合评估",
  "tools": 19,
  "factors": 40
}
```

### `POST /api/research`

统一 feature 调度。

**请求**

```json
{
  "feature": "stock_diagnosis",
  "params": { "code": "600519", "scorecard": "综合评估" }
}
```

**响应**

```json
{
  "success": true,
  "feature": "stock_diagnosis",
  "data": { },
  "message": "贵州茅台(600519) 综合评分 82.5",
  "elapsed": 1234
}
```

## Hub Features

| feature | params | 说明 |
|---------|--------|------|
| `stock_diagnosis` | `code`, `scorecard?` | 个股因子诊断 |
| `institution_rating` | `code`, `groups?` | 机构评级 JSON |
| `institution_report` | `code`, `groups?` | 机构评级文本报告 |
| `screening` | — | 已停用（本地因子选股已移除） |
| `strategy_signal` | `code` | 单股策略信号 |
| `strategy_verify` | `code`, `strategy`, `days?` | 策略历史验证 |
| `strategy_verify_report` | 同 verify | 格式化验证报告 |
| `strategy_report` | `code` | 策略综合分析报告 |
| `portfolio_analysis` | `holdings`, `scorecard?` | 组合因子分析 |
| `portfolio_trades` | `code?` | 交易记录列表 |
| `portfolio_summary` | — | 账本汇总 |
| `industry_mining` | `industry` | 产业透视文本 |
| `industry_mermaid` | `industry` | 产业链 Mermaid |
| `market_report` | `type?` (`closing` / `morning`) | 市场报告 |
| `search_stocks` | `keyword` | 股票搜索 |
| `backtest` | 见 hub 实现 | 因子回测 |
| `latest_evaluation` | `code`, `scorecard?`, `force?` | 最近评估；默认 `G=B+M`，返回 `gbm` B/M 子分 |
| `market_regime` | `profile_scope?` (`cn` / `us`) | 市况快照（发现页横幅）；`us` 基于 SPY 动量 stub |
| `instrument_profile` | InstrumentRef | 公司/标的概况事实表 |
| `instrument_financials` | InstrumentRef + `report_type?` / `report_date?` | 财务摘要多期 |
| `instrument_balance_sheet` | InstrumentRef + `report_date?` | 资产负债表多期 |
| `instrument_cash_flow` | InstrumentRef + `report_date?` | 现金流量表多期 |
| `instrument_income_statement` | InstrumentRef + `report_date?` | 利润表多期 |
| `instrument_financial_indicators` | InstrumentRef + `report` | 财务指标树（同花顺） |
| `instrument_shareholders` | InstrumentRef + `report_date?` | 股东结构 |
| `instrument_dividend` | InstrumentRef + `page?` / `page_size?` | 分红历史 |
| `instrument_money_flow` | InstrumentRef | 个股资金流向 |
| `instrument_notices` | InstrumentRef + `page?` / `page_size?` | 标的公告列表 |
| `sector_list` | `market?` / `kind?` / `plate_type?` | 板块或行业目录 |
| `sector_constituents` | `board_key` 或 `industry_code` + 分页 | 板块/行业成分 |
| `etf_profile` | InstrumentRef / code | ETF 档案 |
| `market_session` | `market?` | 轻量交易时段状态 |
| `cn_market_special` | `kind` + 可选 code/date/tag… | A 股专题（连板天梯/飙升/热股/异动/同花顺概念目录；成分/财务指标用专用 feature） |
| `trade_calendar` | `year?` | A 股交易日历 |
| `macro_series` | `kind` / `limit?` | 中国宏观序列（CPI/PPI/PMI/GDP/LPR/SHIBOR；Baostock→AkShare） |
| `index_constituents` | `index_code` / `code` | 指数/同花顺板块成分 |
| `dragon_tiger` | `date?` | 龙虎榜 |
| `limit_updown` | `date?` | 涨跌停池 |
| `market_sentiment` | `code?` | 市场情绪/个股热度 |
| `writer_fetch` | `code`, `type?` | 写作数据采集 |
| `writer_types` | — | 文章类型 |
| `writer_prompt` | `code`, `type?`, `persona?` | 生成 Prompt |
| `writer_personas` | — | 写作人格列表 |
| `writer_format` | `markdown`, `theme?` | HTML 排版 |
| `writer_publish` | `markdown`, … | 推送微信草稿 |
| `writer_config` | — | 读取 Writer 配置 |
| `writer_config_save` | 配置字段 | 保存 Writer 配置 |
| `writer_history` | `limit?` | 写作历史 |
| `writer_themes` | — | 排版主题 |

## REST 快捷端点

与 Hub 等价或薄封装的 HTTP 路由：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 公开配置（不含明文 API Key） |
| POST | `/api/config` | 保存 LLM / 默认评分卡 |
| GET | `/api/templates` | 评分卡模板列表 |
| POST | `/api/chat` | `{ "message": "..." }` Agent 对话 |
| POST | `/api/evaluate` | `{ "code", "scorecard?" }` |
| POST | `/api/screen` | 410：本地筛选已移除 |
| POST | `/api/portfolio` | 组合分析 |
| POST | `/api/search` | `{ "keyword" }` |
| POST | `/api/signal` | `{ "code" }` |
| POST | `/api/strategy/report` | `{ "code" }` |
| POST | `/api/industry/mermaid` | `{ "industry" }` |
| GET | `/api/portfolio/trades` | `?code=` 可选 |
| GET | `/api/portfolio/summary` | 账本汇总 |
| POST | `/api/portfolio/trade` | `{ code, shares, price, side?, date? }` |

### Instrument API（多市场统一）

按 `InstrumentRef` 消费，与 Hub `instrument_*` feature 等价。请求体可传嵌套 `instrument: { market, assetClass, symbol }`，或扁平 `market` + `symbol`（及可选 `assetClass`）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/instruments/search` | `?q=` / `?keyword=`、`limit`、`markets`（逗号分隔） |
| GET | `/api/instruments/summary` | 本地 instruments 各市场计数摘要 |
| POST | `/api/instruments/snapshot` | 单标的快照 |
| POST | `/api/instruments/quotes` | `{ instruments: InstrumentRef[] }` 批量报价 |
| POST | `/api/instruments/chart` | `{ instrument, period?, count? }` 日/周/月 K |
| POST | `/api/instruments/capabilities` | 返回 UI 能力矩阵（`detailPanelKind` 等） |

示例：

```json
POST /api/instruments/snapshot
{ "market": "JP", "assetClass": "EQUITY", "symbol": "7203" }
```

```json
POST /api/research
{ "feature": "instrument_quotes", "params": { "instruments": [{ "market": "US", "assetClass": "EQUITY", "symbol": "AAPL" }] } }
```

基本面事实表（`queryInstrumentData`，与 MCP `get_instrument_*` 对应）：

| feature | params | 说明 |
|---------|--------|------|
| `instrument_profile` | InstrumentRef | 公司/标的概况 |
| `instrument_financials` | InstrumentRef + 可选 `report_type` / `report_date` | 财务摘要多期 |
| `instrument_balance_sheet` | InstrumentRef + 可选 `report_date` | 资产负债表多期 |
| `instrument_cash_flow` | InstrumentRef + 可选 `report_date` | 现金流量表多期 |
| `instrument_income_statement` | InstrumentRef + 可选 `report_date` | 利润表多期 |
| `instrument_financial_indicators` | InstrumentRef + `report` | 财务指标树（同花顺） |
| `instrument_shareholders` | InstrumentRef + 可选 `report_date` | 股东结构 |
| `instrument_dividend` | InstrumentRef + 可选 `page` / `page_size` | 分红历史 |
| `instrument_money_flow` | InstrumentRef | 个股资金流向（主 CN） |
| `instrument_notices` | InstrumentRef + 可选 `page` / `page_size` | 标的公告列表（正文用 `notice_content`） |
| `cn_market_special` | `kind` + 按 kind 的 code/date/tag 等 | A 股专题（连板/热股/异动/同花顺概念目录；经 tonghuashun custom。指数成分→`index_constituents`，财务指标→`instrument_financial_indicators`） |
| `trade_calendar` | `year?` | A 股交易日历 |
| `macro_series` | `kind` + 可选 `limit` | 中国宏观事实序列（经 `MACRO_INDICATOR`；AkShare 东财 CPI 等为回退源） |
| `index_constituents` | `index_code` | 指数成分（标准 INDEX_CONST + 同花顺回退） |
| `dragon_tiger` | `date?` | 龙虎榜 |
| `limit_updown` | `date?` | 涨跌停池 |
| `market_sentiment` | `code?` | 情绪/热度 |
| `sector_list` | `market?` / `kind?` / `plate_type?` | 板块或行业目录 |
| `sector_constituents` | `board_key` 或 `industry_code` + 分页 | 板块/行业成分股 |
| `etf_profile` | InstrumentRef / code | ETF 档案 |
| `market_session` | `market?` | 轻量交易时段（非完整日历） |

服务端通过 `@opptrix/news-feed` 拉取并缓存订阅源；浏览器不直连第三方 feed。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/news/settings` | `{ settings: { refresh_interval_min, retention_years, max_articles } }` |
| PUT | `/api/news/settings` | 保存刷新间隔、保留年限（默认 3 年）、文章数量上限（null=不限） |
| GET | `/api/news/subscriptions` | 订阅列表 |
| PUT | `/api/news/subscriptions` | `{ subscriptions: FeedSubscription[] }` 全量保存 |
| DELETE | `/api/news/subscriptions/:id` | 删除单条 |
| POST | `/api/news/subscriptions/item` | `{ url, title?, enabled? }` 验证并添加 |
| POST | `/api/news/validate` | `{ url, title? }` 添加前探测 |
| GET | `/api/news/feed` | `?limit=20&cursor=&subscription_id=&group_id=` 分页（默认 20 篇） |
| GET | `/api/news/feed/grouped` | 按自定义分组 / 来源聚合的本地文章 |
| GET | `/api/news/groups` | 订阅分组列表 |
| POST | `/api/news/groups` | `{ title }` 新建分组 |
| PUT | `/api/news/groups/:id` | 重命名 / 排序 |
| DELETE | `/api/news/groups/:id` | 删除分组（订阅移至未分组） |
| PUT | `/api/news/subscriptions/:id/group` | `{ group_id }` 移动订阅 |
| GET | `/api/news/articles/:id` | 单篇文章 |
| POST | `/api/news/refresh` | 强制刷新全部 enabled 源 |

订阅地址须为完整 `http(s)://` 链接。文章持久化在本地 SQLite，默认保留 **3 年内**按 `pub_date` 排序的文章；可在设置中调整保留年限与数量上限（不限上限时仅按年限清理）。写入超出策略时自动删除最旧文章。

### Writer 端点

| 方法 | 路径 |
|------|------|
| POST | `/api/writer/fetch` |
| GET | `/api/writer/types` |
| GET | `/api/writer/personas` |
| POST | `/api/writer/prompt` |
| POST | `/api/writer/format` |
| POST | `/api/writer/publish` |
| GET/POST | `/api/writer/config` |
| GET | `/api/writer/history` |
| GET | `/api/writer/themes` |

## Agent

`POST /api/chat` 使用 `@opptrix/agent` 的 `AgentEngine`，内置 tools 调用同一 `ResearchHub`。

常用 slash 命令（在 message 中）：`/diagnose`, `/screen`, `/institution`, `/signal`, `/portfolio`, `/writer` 等，详见 `packages/agent/src/engine.ts`。

## 错误

- HTTP 400：`{ "error": "..." }` 参数缺失或业务失败
- HTTP 404：未知 `/api/*` 路径
- 非 `/api` 路径：SPA fallback 返回 `index.html`
