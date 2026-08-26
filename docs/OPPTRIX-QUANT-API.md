# Opptrix 量化投研工作台 — 数据接口

> **基址**：`https://quant.opptrix.net`（固定，设置页不可改）  
> **认证**：请求头 `X-API-Key: {数据密钥}`  
> **登录**：使用 [opptrix.net](https://opptrix.net) 账号即可，无需另行注册  
> **关联**：[INSTRUMENT-PROTOCOL.md](./INSTRUMENT-PROTOCOL.md)、[DATA-LAYER.md](./DATA-LAYER.md)、[PROVIDER-STANDARD-API.md](./PROVIDER-STANDARD-API.md)

工作台内 **标的搜索唯一在线源** 为本 API；须配置 **Opptrix 量化数据密钥** 后方可搜索与拉取名录。历史行情仍按内部 `InstrumentRef.assetClass` 路由至同花顺等 Provider（无统一历史行情端点）。

---

## 1. 通用约定

| 项 | 说明 |
|----|------|
| 分页 | 列表类接口 `page_size` **最多 35**；响应含 `pagination.has_more` |
| 配额 | 每账户有日/月调用额度，超出返回 **HTTP 429** |
| 空值 | 净值等字段暂无数据时为 `null` |
| 七日年化 | `annualized_7d` 为**百分数**（如 `0.815` 表示 0.815%） |
| 绩效指标 | 根据历史净值计算，便于横向比较，**非**基金管理人官方披露 |

---

## 2. 统一标的 ID

规范格式（全部大写；查询时大小写不敏感）：

```
{MARKET}:{CLASS_TOKEN}:{SYMBOL}
```

### 2.1 CLASS_TOKEN

| CLASS_TOKEN | 含义 | 示例 |
|-------------|------|------|
| `STOCK` | A 股 / 港 / 美普通个股 | `CN:STOCK:688981.SH`、`HK:STOCK:00700.HK`、`US:STOCK:AAPL.US` |
| `IND` | 指数（含板块 / 行业 / 题材） | `CN:IND:000300.SH`、`CN:IND:399001.SZ`、`CN:IND:881121.TI` |
| `OTC` | 场外基金 | `CN:OTC:000037.OF` |
| `ETF` | 场内 ETF | `CN:ETF:510050.SH`、`US:ETF:SPY.US` |
| `LOF` | 场内 LOF | `CN:LOF:160105.SZ` |
| `REIT` | 公募 REITs | `CN:REIT:508000.SH` |

### 2.2 后缀

| 后缀 | 说明 |
|------|------|
| `.SH` / `.SZ` / `.BJ` | 上交所 / 深交所 / 北交所 |
| `.TI` | 同花顺板块 / 行业 / 题材指数 |
| `.OF` | 场外基金 |
| `.HK` / `.US` | 港股 / 美股 |

同裸码不同后缀互不冲突（如 `000001.SH` 为指数、`000001.SZ` 为股票）。

### 2.3 映射至内部 `InstrumentRef`

| CLASS_TOKEN | `assetClass` | `exchange` 备注 |
|-------------|--------------|-----------------|
| STOCK | `EQUITY` | `.SH/.SZ/.BJ` |
| IND | `INDEX` | `.TI` 板块指数；`.SH/.SZ` 宽基 |
| OTC | `FUND` | `PF` |
| ETF | `ETF` | 上市交易所 |
| LOF | `LOF` | 上市交易所 |
| REIT | `REIT` | 上市交易所（**扶摇 fund_type=otc**，thscode 保留 `.SH/.SZ`，非 `.OF`） |

解析入口：`parseOpptrixInstrumentId` → `normalizeInstrumentRef`。

---

## 3. 标的列表与详情

### GET `/api/v1/instruments`

查询参数：`q`、`market`、`class_token`、`page`、`page_size`（≤35）

示例：

```http
GET /api/v1/instruments?market=CN&class_token=IND
GET /api/v1/instruments?market=CN&class_token=REIT
GET /api/v1/instruments?q=茅台&market=CN&class_token=STOCK
```

### GET `/api/v1/instruments/{id}`

示例：`GET /api/v1/instruments/CN:STOCK:688981.SH`

---

## 4. 基金净值与绩效

### GET `/api/v1/funds/{code}/nav`

历史净值；字段含 `nav_unit`、`nav_cumulative`、`fund_assets`、`per_10k_gain`、`annualized_7d` 等。

### POST `/api/v1/funds/nav/latest`

批量最新净值（`items` 每块 ≤10）。

### GET `/api/v1/funds/{code}/metrics`

绩效指标（`total_return`、`sharpe`、`max_drawdown` 等；非官方披露）。

---

## 5. 工作台内数据路由（同花顺 / 扶摇）

| 内部类型 | 实时 / K 线 | 净值 / 档案（扶摇 `fund_type`） |
|----------|-------------|----------------------------------|
| EQUITY | 个股 `prices*` | — |
| INDEX | 指数 `indexPrices*` | — |
| ETF | 场内 `fundMarket*` / `prices*` | `exchange`（与 LOF 相同） |
| LOF | 同 ETF | `exchange` |
| REIT | **不走**个股 batch；`fund_quote` | **`otc`**（thscode 保留 `.SH/.SZ`；勿用 `reits`，会 1004 冲突） |
| FUND (OTC) | `fund_quote` | `otc` |

实现：`resolveInstrumentQueryPlan` + `resolveFuyaoFundRoute(ref.assetClass)`。

---

## 6. 兼容

- 旧命名空间 `CN:SH.600519`、`CN:PF.110022` 仍可通过 `parseInstrumentNamespace` 解析。
- 旧小写 token `CN:of:009049` 仍兼容；新数据以 `CN:OTC:000037.OF` 为准。
