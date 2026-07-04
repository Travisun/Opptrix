# Provider 方法覆盖率审计

生成时间: 2026-07-04

## 数据来源

扫描路径: `packages/a-stock-layer/src/providers/*/markets/cn/{handler,research,chain}.ts`

---

## 一、BaseDriver 声明的 33 个方法 → 各 Provider 实现情况

| 方法 | eastmoney | tushare | baostock | sina | netease | zzshare | tonghuashun | cninfo | N |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| realtime | Y | Y | Y | Y | Y | Y | Y | · | 7 |
| batchRealtime | Y | Y | Y | Y | Y | Y | Y | · | 7 |
| kline | Y | Y | Y | Y | Y | Y | Y | · | 7 |
| moneyFlow | Y | · | · | · | · | Y | · | · | 2 |
| indexRealtime | Y | Y | Y | Y | Y | Y | Y | · | 7 |
| indexKline | Y | Y | Y | Y | Y | Y | Y | · | 7 |
| marketMoneyFlow | Y | · | · | · | · | Y | · | · | 2 |
| sectorMoneyFlow | Y | · | · | · | · | · | · | · | 1 |
| profile | Y | Y | Y | · | · | Y | Y | · | 5 |
| shareholders | Y | Y | · | · | · | · | · | · | 2 |
| financials | Y | Y | Y | · | · | · | Y | · | 4 |
| news | Y | · | · | · | · | · | · | Y | 2 |
| sentiment | Y | · | · | · | · | Y | Y | · | 3 |
| dragonTiger | Y | · | · | · | · | Y | Y | · | 3 |
| marginTrade | Y | · | · | · | · | · | · | · | 1 |
| dividend | Y | Y | Y | · | · | · | Y | · | 4 |
| stockBasic | · | Y | Y | · | · | Y | · | · | 3 |
| stockList | Y | Y | Y | Y | Y | Y | Y | · | 7 |
| limitUpdown | Y | · | · | · | · | Y | Y | · | 3 |
| marketBreadth | Y | · | · | Y | Y | Y | · | · | 4 |
| globalIndex | Y | · | · | Y | · | · | · | · | 2 |
| exchangeRate | Y | · | · | · | · | · | · | · | 1 |
| tradeCalendar | Y | Y | Y | · | · | Y | Y | · | 5 |
| cashFlow | Y | · | Y | · | · | · | · | · | 2 |
| indexConstituents | Y | · | Y | · | · | · | · | · | 2 |
| macroIndicator | Y | · | Y | · | · | · | · | · | 2 |
| chipDistribution | Y | · | · | · | · | · | · | · | 1 |
| chipProfile | Y | · | · | · | · | · | · | · | 1 |
| etfData | Y | · | · | · | · | · | · | · | 1 |
| etfList | Y | · | · | · | · | · | · | · | 1 |
| etfProfile | Y | · | · | · | · | · | · | · | 1 |
| etfHoldings | Y | · | · | · | · | · | · | · | 1 |
| etfNav | Y | · | · | · | · | · | · | · | 1 |

**结论: 所有 33 个 BaseDriver 方法至少有 1 个 provider 实现, 无空壳方法。**

ETF 5 个方法由 EastMoney 通过 `research.ts` mixin 注入实现。

---

## 二、CAP_METHOD 有映射但 BaseDriver 未声明的 24 个方法

这些方法在 `CAP_METHOD` 中注册了 Capability → method 映射, 但 BaseDriver 没有对应的类型签名。
Engine 通过 `queryScoped` 按字符串名调用, 绕过了类型安全。

| Capability | method | Engine 调用方式 | 实际 provider 实现 |
|---|---|---|---|
| BALANCE_SHEET | balanceSheet | `q()` | eastmoney(research), baostock |
| INCOME_STMT | incomeStatement | `q()` | eastmoney(research), baostock |
| INST_HOLDING | instHolding | `q()` | eastmoney(research), tushare |
| BLOCK_TRADE | blockTrade | `q()` | eastmoney(research) |
| LOCKUP_EXPIRY | lockupExpiry | `q()` | eastmoney(research) |
| SHARE_PLEDGE | sharePledge | `q()` | eastmoney(research) |
| INTRADAY_TICK | intradayTick | `q()` | eastmoney(research) |
| INSIDER_TRADE | insiderTrade | `q()` | eastmoney(research), tushare |
| PERF_FORECAST | perfForecast | `q()` | eastmoney(research), tushare, baostock |
| IPO_DATA | ipoData | `q()` | eastmoney(research) |
| CONVERTIBLE_BOND | convertibleBonds | `q()` | eastmoney(research) |
| MANAGER_INFO | managerInfo | `q()` | 无 (仅有 CAP_METHOD) |
| SHAREHOLDER_PLAN | shareholderPlans | `q()` | 无 (仅有 CAP_METHOD) |
| BUYBACK | buyback | `q()` | tushare |
| MAIN_BUSINESS | mainBusiness | `q()` | eastmoney(chain) |
| TOP_CUSTOMER | topCustomerSupplier | `q()` | eastmoney(chain) |
| ACTUAL_CONTROLLER | actualController | `q()` | eastmoney(chain) |
| SUBSIDIARY | subsidiaries | `q()` | eastmoney(chain) |
| RELATED_PARTY | relatedPartyTrades | `q()` | eastmoney(chain) |
| RD_INVESTMENT | rdInvestment | `q()` | eastmoney(chain) |
| MERGER_ACQUISITION | maEvents | `q()` | eastmoney(chain) |
| EMPLOYEE_COMP | employeeComposition | `q()` | eastmoney(chain) |
| INSTITUTIONAL_VISIT | institutionalVisits | `q()` | eastmoney(chain) |
| PEER_COMPANY | peerCompanies | `q()` | eastmoney(chain) |

---

## 三、BaseDriver 声明但不在 CAP_METHOD 的 2 个方法

| 方法 | 说明 |
|---|---|
| `batchRealtime` | 特殊用途 — 由 `QueryPlanExecutor` 直接调用, 不走 `queryScoped` 路由 |
| `chipProfile` | 复用 `CHIP_DISTRIBUTION` capability, Engine 用 `chipDistribution` cap 路由调用 |

---

## 四、Capability 枚举未注册 CAP_METHOD 的 2 个

| Capability | 说明 |
|---|---|
| `SECTOR_LIST` | zzshare 实现了 `sectorList`, 但未注册映射 |
| `TECH_INDICATOR` | Engine 中 `techIndicator()` 从 kline 计算, 不经过 provider 路由 |

---

## 五、单点 Provider (无回退)

以下方法仅由 1 个 provider 实现, 该 provider 故障时无替代:

| 方法 | 唯一 provider | 影响 |
|---|---|---|
| sectorMoneyFlow | eastmoney | 板块资金流不可用 |
| marginTrade | eastmoney | 融资融券不可用 |
| exchangeRate | eastmoney | 汇率不可用 |
| chipDistribution | eastmoney | 筹码分布不可用 |
| chipProfile | eastmoney | 筹码分布不可用 |
| etfData | eastmoney | ETF 列表不可用 |
| etfList | eastmoney | ETF 列表不可用 |
| etfProfile | eastmoney | ETF 概况不可用 |
| etfHoldings | eastmoney | ETF 持仓不可用 |
| etfNav | eastmoney | ETF 净值不可用 |

---

## 六、各 Provider 实现能力数

| Provider | handler.ts | research.ts | chain.ts | 合计独立方法 |
|---|:---:|:---:|:---:|:---:|
| eastmoney | 23 | 17 | 10 | 40 (含全部 BaseDriver + CAP_METHOD) |
| tushare | 17 | 0 | 0 | 17 |
| baostock | 17 | 0 | 0 | 17 |
| sina | 8 | 0 | 0 | 8 |
| netease | 7 | 0 | 0 | 7 |
| zzshare | 9 | 7 | 0 | 11 |
| tonghuashun | 13 | 0 | 0 | 13 |
| cninfo | 1 | 0 | 0 | 1 |
