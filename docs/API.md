# API 参考

浏览器访问 **http://127.0.0.1:5173**，API 路径 `/api/*` 由 Vite 代理到后台（默认 `127.0.0.1:8711`）。直接调 API 示例：`curl http://127.0.0.1:8711/api/health`

## 通用响应

### `GET /api/health`

```json
{
  "status": "ok",
  "version": "0.6.0",
  "runtime": "node",
  "llm_configured": true,
  "model": "deepseek-chat",
  "scorecard": "综合评估",
  "tools": 19,
  "factors": 40
}
```

### `POST /api/research`

统一 feature 调度。

**请求**

```json
{
  "feature": "stock_diagnosis",
  "params": { "code": "600519", "scorecard": "综合评估" }
}
```

**响应**

```json
{
  "success": true,
  "feature": "stock_diagnosis",
  "data": { },
  "message": "贵州茅台(600519) 综合评分 82.5",
  "elapsed": 1234
}
```

## Hub Features

| feature | params | 说明 |
|---------|--------|------|
| `stock_diagnosis` | `code`, `scorecard?` | 个股因子诊断 |
| `institution_rating` | `code`, `groups?` | 机构评级 JSON |
| `institution_report` | `code`, `groups?` | 机构评级文本报告 |
| `screening` | `conditions`, `scorecard?`, `top_n?` | 条件选股 |
| `strategy_signal` | `code` | 单股策略信号 |
| `strategy_verify` | `code`, `strategy`, `days?` | 策略历史验证 |
| `strategy_verify_report` | 同 verify | 格式化验证报告 |
| `strategy_report` | `code` | 策略综合分析报告 |
| `portfolio_analysis` | `holdings`, `scorecard?` | 组合因子分析 |
| `portfolio_trades` | `code?` | 交易记录列表 |
| `portfolio_summary` | — | 账本汇总 |
| `industry_mining` | `industry` | 产业透视文本 |
| `industry_mermaid` | `industry` | 产业链 Mermaid |
| `market_report` | `type?` (`closing` / `morning`) | 市场报告 |
| `search_stocks` | `keyword` | 股票搜索 |
| `backtest` | 见 hub 实现 | 因子回测 |
| `latest_evaluation` | `code`, `scorecard?`, `force?` | 最近评估；默认 `G=B+M`，返回 `gbm` B/M 子分 |
| `market_regime` | — | 市况快照（发现页横幅）；见 [RIGHT-PANEL-RESEARCH-PLAN.md](./RIGHT-PANEL-RESEARCH-PLAN.md#市况判断-market_regime--外部宏观期权数据源后续) 待办 |
| `writer_fetch` | `code`, `type?` | 写作数据采集 |
| `writer_types` | — | 文章类型 |
| `writer_prompt` | `code`, `type?`, `persona?` | 生成 Prompt |
| `writer_personas` | — | 写作人格列表 |
| `writer_format` | `markdown`, `theme?` | HTML 排版 |
| `writer_publish` | `markdown`, … | 推送微信草稿 |
| `writer_config` | — | 读取 Writer 配置 |
| `writer_config_save` | 配置字段 | 保存 Writer 配置 |
| `writer_history` | `limit?` | 写作历史 |
| `writer_themes` | — | 排版主题 |

## REST 快捷端点

与 Hub 等价或薄封装的 HTTP 路由：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 公开配置（不含明文 API Key） |
| POST | `/api/config` | 保存 LLM / 默认评分卡 |
| GET | `/api/templates` | 评分卡模板列表 |
| POST | `/api/chat` | `{ "message": "..." }` Agent 对话 |
| POST | `/api/evaluate` | `{ "code", "scorecard?" }` |
| POST | `/api/screen` | 选股 |
| POST | `/api/portfolio` | 组合分析 |
| POST | `/api/search` | `{ "keyword" }` |
| POST | `/api/signal` | `{ "code" }` |
| POST | `/api/strategy/report` | `{ "code" }` |
| POST | `/api/industry/mermaid` | `{ "industry" }` |
| GET | `/api/portfolio/trades` | `?code=` 可选 |
| GET | `/api/portfolio/summary` | 账本汇总 |
| POST | `/api/portfolio/trade` | `{ code, shares, price, side?, date? }` |

### 新闻订阅（RSS / RSSHub）

服务端通过 `@opptrix/news-feed` 拉取并缓存订阅源；浏览器不直连第三方 feed。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/news/settings` | `{ settings: { refresh_interval_min, retention_years, max_articles } }` |
| PUT | `/api/news/settings` | 保存刷新间隔、保留年限（默认 3 年）、文章数量上限（null=不限） |
| GET | `/api/news/subscriptions` | 订阅列表 |
| PUT | `/api/news/subscriptions` | `{ subscriptions: FeedSubscription[] }` 全量保存 |
| DELETE | `/api/news/subscriptions/:id` | 删除单条 |
| POST | `/api/news/subscriptions/item` | `{ url, title?, enabled? }` 验证并添加 |
| POST | `/api/news/validate` | `{ url, title? }` 添加前探测 |
| GET | `/api/news/feed` | `?limit=20&cursor=&subscription_id=&group_id=` 分页（默认 20 篇） |
| GET | `/api/news/feed/grouped` | 按自定义分组 / 来源聚合的本地文章 |
| GET | `/api/news/groups` | 订阅分组列表 |
| POST | `/api/news/groups` | `{ title }` 新建分组 |
| PUT | `/api/news/groups/:id` | 重命名 / 排序 |
| DELETE | `/api/news/groups/:id` | 删除分组（订阅移至未分组） |
| PUT | `/api/news/subscriptions/:id/group` | `{ group_id }` 移动订阅 |
| GET | `/api/news/articles/:id` | 单篇文章 |
| POST | `/api/news/refresh` | 强制刷新全部 enabled 源 |

订阅地址须为完整 `http(s)://` 链接。文章持久化在本地 SQLite，默认保留 **3 年内**按 `pub_date` 排序的文章；可在设置中调整保留年限与数量上限（不限上限时仅按年限清理）。写入超出策略时自动删除最旧文章。

### Writer 端点

| 方法 | 路径 |
|------|------|
| POST | `/api/writer/fetch` |
| GET | `/api/writer/types` |
| GET | `/api/writer/personas` |
| POST | `/api/writer/prompt` |
| POST | `/api/writer/format` |
| POST | `/api/writer/publish` |
| GET/POST | `/api/writer/config` |
| GET | `/api/writer/history` |
| GET | `/api/writer/themes` |

## Agent

`POST /api/chat` 使用 `@opptrix/agent` 的 `AgentEngine`，内置 tools 调用同一 `ResearchHub`。

常用 slash 命令（在 message 中）：`/diagnose`, `/screen`, `/institution`, `/signal`, `/portfolio`, `/writer` 等，详见 `packages/agent/src/engine.ts`。

## 错误

- HTTP 400：`{ "error": "..." }` 参数缺失或业务失败
- HTTP 404：未知 `/api/*` 路径
- 非 `/api` 路径：SPA fallback 返回 `index.html`
