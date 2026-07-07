# 网络补充（webfeed）API 覆盖

公开免费接口聚合 Provider，默认启用、优先级 50（回退层）。

## 数据源

| 来源 | 端点 | 能力 |
|------|------|------|
| 腾讯行情 | `qt.gtimg.cn` | 实时/批量、日周月 K 线、全球指数、汇率 |
| 新浪财经 | `hq.sinajs.cn` 等 | 实时、日 K 线、股票列表、涨跌家数、全球指数 |

## Capability 绑定

- `STOCK_REALTIME` / `INDEX_REALTIME` — 腾讯优先，新浪回退
- `STOCK_KLINE` / `INDEX_KLINE` — 腾讯日周月；新浪日 K（带日期过滤）
- `STOCK_LIST` / `MARKET_BREADTH` — 新浪
- `GLOBAL_INDEX` / `EXCHANGE_RATE` — 腾讯 + 新浪
- ETF 行情/K 线 — 复用 `cnEquityEtfIndex` 绑定

## 限制

- 非官方接口，可能限流或变更
- 不在 Provider 内自建串行/并发限制；由引擎负载均衡 + 熔断器管理
- 403/502 等 HTTP 错误不写入成功缓存；403 不触发 API Key 类永久权限屏蔽（走熔断冷却）
- 仅在上游要求时附加 Referer（如新浪）；UA 使用 Chrome（桌面端为 Electron 会话 UA），代用户浏览

## 测试

```bash
cd packages/a-stock-layer && npm run build
# 设置页 → 基础数据 → 网络补充 → 测试连接
```
