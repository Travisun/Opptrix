# Provider 标准 API 开发规范

> 与 `InstrumentDataCapability` / `queryInstrumentData` 对齐。Hub、Agent、同步层**只**经标准入口调用；未纳入标准能力表的接口必须登记为**自定义方法**。  
> 标的身份与命名空间细则见 [INSTRUMENT-PROTOCOL.md](./INSTRUMENT-PROTOCOL.md)。

## 1. 三层边界

| 层级 | 入口 | 谁调用 |
|------|------|--------|
| **标准 Instrument API** | `engine.queryInstrumentData(ref, capability, opts?)` | Hub、Agent、`StandardInstrumentGateway`、Discover |
| **Registry 路由** | `(market, assetClass, Capability)` → Provider 方法 | Engine `queryScoped` 内部 |
| **自定义方法** | `engine.invokeCustomMethod(providerId, method, args)` | Agent MCP、`provider_custom_methods`；**禁止** Hub 主路径穿透 |

### 1.1 标准能力表（`InstrumentDataCapability`）

```
realtime | kline | snapshot | profile | financials
stock_list | instrument_search | sector_list
etf_list | etf_nav | etf_holdings | etf_snapshot | etf_profile
fund_list | fund_nav | fund_holdings | fund_snapshot | fund_profile | fund_quote
fund_returns | fund_drawdown | fund_allocation | fund_holders | fund_dividend
fund_manager | fund_diagnosis | fund_news | fund_financials
dividend | news | notices | shareholders | money_flow | technical_analysis
```

新增产品级能力时：**先**扩展 `packages/a-stock-layer/src/core/instrument-query.ts` 与 `resolveInstrumentQueryPlan`，**再**让 Provider 实现对应标准方法名。

### 1.2 自定义方法适用场景

- 债券 / 期货 / 宏观 / 东财 F10 深度字段等**无**对应 `InstrumentDataCapability`
- 需要暴露原始分页结构（如 `stockIndexListBoardStocks` 返回 `{ total, items }`）且标准 `stock_list` 已够用时不重复登记
- **禁止**：已有标准能力却再登记同名语义的自定义方法（如 `stockIndexSearch` 已改为标准 `instrumentSearch`）

---

## 2. Provider 合规模型

每个 Provider 必须满足：

1. **`manifest.ts`**：`capabilities` 与 `bindingsFor(p, maxConcurrent)` 一致；每个 binding 含 `market` + `assetClass` + `capability`
2. **标准方法名**：与 Engine `queryScoped` 调用的 `method` 字符串一致（`realtime`、`etfNav`、`instrumentSearch`…）
3. **`batchRealtime` 自动分片**：大批量（>100）时 Provider（Tickflow POST / 同花顺 snapshot 等）与 Engine 均按片请求并隔离片失败；任一成功片即可返回稀疏成功子集，禁止整批空
4. **多市场**：同一 Driver 可为 CN/US/HK 分别生成 binding；方法内用 `market` 参数或 symbol 规范化区分底层 API
5. **ETF / 个股 / 指数**：用 `cnEquityEtfIndex` / `cnEtfBindings` / `cnIndexBindings` 分拆 assetClass，禁止仅用 `EQUITY` 覆盖 ETF 专有 capability
6. **自定义方法**：`custom-method-docs.ts` + `core/custom-methods.ts` 登记；`capabilities: []` 的纯自定义 Provider 仍须 `registerAllDrivers`

### 2.1 推荐 binding 模板

```typescript
// CN 个股 + ETF + 指数
bindingsFor: (p, mc) => cnEquityEtfIndex(EQUITY_CAPS, INDEX_CAPS, p, ETF_CAPS, mc)

// 跨市场（TickFlow）
bindingsFor: (p, mc) => [
  ...usEquityBindings(CAPS, p, mc),
  ...cnEquityEtfIndex(...),
  ...regionalEquityBindings('HK', CAPS, p, mc),
]

// 纯 Crypto
bindingsFor: (p, mc) => cryptoSpotBindings(CAPS, p, mc)

// 纯自定义（第三方插件 Provider）
capabilities: []
bindingsFor: () => []
```

### 2.2 标准方法实现要点

- 签名与同类 Provider 保持一致（如 `stockList(marketOrKeyword, keyword?, page?, pageSize?, board?, industry?)`）
- 返回 `T[] | null`（空则 `null`，由 Engine 触发 failover）
- 底层 URL / 鉴权 / 分页差异放在 `api/` + `normalize/`，Handler 只做编排
- ETF 方法：`etfList` / `etfProfile` / `etfNav` / `etfHoldings` 须校验 `isCnEtfCode`（CN）

### 2.3 免费源退避保护（硬性）

适用：manifest **无**必填 `secret` 字段的免费行情源（baostock / zzshare 等）。

> **设计全文**（分层、批内全开、主机闸门、不变量与常数）：[FREE-PROVIDER-SERIAL-GUARD.md](./FREE-PROVIDER-SERIAL-GUARD.md)。

引擎已有两层保护（Hub 批内可不限并发；硬门槛在主机闸门）：

| 层 | 机制 | 职责 |
|----|------|------|
| **预防** | `hostnameLimiter`（`ProviderHttpClient`，每 host 单在途 + 约 1s 间隔，`maxQueued=512`） | 降低触发反爬/封禁概率 |
| **封禁后** | `FreeProviderThrottle` 阶梯冷却（5min → … → 24h+） | 冷却期内跳过该 Provider，换源 / 等待 |

实现要求：

1. HTTP 统一走 `ProviderHttpClient`，免费源 **`bypassRateLimit: false`**（仅 tushare / 带 Key 的 tickflow / tonghuashun / binance / okx 等可为 `true`（tickflow 公开免费档按免费源限流））
2. 上游 `403/429/5xx`、空响应体、`访问被拒绝` 等须 **抛到引擎**；`queryScoped` / `invokeCustomMethod` 的 `catch` 会 `recordProviderQueryError` → 阶梯冷却
3. Handler 业务空结果可 `return null`；若 `catch` 吞错，必须先 `rethrowIfFreeProviderThrottleTrigger(e)`（`providers/common/free-provider-call.ts`）
4. `invokeCustomMethod` 空结果走 `recordProviderQueryEmpty`，勿用成功路径误清冷却

```typescript
} catch (e) {
  rethrowIfFreeProviderThrottleTrigger(e)
  return null
}
```

---

## 3. 内置 Provider 审计（2026-08-22）

### 3.0 已移除的爬虫源（不再内置注册）

自 **2026-08** 起，下列 **公开门户爬虫** Provider 已从 `register.ts` / `BUILTIN_MANIFESTS` **移除**，源码目录保留作参考，**不再**参与 Engine 路由与设置页默认列表：

| Provider | 原职责摘要 | 移除后影响 |
|----------|------------|------------|
| **tencent** | CN/US/HK 行情、ETF 基金 custom、港美详情 enrich | 港美部分深度维度、跨市场 enrich 降级 |
| **sinafinance** | CN 行情 / F10 custom | 由 tonghuashun / tickflow / zzshare / baostock 覆盖主路径 |
| **eastmoney** | 资金流、两融、宏观 cjsj、机构持仓 zlsj | Hub `instrument_institution_holdings`、`macro_series` 等非 CN 宏观 scope 降级 |
| **akshare** | 纯自定义另类数据（216+ custom） | Agent `provider_ext` 逃生舱不再默认可用 |

**推荐内置栈**（`registerAllDrivers` 现状；defaultPriority 越大越优先）：

| 顺位 | Provider | defaultPriority | 备注 |
|------|----------|-----------------|------|
| 1 | **tonghuashun** | 120 | 需扶摇 Key；个股 / ETF / 公募基金主路径；HTTP 经 `@opptrix/fuyao` SDK（`FuyaoClient` 适配层） |
| 2 | **stockindex**（Opptrix量化） | 115 | 标的搜索权威源；需数据密钥；基址固定 `https://quant.opptrix.net` |
| 2b | **yfinance** | 118 | **默认开启**；全球指数 + 美/港/日/韩 `STOCK_*` / `INDEX_*` / `SECTOR_LIST`；自定义 `yfScreener` / `yfTrendingSymbols`；`yahoo-finance2` Queue + 429/5xx 退避；无需密钥 |
| 3 | **tickflow** | 110 | **默认开启**公开免费档；配置 Key 可升级实时；US / HK / CN ETF；名录灌库 |
| 4 | **tushare** | 105 | 需 Token；批量 / 基本面 |
| — | **binance** / **okx** | ≤100 | CRYPTO；勿抢前四 |

**暂时下线**（源码保留，可加回）：**baostock**、**zzshare**。

| 市场 | 其它说明 |
|------|----------|
| 搜索编排 | Hub `instrument_search` → Opptrix量化（stockindex）为主路径 + 本地名录 |
| 名录灌库 | **Tickflow**（可选）：CN/HK/US 股票与 CN ETF：`getExchangeInstruments` |

**右侧面板**：个股 / ETF 行情、K 线、概况、财报等 **仍经** `queryInstrumentData` 标准能力，由上述内置源 failover；不依赖已移除爬虫源。

**Hub 功能降级**（无替代内置源时）：机构持仓详情 Tab、非 CN 宏观 scope、部分跨市场 enrich（原依赖 eastmoney cjsj/zlsj、tencent 港美 custom）。

### 3.1 内置 Provider 矩阵

| Provider | 注册 | Binding 结构 | 多市场 | ETF 分拆 | 标准 API | 自定义 | 结论 |
|----------|------|--------------|--------|----------|----------|--------|------|
| **tonghuashun** | ✅ | CN；**CN ETF 分拆**（priority 120）；**CN FUND** | CN | ✅ | ✅ | `ths*` / Fuyao | **合规（CN 主路径）** |
| **stockindex** | ✅ | 跨市 **INSTRUMENT_SEARCH**（仅标的搜索） | CN/US/HK | — | ✅ 搜索 | 无 | **Opptrix量化**；priority 115 |
| **yfinance** | ✅ | **GLOBAL_INDEX** + 跨市 **INDEX_*** / **STOCK_*** / **SECTOR_LIST** | US/HK/JP/KR | — | ✅ | 无 | **全球指数与跨市个股**；priority 118；`yahoo-finance2` Queue + 退避重试；默认开启 |
| **tickflow** | ✅ | US + CN(ETF) + HK | ✅ | ✅ FREE_CN_ETF | ✅ | 少量 custom | **标杆**；目录 priority 110；名录灌库 |
| **tushare** | ✅ | CN cnEquityEtfIndex + **cnFundBindings** | CN | 弱（无 ETF_LIST） | ✅ | fund_* 等 | **合规（CN）**；priority 105 |
| **binance / okx** | ✅ | cryptoSpotBindings | CRYPTO | N/A | ✅ | 无 | **合规** |
| **baostock / zzshare** | ❌ 暂时下线 | 源码保留 | — | — | — | — | 可本地手动 register 测限流 |

### 3.2 已知技术债（非 Provider 层）

- **Hub** 部分路径仍 `de.realtime` / `de.kline` 直连（A 股详情、筹码等），应逐步改为 `queryInstrumentData`
- **sync** 个别 job 仍 `de.realtime`（CN 批量行情优化路径）
- **JP/KR** 无 `instrument_search` 计划（`resolveInstrumentQueryPlan` 返回 null）
- **机构持仓 / 非 CN 宏观**：原 eastmoney 专属 Hub feature 待新 Provider 或付费源补齐

---

## 4. 新增 / 修改 Provider 检查清单

### 标准能力

- [ ] `manifest.ts`：`bindingsFor` 覆盖声明的每个 `(market, assetClass, capability)`
- [ ] 多市场时每个 market 一行 binding，**不要**只写 `marketGroup: 'GLOBAL'` 而不绑 US/HK
- [ ] ETF capability 绑在 `assetClass: 'ETF'`，指数绑在 `INDEX`
- [ ] 实现 `resolveInstrumentQueryPlan` 会调用的方法名
- [ ] `npm run build` + 相关 `node --test` 通过
- [ ] 在 `register.ts` 注册；manifest 加入 `loader.ts` 的 `BUILTIN_MANIFESTS`（若有设置页）

### 自定义能力

- [ ] 方法写入 `{provider}/custom-method-docs.ts`，并 `toCustomMethodDef` 导出
- [ ] 加入 `core/custom-methods.ts` 的 `ALL_CUSTOM_METHODS`
- [ ] **不**与标准 capability 重复
- [ ] `ext.ts` / `api/` 三层文档（见 `data-provider-docs.mdc`）

### 上层集成

- [ ] Hub / Agent **不**新增 `de.xxx()` 直连；用 `queryInstrumentData` 或 `invokeCustomMethod`
- [ ] 新 Hub feature 映射到 `InstrumentDataCapability`（`shared/instrument-hub.ts`）

---

## 5. 参考文件

| 主题 | 路径 |
|------|------|
| 计划路由 | `packages/a-stock-layer/src/core/instrument-query.ts` |
| Engine 入口 | `packages/a-stock-layer/src/engine.ts` — `queryInstrumentData` / `queryScoped` |
| Binding 工具 | `packages/market-data-core/src/core/bindings.ts` |
| ETF capability 集 | `packages/a-stock-layer/src/providers/common/etf-capabilities.ts` |
| Registry | `packages/market-data-core/src/core/registry.ts` |
| 自定义登记 | `packages/a-stock-layer/src/core/custom-methods.ts` |
| 标杆 Provider | `providers/tickflow/`、`providers/tonghuashun/` |


### stockindex（Opptrix量化）

- **用途**：跨市场标的搜索权威源（`instrumentSearch` / 统一搜索在线路径）；**不提供**行情、净值、档案等数据能力
- **基址**：固定 `https://quant.opptrix.net`（设置页不可改）
- **认证**：数据密钥（`X-API-Key`）；在 [Opptrix量化社区](https://quant.opptrix.net/) 获取
- **统一标的 ID / REST 契约**：见 [OPPTRIX-QUANT-API.md](./OPPTRIX-QUANT-API.md)（`STOCK/IND/OTC/ETF/LOF/REIT` + 后缀）
- **默认**：未启用（需用户配置密钥后开启）
- **defaultPriority**：115（推荐栈第 2，仅次于同花顺 120）
