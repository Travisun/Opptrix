# 标的身份协议（Instrument Protocol）

> **状态**：现行规范（v1）— 与 `InstrumentRef`、`queryInstrumentData`、`provider-wire` 对齐。  
> **关联**：[DATA-LAYER.md](./DATA-LAYER.md)、[PROVIDER-STANDARD-API.md](./PROVIDER-STANDARD-API.md)

---

## 1. 三层协议

| 层级 | 载体 | 职责 | 谁解析 |
|------|------|------|--------|
| **L3 产品层** | `InstrumentRef` + 命名空间 | UI、Hub、自选、聊天 @ 引用、持久化 | `parseInstrumentNamespace` / `normalizeInstrumentRef` |
| **L2 标准层** | `queryInstrumentData(ref, capability)` | 路由、缓存、Provider 回退 | `resolveInstrumentQueryPlan` + Engine `queryScoped` |
| **L1 Provider 线格式** | `sh600519`、`000977.SZ`、`AAPL` 等 | 各数据源 HTTP/API 入参 | `provider-wire`（**仅** Engine/Hub 边界） |

**硬性规则**：Provider Driver **不解析**命名空间；禁止在 Provider 内手写 `CN:SZ.000977` 拆分逻辑。

---

## 2. InstrumentRef 字段

```typescript
interface InstrumentRef {
  market: 'CN' | 'US' | 'HK' | 'CRYPTO' | 'JP' | 'KR'
  assetClass: 'EQUITY' | 'ETF' | 'INDEX' | 'FUND' | 'CRYPTO_SPOT' | 'CRYPTO_PERP'
  symbol: string      // 市场本地代码：A 股 6 位、美股 ticker、港股数字码
  exchange?: string   // A 股 SH / SZ / BJ；同码异名时必须携带
  quote?: string      // 加密货币计价币，如 USDT
}
```

### 2.1 命名空间（Stock-index）

格式：`{market}:{exchange}.{symbol}`（交易所与代码之间用 **点号**）

| 示例 | 含义 |
|------|------|
| `CN:SZ.000977` | 深市个股「浪潮信息」 |
| `CN:SH.000977` | 上证指数「内地低碳」 |
| `CN:SH.600519` | 沪市「贵州茅台」 |
| `US:AAPL` | 美股 Apple（无交易所段时省略） |
| `HK:00700` | 港股腾讯 |

**兼容**：解析层接受 typo `CN:SH:000977`（冒号），输出规范化为 `CN:SH.000977`。

**稳定键**：`instrumentRefKey(ref)` = `buildInstrumentNamespace(ref)`，用于去重、缓存、关注列表。

### 2.2 A 股同码异名

当 6 位代码在不同交易所对应不同标的时（如 `000977`），**必须**同时携带 `exchange` 与正确的 `assetClass`：

- `exchange: 'SZ'` + `assetClass: 'EQUITY'` → 浪潮信息
- `exchange: 'SH'` + `assetClass: 'INDEX'` → 内地低碳

禁止仅用裸码 `000977` 做详情/行情主路径（搜索命中除外，须尽快消歧为完整 Ref）。

---

## 3. 标准 API 入口

```typescript
// 唯一推荐入口
engine.queryInstrumentData(ref, capability, opts?)

// 非标能力（Agent / 维护脚本）
engine.invokeCustomMethod(providerId, method, args)  // args 经 normalizeCustomMethodArgs
```

`resolveInstrumentQueryPlan` 对 **CN / US / HK / CRYPTO** 的 registry 计划均携带 `ref`，供 `queryScoped` 在调用前按 Provider 重写 `args`。

---

## 4. Provider 线格式（`provider-wire`）

实现：`packages/a-stock-layer/src/core/provider-wire.ts`

| 函数 | 用途 |
|------|------|
| `wireProviderSymbolArg(providerId, paramName, method, ref)` | 单参数字符串 |
| `wireRegistryMethodArgs(providerId, method, args, ref)` | `queryScoped` 调用前重写 `args[0]` |
| `formatProviderMethodArgs(providerId, method, ref, extraArgs?)` | Hub 直连单 Provider |

### 4.1 A 股（CN）

| Provider | 行情类方法 | 资料类方法 |
|----------|-----------|-----------|
| tencent / sinafinance | `cnSecSymbol` → `sz000977` / `sh000977` | 裸 6 位码 |
| tushare | `000977.SZ` / `000977.SH` | 同左 |
| baostock / zzshare / tickflow | 裸 6 位码 | 同左 |

行情类方法集合含：`realtime`、`realtimeSec`、`kline`、`moneyFlow` 等，以及方法名含 `Quote` / `Realtime` 的腾讯扩展接口。

### 4.2 美股 / 港股

| 市场 | 线格式 |
|------|--------|
| US | `canonicalUsSymbol` → 大写 ticker（`AAPL`） |
| HK | `canonicalHkSymbol` → 5 位补零（`00700`） |

腾讯跨市场自定义方法（`tencentUsStockProfile`、`tencentHkStockNotices` 等）同样经 `formatProviderMethodArgs` 规范化。

### 4.4 腾讯多市场单 Provider 模型

腾讯是 **单一 `tencent` Driver**，在 CN handler 上通过 `mixTencentUsEquity` / `mixTencentHkEquity` 叠加标准方法路由：

| 层级 | 行为 |
|------|------|
| **Registry** | `bindingsFor` 声明 CN / US / HK 三套 `(market, assetClass, capability)` |
| **provider-wire** | 按 market 产出 `sz000977` / `AAPL` / `00700` |
| **Driver 内** | `realtime`/`kline`/`profile` 根据线格式形态（`isValidUsSymbol` 等）自动分发到 US/HK/CN 实现 |

**详情常用维度**（2026-07 起已纳入标准 `InstrumentDataCapability`）：

| capability | CN | US | HK |
|------------|----|----|-----|
| `notices` / `news` | sinafinance/tencent/zzshare | tencent `news`（notice 通道） | 同左 |
| `dividend` | sinafinance/tushare/baostock 等 | — | tencent `dividend` |
| `shareholders` | sinafinance/tushare 等 | tencent `shareholders` | — |
| `money_flow` | tencent/sinafinance/zzshare | — | — |
| `technical_analysis` | — | — | tencent `technicalAnalysis` |

Hub 详情主路径应 `queryInstrumentData(ref, capability)`；`ext.ts` 中 `tencentHkReviewProspect`、`tencentUsSeniorTrades` 等 **仍无标准 capability**，保留为 custom enrich。

实现参考：`packages/a-stock-layer/src/providers/tencent/market-router.ts`

---

## 5. Hub 直连 Provider 约定

```typescript
// 单 Provider
callDetailProviderMethod(['tencent'], 'realtimeSec',
  formatProviderMethodArgs('tencent', 'realtimeSec', cnRef))

// 多 Provider 回退（各 Provider 自行 wire）
callDetailProviderMethod(['sinafinance', 'tushare'], 'financials',
  [code, '', 'all'], cnRef)
```

`callDetailProviderMethod` 在传入 `ref` 时，对每个命中的 Provider 分别执行 `wireRegistryMethodArgs`。

---

## 6. 本地库元数据（stockMeta）

视图 `v_cn_equity_stocks` 已含 `market` 列（即交易所 SH/SZ/BJ）。

```typescript
// 推荐：带交易所的复合查询
store.stockMeta('000977', 'SZ')  // → 浪潮信息

// 兼容：仅裸码时取 LIMIT 1（旧客户端/未消歧路径）
store.stockMeta('000977')

// 批量复合键
store.stockMetaBatch(['000977'], exchangeByCode)
store.stockMetaLookupKey('000977', 'SZ')  // → 'SZ:000977'
```

`ResearchHub.resolveStockName` 在已知 `exchange` 时优先走复合查询，并与内存缓存键 `SZ:000977` 对齐。

---

## 7. 入口合规清单

以下路径须携带完整 `InstrumentRef` 或命名空间；遗留裸码路径应逐步收敛：

- [x] 顶栏 / 搜索 Hub 选中结果
- [x] 聊天 @ 标的引用
- [x] 自选录入与展示（`normalizeWatchlistItem`）
- [x] 详情页 `stockDetail` / `stockDetailQuote`
- [x] `queryInstrumentData` registry 分支（CN/US/HK/CRYPTO 均带 `ref`）
- [x] Agent 自定义方法 `normalizeCustomMethodArgs`
- [x] 筹码 / 机构评级 instrument 路由（传完整 `ref`）
- [ ] Hub 详情 fallback（`de.dividend` 等 deprecated）— 见 §9
- [ ] sync jobs `cnEquityRef` 批量补 exchange — 见 §9
- [ ] `stocks` 表单键 legacy 表 — 新写入优先 `instruments` 复合键（v8）

---

## 8. 扩展新 Provider 时

1. 在 `provider-wire.ts` 增加 `providerId` 分支（**不要**在 Driver 内解析命名空间）
2. 在 `manifest.ts` 声明 `(market, assetClass, capability)` binding
3. 标准能力走 `resolveInstrumentQueryPlan`；非标登记 `custom-methods.ts` + 文档
4. 为线格式转换补充 `tests/instrument-standardization.test.mjs` 用例

---

## 9. 已知限制与后续

| 项 | 现状 | 计划 |
|----|------|------|
| `instruments` 表主键 | **v8 复合键** `(market, exchange, code, asset_class)` | 已完成；`upsertInstrument` / `getInstrument` |
| `stocks` 表 | 仍单键 `code` | 同步逐步只写 `instruments`；`stocks` 作兼容 |
| Provider sec 双重前缀 | tencent/sinafinance 已修 `ensureCnSecSymbol` | 裸码 Provider 已扩展 `000977.SZ` wire |
| JP/KR | Plan 返回 null | 接入时复用 registry + `ref` 模式 |
| 裸码遗留调用 | Hub fallback / sync `de.xxx()` | 收敛为 `queryInstrumentData` + `cnEquityRef(code, { exchange })` |
