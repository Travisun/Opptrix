---
name: provider-docs
description: >-
  Provider standard Instrument API bindings and custom-method documentation
  standards for a-stock-layer. Use when adding/modifying Providers, bindings,
  or custom methods.
---

# Provider 标准 API 与文档

> 全局流程见 skill `data-layer`。完整说明：`docs/PROVIDER-STANDARD-API.md`。

## 调用边界

- Hub / Agent / 同步：只经 `queryInstrumentData(ref, capability, opts)`
- 禁止 Hub 主路径新增 `de.realtime()` / `de.etfNav()` 等 Engine 直连
- 非标准：`invokeCustomMethod` + `custom-method-docs.ts` + `ALL_CUSTOM_METHODS`

## 标准能力（不得用自定义方法替代）

`realtime` `kline` `snapshot` `profile` `financials` `stock_list` `instrument_search` `sector_list` `etf_list` `etf_nav` `etf_holdings` `etf_snapshot`

新增产品能力：先改 `instrument-query.ts`，再实现 Provider 标准方法。

## manifest 必做

```typescript
bindingsFor: (p, maxConcurrent) => cnEquityEtfIndex(equityCaps, indexCaps, p, etfCaps, maxConcurrent)
// 或 usEquityBindings / regionalEquityBindings / cryptoSpotBindings / crossMarketBindings
```

- 每个 `(market, assetClass, capability)` 一行 binding，与 `capabilities` 一致
- ETF 用 `assetClass: 'ETF'` + `ETF_*` capability
- 多市场：CN/US/HK 分别声明 binding
- 纯自定义 Provider：`capabilities: []`、`bindingsFor: () => []`，仍须 `register.ts` 注册

## 标准方法约定

- 方法名与 Engine 一致：`realtime`、`kline`、`stockList`、`instrumentSearch`、`etfNav`…
- 返回 `T[] | null`；失败/空 → `null` 触发 failover
- 跨市场 list/search：带 `market` 参数并在 handler 内分支

## 自定义方法三层文档（缺一不可）

| 层级 | 文件 |
|------|------|
| 注册表 | `{provider}/custom-method-docs.ts` → `*_CUSTOM` |
| 挂载层 | `{provider}/markets/*/ext.ts` 完整 JSDoc |
| Fetch 层 | `{provider}/api/*.ts` 含 `@sourceUrl`、入参、返回、`@remarks` |

必填：`description`、`sourceUrl`、`params`、`returns`、`usage`、`notes`、`example`；有则 `pageUrl`。

MCP 注册：`core/custom-methods.ts` 经 `toCustomMethodDef` 导入；扩展字段须一并填写。

参考：`providers/tencent/custom-method-docs.ts`、`providers/sinafinance/custom-method-docs.ts`。

## 提交前自检

- [ ] `bindingsFor` 覆盖所有 capability × 市场 × assetClass
- [ ] 新 Provider 已 `register.ts`；设置页可见则 `loader.ts` `BUILTIN_MANIFESTS`
- [ ] 未在 Hub/Agent 主路径绕过 `queryInstrumentData`
- [ ] 注册表 / ext / fetch 三层一致；`sourceUrl` 可验证
- [ ] `npm run build` 通过

原文：`.cursor/rules/provider-standard-api.mdc`、`data-provider-docs.mdc`。
