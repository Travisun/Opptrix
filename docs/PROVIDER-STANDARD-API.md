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
3. **多市场**：同一 Driver 可为 CN/US/HK 分别生成 binding；方法内用 `market` 参数或 symbol 规范化区分底层 API
4. **ETF / 个股 / 指数**：用 `cnEquityEtfIndex` / `cnEtfBindings` / `cnIndexBindings` 分拆 assetClass，禁止仅用 `EQUITY` 覆盖 ETF 专有 capability
5. **自定义方法**：`custom-method-docs.ts` + `core/custom-methods.ts` 登记；`capabilities: []` 的纯自定义 Provider 仍须 `registerAllDrivers`

### 2.1 推荐 binding 模板

```typescript
// CN 个股 + ETF + 指数
bindingsFor: (p, mc) => cnEquityEtfIndex(EQUITY_CAPS, INDEX_CAPS, p, ETF_CAPS, mc)

// 跨市场（StockIndex / TickFlow）
bindingsFor: (p, mc) => [
  ...usEquityBindings(CAPS, p, mc),
  ...cnEquityEtfIndex(...),
  ...regionalEquityBindings('HK', CAPS, p, mc),
]

// 纯 Crypto
bindingsFor: (p, mc) => cryptoSpotBindings(CAPS, p, mc)

// 纯自定义（AkShare）
capabilities: []
bindingsFor: () => []
```

### 2.2 标准方法实现要点

- 签名与同类 Provider 保持一致（如 `stockList(marketOrKeyword, keyword?, page?, pageSize?, board?, industry?)`）
- 返回 `T[] | null`（空则 `null`，由 Engine 触发 failover）
- 底层 URL / 鉴权 / 分页差异放在 `api/` + `normalize/`，Handler 只做编排
- ETF 方法：`etfList` / `etfProfile` / `etfNav` / `etfHoldings` 须校验 `isCnEtfCode`（CN）

---

## 3. 内置 Provider 审计（2026-07-08）

| Provider | 注册 | Binding 结构 | 多市场 | ETF 分拆 | 标准 API | 自定义 | 结论 |
|----------|------|--------------|--------|----------|----------|--------|------|
| **stockindex** | ✅ | CN/US/HK EQUITY + CN ETF_LIST | ✅ 搜索/列表 | 仅 ETF_LIST | ✅ `instrumentSearch` 等 | 板块/行业扩展 API | **合规**；ETF 净值/持仓靠 sinafinance/tencent 等 |
| **tickflow** | ✅ | US + CN(ETF) + HK | ✅ | ✅ FREE_CN_ETF | ✅ | 少量 custom | **标杆** |
| **baostock** | ✅ | cnEquityEtfIndex 全 ETF | CN | ✅ | ✅ | custom | **合规** |
| **sinafinance** | ✅ | cnEquityEtfIndex + SINA_ETF | CN | ✅ | ✅ | F10 深度 custom | **合规**；部分 `sinaEtf*` custom 与标准重复，宜标注 deprecated |
| **eastmoney** | ✅ | CN EQUITY：STOCK/SECTOR/MARKET_MONEY_FLOW + MARGIN_TRADE + MACRO_INDICATOR + INST_HOLDING | CN | N/A | ✅ 资金流/两融/宏观/机构持仓 | `em*` 排名/历史/宏观/机构持仓 | **合规**；data.eastmoney.com 公开接口 |
| **tencent** | ✅ | CN + **US/HK registry binding**；`mixTencent*Equity` 单 Driver 内路由 | ✅ CN ETF | ✅ 三市场标准方法 + US/HK 详情维度（news/notices/shareholders/dividend/technical） | HK/US 深度财报等 custom | **合规** |
| **tushare** | ✅ | CN cnEquityEtfIndex | CN | 弱（无 ETF_LIST） | ✅ | 无 | **合规（CN）** |
| **zzshare** | ✅ | CN；ETF 绑定 FREE_CN_ETF | CN | ✅ ETF_LIST/NAV/PROFILE | ✅ | custom | **合规** |
| **tonghuashun** | ✅ | CN；无 ETF cap；含 BALANCE_SHEET / CASH_FLOW | CN | ❌ | ✅ | `ths*` 指数目录/成分、财务指标、连板天梯/飙升榜/热股历史与排名走势、异动分析（9）；**不含** market-dumps | **合规（CN 个股）** |
| **binance / okx** | ✅ | cryptoSpotBindings | CRYPTO | N/A | ✅ | 无 | **合规** |
| **akshare** | ⚠️ 须 register | `capabilities: []` | 另类数据 | N/A | 无（设计如此） | 216+ custom | **自定义专用**；须注册 Driver 否则 invoke 失败 |

### 3.1 已知技术债（非 Provider 层）

- **Hub** 部分路径仍 `de.realtime` / `de.kline` 直连（A 股详情、筹码等），应逐步改为 `queryInstrumentData`
- **sync** 个别 job 仍 `de.realtime`（CN 批量行情优化路径）
- **JP/KR** 无 `instrument_search` 计划（`resolveInstrumentQueryPlan` 返回 null）
- **Tencent** `tencentHkStockList` 等：有意保留为 custom，待标准 `stock_list`+`market:HK` 覆盖后可 deprecate

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
| 标杆 Provider | `providers/tickflow/`、`providers/stockindex/` |
