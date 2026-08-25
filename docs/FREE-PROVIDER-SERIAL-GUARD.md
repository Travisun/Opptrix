# 免费数据源串行保护机制

> **状态**：已落地（Hub 批内全开 + 主机闸门硬门槛）。  
> **相关**：[PROVIDER-STANDARD-API.md](./PROVIDER-STANDARD-API.md) §2.3、[DATA-LAYER.md](./DATA-LAYER.md)（有界队列）、[API.md](./API.md)（批量快照信封）。  
> **实现入口**：`HostnameRateLimiter`、`ProviderHttpClient`、`FreeProviderThrottle`、`collectParallelCnBatchItems`、`queryScoped`。

---

## 1. 目标与非目标

### 1.1 目标

| 目标 | 说明 |
|------|------|
| **护免费门户** | 降低对公开行情站的并发冲击，减少反爬与 IP 封禁 |
| **合规间隔** | 同一 hostname 上请求串行 + 最小间隔，形成可预期的出站节奏 |
| **部分失败可返回** | 批量快照允许部分成功；失败项进入 `failed[]`，供 Agent / LLM 继续决策，而非整批失败 |
| **换源不绕闸** | failover 到备用免费源时，仍走该源对应 host 的闸门与冷却 |

### 1.2 非目标

| 非目标 | 原因 |
|--------|------|
| 付费源套用同一套主机串行 | 付费 API 自带配额 / Key；走 `bypassRateLimit: true` |
| 单请求多源赛跑（hedged request） | 当前 `queryScoped` 为失败后串行换源，最多约 3 源；不做并行抢首个成功 |
| 用 Hub 层「人为限并发」代替主机闸门 | Hub 批内故意全开；真正硬门槛在 `HostnameRateLimiter` |

---

## 2. 分层架构

请求从 Hub / Agent 进入后，保护分散在多层；**只有最下层的主机闸门是全局硬门槛**。

```
Hub 批内（可不限并发）
  collectParallelCnBatchItems  →  Promise.all（上限 200）
        │
        ▼
Engine 选源
  LoadBalancer          →  偏向空闲 Provider（在途少 / 预计先释放）
  queryScoped           →  失败串行 failover（最多 3 次尝试）
  FreeProviderThrottle   →  冷却中则 skip，换下一源
        │
        ▼
Provider HTTP（硬门槛）
  ProviderHttpClient.throttled
        │  bypassRateLimit? ──yes──► 直接出站（付费 / 明示 bypass）
        │                  │ no
        ▼
  HostnameRateLimiter（全局单例）
  每 host：在途 1 + intervalMs + 有界排队
```

### 2.1 各层职责

| 层 | 符号 / 位置 | 行为 | 是否硬门槛 |
|----|-------------|------|------------|
| **Hub 批内** | `collectParallelCnBatchItems`（`research-hub`） | `Promise.all` 全开；切片上限 `BATCH_INSTRUMENT_SNAPSHOTS_MAX = 200` | 否（只裁剪规模） |
| **LoadBalancer** | `LoadBalancer.route` | 未满载选在途最少；全满载选预计先释放；冷启动轮询 | 软（调度偏好） |
| **queryScoped** | `MarketDataEngine.queryScoped` | 最多 **3** 次尝试；`pickNextDriver` 换未尝试源；空数据 / 校验失败 / 抛错后 continue | 串行 failover |
| **HostnameRateLimiter** | `hostnameLimiter` 单例 | **每 host 单在途** + `intervalMs`（默认 1000）+ `maxQueued`（默认 **512**） | **是** |
| **FreeProviderThrottle** | `FreeProviderThrottle` + SQLite | 429 / 封禁类触发后阶梯冷却；成功可复位 | 封禁后防护 |

要点：**Hub 全开并发 ≠ 同 host 多在途**。批内 200 个 Promise 会在 `hostnameLimiter` 排队；同一 hostname 仍串行出站。

### 2.2 Failover 与闸门

```
源 A（host X）失败 → pickNextDriver → 源 B（host Y）
                                      │
                                      ▼
                         仍走 B 的 ProviderHttpClient
                         → hostnameLimiter.acquire(Y)
```

- 换源**不**绕过 `HostnameRateLimiter`。
- 若 B 与 A 同 host（少见），仍受该 host 单在途约束。
- 若 B 处于 `FreeProviderThrottle` 冷却，`shouldSkipProviderQuery` 直接 skip，计入本轮尝试。

---

## 3. 谁算免费源

### 3.1 判定

```typescript
// packages/a-stock-layer/src/core/free-provider-throttle.ts
isFreeMarketDataProvider(providerId)
  ≡ !providerRequiresApiKey(manifest.settings.fields)
```

`providerRequiresApiKey`：settings 中存在 `type === 'secret'` 且 `required !== false` 的字段。

| 判定 | 含义 |
|------|------|
| **免费** | 无必填 secret → 适用阶梯冷却；HTTP 须 `bypassRateLimit: false` |
| **付费 / 需 Key** | 有必填 secret → 不进 `FreeProviderThrottle`；可按规范 bypass 主机闸门 |

### 3.2 典型名单（以 manifest 为准）

| 类别 | Provider | 主机闸门（现状） | 阶梯冷却判定 |
|------|----------|------------------|--------------|
| 免费 · 主路径合规 | `baostock` | TCP/SDK，**不经** `hostnameLimiter`；靠 `maxConcurrent: 1` | 是 |
| 免费 · 出口缺口 | `zzshare`（Key 可选，仍算免费） | 现经 `httpGetWithRetry` → `outboundFetch`，**绕过**主机闸门（待修） | 是（若错误被吞则冷却失效） |
| 付费可 bypass | `tushare` / `tickflow`（有 Key）/ `tonghuashun` | `ProviderHttpClient` + `bypassRateLimit: true` | 否 |
| 付费可 bypass | `tushare` / `tickflow` / `tonghuashun` | `bypassRateLimit: true` | 否 |
| 公开但当前 bypass | `binance` / `okx` | 当前为 `true`（加密货币公开 API；**不**按免费源阶梯冷却） | 判定为免费但不进冷却 |
| **已移除内置** | `tencent` / `eastmoney` / `sinafinance` / `akshare` / `webfeed` | 不再注册；实现已删除 | — |

新增 Provider 时：无必填 secret → **禁止** `bypassRateLimit: true`；HTTP 必须经 `ProviderHttpClient`。

---

## 4. 与批量快照的关系

### 4.1 Hub 批内全开

```typescript
// packages/research-hub/src/instrument-batch-router.ts
export const BATCH_INSTRUMENT_SNAPSHOTS_MAX = 200

collectParallelCnBatchItems(codes, fetchOne, max = BATCH_INSTRUMENT_SNAPSHOTS_MAX)
// → Promise.all(slice) —— 不在此层限流
```

注释约定：`HostnameRateLimiter.maxQueued`（**512**）须 ≥ 本值，以便同 host 全开时排队，而**不必**同 host 多在途。

### 4.2 部分失败信封

成功 items 保持输入相对顺序；失败另列。典型字段：

| 字段 | 含义 |
|------|------|
| `requested_count` | 调用方请求的标的数 |
| `attempted_count` | 实际尝试数（`min(requested, 200)`） |
| `items` | 成功快照（相对顺序） |
| `failed[]` | `{ code?, symbol?, reason }` 失败列表 |

部分失败时仍可 `success: true` 返回已拿到的数据（具体 feature 信封以 Hub / API 文档为准），便于 LLM 对失败项降级或换问法。

**`/instruments/quotes`（`routeInstrumentQuotes`）的实际信封**：`failed[]` 项为 `{ instrument, code, reason }`——`instrument` = `normalizeInstrumentRef(ref)`，`code` = `instrumentDisplayCode(ref)`，`reason` ∈ `no_provider`（无可用 Provider / 未启用，依据 `没有可用的 provider` / `暂无` 文案归类）| `unsupported`（JP/KR 暂未接入）| `empty`（Provider 返回空）| `error`（查询失败，拿不准一律归此类）| `not_found`（上游明确未收录，如扶摇 `code 3001 Fund not found`，匹配 `/not found/i` 文案归类）。US/HK/CRYPTO 组内有界并行（每块 ≤ 5），CN 个股/ETF/基金各自合并为一次批量调用。

### 4.3 `maxQueued` 与批量上限

| 常数 | 值 | 作用 |
|------|-----|------|
| `BATCH_INSTRUMENT_SNAPSHOTS_MAX` | **200** | 单批最多尝试标的数 |
| `hostnameLimiter.maxQueued` | **512** | 每 host 等待队列上限；覆盖 200 全开 + 同 host 其它请求余量 |
| `hostnameLimiter.intervalMs` | **1000** | 同 host 两次请求最小间隔（ms） |

队列满时 `acquire` **立即 reject**（错误含 `queue full` / `maxQueued=`），该标的进入 `failed[]`，不拖垮整批。

---

## 5. 不变量（硬性）

| # | 不变量 | 校验点 |
|---|--------|--------|
| I1 | **免费源禁止 `bypassRateLimit: true`** | `ProviderHttpClient` 构造；免费爬虫源必须 `false` |
| I2 | **同 host 禁止多在途** | `HostnameRateLimiter`：`busy === true` 时新请求只入队，不并行出站 |
| I3 | **换源不绕过闸门** | failover 后仍经目标 Provider 的 `throttled` → `hostnameLimiter` |
| I4 | **封禁类错误须上抛到引擎** | 触发 `FreeProviderThrottle.recordTrigger`；禁止 Handler 吞掉后假成功 |
| I5 | **业务空结果不进长冷却** | `recordProviderQueryEmpty` 仅软失败换源；与 HTTP 空响应体（`empty_response_body`）区分 |

违反 I1–I3 会导致：同站突发、封禁扩散、或「看起来换源了其实仍打爆同一门户」。

---

## 6. 关键常数速查

| 名称 | 值 | 文件 |
|-----|-----|------|
| `BATCH_INSTRUMENT_SNAPSHOTS_MAX` | 200 | `packages/research-hub/src/instrument-batch-router.ts` |
| `hostnameLimiter.intervalMs` | 1000 | `packages/a-stock-layer/src/providers/common/rate-limiter.ts` |
| `hostnameLimiter.maxQueued` | 512 | 同上 |
| `queryScoped` 最大尝试 | 3 | `packages/a-stock-layer/src/engine.ts` |
| 阶梯冷却（level 1–6） | 5m / 10m / 30m / 1h / 2h / 3h | `packages/shared/src/free-provider-throttle.ts` |
| 其后步进 | +6h，触顶逻辑见 `freeProviderThrottleCooldownMs` | 同上 |
| 触发状态码 | 400 / 403 / 429 / ≥500（及文案匹配） | `isFreeProviderThrottleTrigger` |
| 慢工具墙钟 | `MCP_SLOW_TOOL_CALL_TIMEOUT_MS = 900_000`（含 `batch_instrument_snapshots`） | `packages/agent/src/mcp/broker.ts` |

---

## 7. 已知限制与审计结论

### 7.1 总评（2026-08-22 审计）

| 范围 | 结论 |
|------|------|
| **内置免费源（baostock / zzshare）+ Hub 批开 + LoadBalancer + failover** | **有条件合规**：批内全开依赖主机排队；见下方出口缺口 |
| **已移除爬虫源** | `tencent` / `sinafinance` / `eastmoney` / `akshare` 不再内置注册，不适用本机制 |

### 7.2 必须关注的缺口

| 严重性 | 缺口 | 说明 |
|--------|------|------|
| **高** | `zzshare` HTTP 绕过闸门 | `httpGetWithRetry` 直连 `outboundFetch`；`withClient` 可能吞错导致冷却失效 |
| **中** | announcement 等旁路 `bypassRateLimit: true` | 可能与同 host 免费源并行出站 |
| **低** | baostock TCP | 设计上不经 hostname；依赖 `maxConcurrent: 1` |

### 7.3 设计层面的已知限制

| 限制 | 说明 |
|------|------|
| 单请求非多源赛跑 | 失败后串行换源；不并行打多个免费源抢首个成功 |
| 工具墙钟仍在 | 慢工具（含批量快照）900s；排队过久仍可能工具超时 |
| binance / okx bypass | 公开行情但当前 bypass；若纳入主机串行须改配置并回归 |
| Hub 不再做批内限并发 | 依赖主机闸门；调小 `maxQueued` 会导致大批量 `queue full` |

**可选后续**（非承诺）：将 zzshare 迁入 `ProviderHttpClient`；按 Provider 配置 interval；非 HTTP 源统一适配器闸门；慢工具超时与排队深度联动提示。

---

## 8. 维护指引

1. 改 `BATCH_INSTRUMENT_SNAPSHOTS_MAX` 时，确认 `maxQueued ≥` 新上限（建议保留余量）。  
2. 新增免费 HTTP Provider：必须经 `ProviderHttpClient`，默认 `bypassRateLimit: false`，封禁类错误上抛（`rethrowIfFreeProviderThrottleTrigger`）。  
3. 实现细则与 Handler 契约见 [PROVIDER-STANDARD-API.md §2.3](./PROVIDER-STANDARD-API.md)。  
4. 有界队列与其它限流组件总览见 [DATA-LAYER.md](./DATA-LAYER.md)「有界队列」段。  
5. 加固闸门出口后，同步更新 §3.2 / §7.2，避免文档仍写「必须走 limiter」而实现未接。
