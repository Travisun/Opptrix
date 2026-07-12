---
name: data-layer
description: >-
  Data-layer standard API first — reuse queryInstrumentData / capabilities;
  never bypass the standard layer to call Providers from Hub/UI/Agent.
  Use when touching market data, Hub, research API, or a-stock-layer call sites.
---

# 数据层标准 API 优先（强制）

任何**新功能、代码调用、Hub 接口、前端数据层**改动之前，必须先对照现有架构，**套用已有标准方法**；不满足时再**扩展标准层**，禁止直接对接 Provider / 上游 API。

## 动手前必读（按顺序）

1. `docs/PROVIDER-STANDARD-API.md`
2. `docs/DATA-LAYER.md`
3. `packages/a-stock-layer/src/core/instrument-query.ts` — `resolveInstrumentQueryPlan`
4. CodeGraph：`queryInstrumentData`、`InstrumentRef`、`inferCnAssetClass` 及目标 capability 调用链

## 唯一标准入口

| 层级 | 用法 |
|------|------|
| Hub / Agent / 同步 | `engine.queryInstrumentData(ref, capability, opts?)` |
| 非标能力（最后手段） | `engine.invokeCustomMethod(providerId, method, args)` + 文档登记 |
| 标的引用 | `InstrumentRef`（`market` + `assetClass` + `symbol`）；A 股用 `inferCnAssetClass`，**禁止**把指数/ETF 一律当 `EQUITY` |

标准能力：`realtime` `kline` `snapshot` `profile` `financials` `stock_list` `instrument_search` `sector_list` `etf_*` 等（见 `InstrumentDataCapability`）。

## 扩展顺序（不得跳级）

1. **复用**：现有 capability + `opts`（`period` / `count` / `market`）
2. **扩计划**：改 `instrument-query.ts` 的 `resolveInstrumentQueryPlan`（及必要时 `InstrumentDataCapability`）
3. **扩 Provider 标准方法**：绑定 capability 的标准方法名（经 Registry 路由）
4. **自定义方法**：仅当无标准 capability；须 `custom-method-docs.ts` + 登记（见 skill `provider-docs`）

## 禁止

- Hub / `client-ui` / Agent **新增** `de.realtime()`、`de.kline()`、`invokeCustomMethod('tencent', …)` 等主路径直连
- Hub 内手写 `tencentXxx` / `zzshareXxx` 聚合，不经 `queryInstrumentData` / `instrument-router`
- 指数、ETF、个股混用错误 `assetClass` 或错误映射
- 已有标准能力再登记同义自定义方法

## 改动自检

- [ ] 已查 CodeGraph / 标准能力表，无法复用
- [ ] 新 Hub feature 映射到 `InstrumentDataCapability` 或已登记自定义方法
- [ ] `InstrumentRef` 与 `assetClass` 正确（INDEX / ETF / EQUITY）
- [ ] Provider 改动时 manifest binding 与文档同步
- [ ] 未在 UI 层绕过 `research` API 直连第三方行情 URL

适用路径（Cursor globs）：`packages/a-stock-layer/**`、`packages/research-hub/**`、`apps/server/**`、`client-ui/src/api/**`、`client-ui/src/market/**`。

原文：`.cursor/rules/data-layer-standard-api.mdc`。
