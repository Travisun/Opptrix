# 新浪财经（sinafinance）API 覆盖

独立 Provider：`sinafinance`（优先级 56）。`webfeed` 为兼容别名（优先级 50）。

完整接口说明：`~/.cursor/api-captures/sina-finance/2026-07-07/api-spec-full.md`

标准化响应类型见：`src/providers/sinafinance/types/responses.ts`（所有记录的 `source` 均为 `sinafinance`）。

## 页面入口

| 类型 | URL |
|------|-----|
| 个股行情 | `finance.sina.com.cn/realstock/company/{symbol}/nc.shtml` |
| F10 资料 | `vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpInfo/stockid/{code}.phtml` |
| 数据中心 | `vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/` |

## Capability 绑定

| Capability | 新浪来源 |
|------------|----------|
| `STOCK_REALTIME` / `INDEX_REALTIME` | `hq.sinajs.cn` |
| `STOCK_KLINE` / `INDEX_KLINE` | `CN_MarketData.getKLineData` |
| `STOCK_LIST` / `MARKET_BREADTH` | `Market_Center.getHQNodeData` |
| `GLOBAL_INDEX` | `hq.sinajs.cn` 全球指数 |
| `NEWS` | `stocknews` / 公告 `CB_AllService` |
| `STOCK_PROFILE` | F10 简介 + `hq_str_{code}_i` + `jsvar.js` |
| `SHAREHOLDER` | 主要股东 + 流通股东 HTML |
| `SECTOR_LIST` | 概念 `stock:{code}` / 成分 `node:chgn_*` |
| `PEER_COMPANY` | 相关证券 |
| `DIVIDEND` | `vISSUE_ShareBonus` |
| `FINANCIAL_SUMMARY` | 财务指标 + 利润表透视 |
| `INCOME_STMT` / `BALANCE_SHEET` / `CASH_FLOW` | 三表透视 HTML |
| `DRAGON_TIGER` | `kind/lhb?tradedate=` |
| `BLOCK_TRADE` | `kind/dzjy` |
| `LOCKUP_EXPIRY` | `kind/xsjj` |
| `MARGIN_TRADE` | `kind/rzrq` 全市场筛选 |
| `PERF_FORECAST` | `vFD_AchievementNotice` |
| `STOCK_MONEY_FLOW` | `MoneyFlow.ssi_ssfx_flzjtj` |
| `INTRADAY_TICK` | `CN_TransListV2` / 分时 |

## 自定义方法

`sinaCorpInfo`、…、`sinaPerfForecast`、`sinaBulletins`、`sinaAllBulletins`、`sinaBulletinDetail`、`sinaIpoInfo`、`sinaAddStockHistory`、`sinaInsiderTrades`、`sinaStockComment`、`sinaPriceHistory`

## 限制

- 非官方开放 API，**Referer 须为 `http://finance.sina.com.cn/`**（已全局默认；勿用 https 或 vip 子域）
- 研报 / 多数 `FinanceService.*` JSON 已失效
- 融资融券全市场页体积大（~4MB）
- 个股龙虎榜历史页常为空，请用 `DRAGON_TIGER` + 日期或 `sinaDragonTigerStock`

## 测试

```bash
cd packages/a-stock-layer && npm run build
npx vitest run tests/sina-corp.test.ts tests/sina-finance-ext.test.ts tests/sina-content.test.ts tests/sina-market.test.ts
```
