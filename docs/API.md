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
| `screening` | — | 已停用（本地因子选股已移除） |
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
| `market_regime` | `profile_scope?` (`cn` / `us`) | 市况快照（发现页横幅）；`us` 基于 SPY 动量 stub |
| `instrument_profile` | InstrumentRef | 公司/标的概况事实表 |
| `instrument_financials` | InstrumentRef + `report_type?` / `report_date?` | 财务摘要多期 |
| `instrument_balance_sheet` | InstrumentRef + `report_date?` | 资产负债表多期 |
| `instrument_cash_flow` | InstrumentRef + `report_date?` | 现金流量表多期 |
| `instrument_income_statement` | InstrumentRef + `report_date?` | 利润表多期 |
| `instrument_financial_indicators` | InstrumentRef + `report` | 财务指标树（同花顺） |
| `instrument_shareholders` | InstrumentRef + `report_date?` | 股东结构 |
| `instrument_institution_holdings` | InstrumentRef + `scope?` / `org_type?` / `report_date?` / 分页 | A 股季报机构持仓一览/明细（eastmoney zlsj） |
| `instrument_dividend` | InstrumentRef + `page?` / `page_size?` | 分红历史 |
| `instrument_money_flow` | InstrumentRef | 个股资金流向 |
| `instrument_notices` | InstrumentRef + `page?` / `page_size?` | 标的公告列表 |
| `sector_list` | `market?` / `kind?` / `plate_type?` | 板块或行业目录 |
| `sector_constituents` | `board_key` 或 `industry_code` + 分页 | 板块/行业成分 |
| `etf_profile` | InstrumentRef / code | ETF 档案 |
| `market_session` | `market?` | 轻量交易时段状态 |
| `cn_market_special` | `kind` + 可选 code/date/tag… | A 股专题（连板天梯/飙升/热股/异动/同花顺概念目录；成分/财务指标用专用 feature） |
| `trade_calendar` | `year?` | A 股交易日历 |
| `macro_series` | `scope?` / `kind` / `page?` / `page_size?` | 宏观序列（中国 MACRO_INDICATOR；国外/行业/油价/翻页→eastmoney cjsj） |
| `index_constituents` | `index_code` / `code` | 指数/同花顺板块成分 |
| `dragon_tiger` | `date?` | 龙虎榜 |
| `limit_updown` | `date?` | 涨跌停池 |
| `market_sentiment` | `code?` | 市场情绪/个股热度 |
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
| POST | `/api/screen` | 410：本地筛选已移除 |
| POST | `/api/portfolio` | 组合分析 |
| POST | `/api/search` | `{ "keyword" }` |
| POST | `/api/signal` | `{ "code" }` |
| POST | `/api/strategy/report` | `{ "code" }` |
| POST | `/api/industry/mermaid` | `{ "industry" }` |
| GET | `/api/portfolio/trades` | `?code=` 可选 |
| GET | `/api/portfolio/summary` | 账本汇总 |
| GET | `/api/watchlist` | 关注列表（含 `items`；新客户端只读合并 `groups` + `membership`） |
| PUT | `/api/watchlist` | `{ items: WatchlistItem[] }` 全量替换关注项（**不**覆盖分组元数据） |
| GET | `/api/watchlist/groups` | 关注分组 `{ groups, membership }` |
| PUT | `/api/watchlist/groups` | 全量保存分组与成员关系 |
| POST | `/api/portfolio/trade` | `{ code, shares, price, side?, date? }` |
| GET | `/api/stock-analysis/:instrumentKey` | 个股分析最近一次报告（本地用户库；无则 `data: null`） |
| PUT | `/api/stock-analysis/:instrumentKey` | 写入/覆盖最近一次报告 `{ analyzedAt, raw }` |

### 个股分析存档

每只股票只保留**最近一次**完整分析结果（`documents` 命名空间 `stock_analysis`，id = `instrumentKey`，如 `CN:SH.600519`）。路径参数需 `encodeURIComponent`。

```http
GET /api/stock-analysis/CN%3ASH.600519
```

```json
{
  "success": true,
  "data": {
    "instrumentKey": "CN:SH.600519",
    "analyzedAt": "2026-07-22T14:30:00.000Z",
    "raw": {
      "evalData": {},
      "strategy": {},
      "institution": {},
      "cyq": {},
      "radar": {}
    }
  }
}
```

```http
PUT /api/stock-analysis/CN%3ASH.600519
Content-Type: application/json

{ "analyzedAt": "2026-07-22T14:30:00.000Z", "raw": { "evalData": null, "strategy": null, "institution": null, "cyq": null, "radar": null } }
```

### 关注列表与分组

关注项与分组元数据**分库存储**：`watchlist/default` 仅 `{ items }`；分组在 `preference/watchlist_groups` 为 `{ groups, membership }`。旧客户端 PUT `/api/watchlist` 只写 items，**不会**抹掉分组。

「全部」为 UI 虚拟筛选器，不落库。`membership` 的 key 为 `instrumentKey`（如 `CN:SH.600519`），value 为分组 id 数组（一项可属于多个分组）。

```http
GET /api/watchlist/groups
```

```json
{
  "success": true,
  "data": {
    "groups": [
      { "id": "g1", "title": "核心持仓", "sortOrder": 0, "createdAt": "2026-07-22T10:00:00.000Z" }
    ],
    "membership": {
      "CN:SH.600519": ["g1"]
    }
  }
}
```

```http
PUT /api/watchlist/groups
Content-Type: application/json

{
  "groups": [
    { "id": "g1", "title": "核心持仓", "sortOrder": 0 }
  ],
  "membership": {
    "CN:SH.600519": ["g1"],
    "US:AAPL": ["g1"]
  }
}
```

```http
GET /api/watchlist
```

响应在 `data.items` 之外，新客户端可读 `data.groups` 与 `data.membership`；旧客户端忽略未知字段即可。

### Instrument API（多市场统一）

按 `InstrumentRef` 消费，与 Hub `instrument_*` feature 等价。请求体可传嵌套 `instrument: { market, assetClass, symbol }`，或扁平 `market` + `symbol`（及可选 `assetClass`）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/instruments/search` | `?q=` / `?keyword=`、`limit`、`markets`（逗号分隔） |
| GET | `/api/instruments/summary` | 本地 instruments 各市场计数摘要 |
| POST | `/api/instruments/snapshot` | 单标的快照 |
| POST | `/api/instruments/quotes` | `{ instruments: InstrumentRef[] }` 批量报价 |
| POST | `/api/instruments/chart` | `{ instrument, period?, count? }` 日/周/月 K |
| POST | `/api/instruments/capabilities` | 返回 UI 能力矩阵（`detailPanelKind` 等） |

示例：

```json
POST /api/instruments/snapshot
{ "market": "JP", "assetClass": "EQUITY", "symbol": "7203" }
```

```json
POST /api/research
{ "feature": "instrument_quotes", "params": { "instruments": [{ "market": "US", "assetClass": "EQUITY", "symbol": "AAPL" }] } }
```

基本面事实表（`queryInstrumentData`，与 MCP `get_instrument_*` 对应）：

| feature | params | 说明 |
|---------|--------|------|
| `instrument_profile` | InstrumentRef | 公司/标的概况 |
| `instrument_financials` | InstrumentRef + 可选 `report_type` / `report_date` | 财务摘要多期 |
| `instrument_balance_sheet` | InstrumentRef + 可选 `report_date` | 资产负债表多期 |
| `instrument_cash_flow` | InstrumentRef + 可选 `report_date` | 现金流量表多期 |
| `instrument_income_statement` | InstrumentRef + 可选 `report_date` | 利润表多期 |
| `instrument_financial_indicators` | InstrumentRef + `report` | 财务指标树（同花顺） |
| `instrument_shareholders` | InstrumentRef + 可选 `report_date` | 股东结构 |
| `instrument_institution_holdings` | InstrumentRef + `scope`/`org_type`/`report_date`/分页 | A 股季报机构持仓（一览/明细 Tab/报告期；eastmoney zlsj） |
| `instrument_dividend` | InstrumentRef + 可选 `page` / `page_size` | 分红历史 |
| `instrument_money_flow` | InstrumentRef | 个股资金流向（主 CN） |
| `instrument_notices` | InstrumentRef + 可选 `page` / `page_size` | 标的公告列表（正文用 `notice_content`） |
| `cn_market_special` | `kind` + 按 kind 的 code/date/tag 等 | A 股专题（连板/热股/异动/同花顺概念目录；经 tonghuashun custom。指数成分→`index_constituents`，财务指标→`instrument_financial_indicators`） |
| `trade_calendar` | `year?` | A 股交易日历 |
| `macro_series` | `scope?` + `kind` + 可选 `page` / `page_size` / `limit` | 宏观事实序列（`MACRO_INDICATOR` + eastmoney cjsj：国外/行业/油价/翻页） |
| `index_constituents` | `index_code` | 指数成分（标准 INDEX_CONST + 同花顺回退） |
| `dragon_tiger` | `date?` | 龙虎榜 |
| `limit_updown` | `date?` | 涨跌停池 |
| `market_sentiment` | `code?` | 情绪/热度 |
| `sector_list` | `market?` / `kind?` / `plate_type?` | 板块或行业目录 |
| `sector_constituents` | `board_key` 或 `industry_code` + 分页 | 板块/行业成分股 |
| `etf_profile` | InstrumentRef / code | ETF 档案 |
| `market_session` | `market?` | 轻量交易时段（非完整日历） |

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

### 外部 MCP Server

用户可配置的外部 MCP（stdio / Streamable HTTP）。列表与写操作**永不回传明文密钥**（仅 `secretsConfigured` 布尔掩码）。执行路由：已启用且未 pause 的外部源按 `sortOrder` 优先；熔断/超时/429、远程 outputSchema 校验失败（如 JSON-RPC `-32602`）、缺 API Key 等鉴权错误后 failover 至下一外部源或本地 ToolRegistry（最终兜底）；降级结果可含 `_mcp.configHint` 指向设置页补密钥。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/mcp-servers` | `{ servers: PublicMcpServer[] }` |
| GET | `/api/mcp-servers/:id` | 单条公开视图 |
| POST | `/api/mcp-servers` | 创建（`title` + `transportConfig`；可选 `secrets` / `capabilityBindings`） |
| PATCH | `/api/mcp-servers/:id` | 更新启用/暂停/传输/绑定/密钥合入 |
| DELETE | `/api/mcp-servers/:id` | 删除配置并断开 |
| POST | `/api/mcp-servers/:id/test` | 探活（`tools/list`）；超时较长 |
| POST | `/api/mcp-servers/reorder` | `{ server_ids: string[] }` 重排优先级 |

`PublicMcpServer` 含：`id`/`title`/`enabled`/`paused`/`sortOrder`/`transport`/`endpointPreview`/`secretsConfigured`/`capabilityBindings`/`health`/`toolCount` 等。

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

工作区文件工具（`workspace` pack：`workspace_*` / `http_fetch` / `download_file` / `shell_platform_status` / `shell_run` / `shell_install` / `list_workspace_grants` 等）与会话文件夹授权见 [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp) 与下方 grants 路由。

**Shell（系统隔离）**：无独立 REST；经聊天 MCP 工具调用。`shell_run` / `shell_install` 在 OS 级沙箱中执行，路径仍受本会话 grants 约束。首次 `shell_run` / `shell_install` 需用户确认运行命令（`confirmation.kind === "shell_run"`，选项 `allow_once` / `allow_session` / `cancel`）；选 `allow_session` 后本会话内跳过重复运行确认（内存，会话删除失效）。`pip`/`npm` 安装**另**需用户确认联网（`confirmation.kind === "network_install"`，选项 `once` / `sticky` / `cancel`）；选 `sticky` 后本会话内跳过重复联网确认。`shell_platform_status` 无需确认，可在运行前探测 `ready` / `setup_hint` / `needs_elevation` / `can_auto_install` / `needs_linux_install` / `userns_restricted`（Linux deb 自动依赖、Ubuntu 一次 pkexec、Windows 一次 UAC、AppImage 内置组件等，见 [DESKTOP.md](./DESKTOP.md#命令隔离agent-shell)）。

### Workspace grants（会话文件夹授权）

按**会话**管理 Agent 可访问的本地根目录。列表时会确保存在默认工作区（`root_id: "default"`，路径为用户数据目录下 `agent-workspace/sessions/<sessionId>/`，`mode: "rw"`，`is_default: true`；**每会话隔离**）。额外授权由用户在聊天侧选择文件夹后写入；受保护路径（如用户库、`agent-privileges`、`sessions/` 容器目录本身等）不可授权。默认根不可删除。会话删除时服务端会清理该会话的 grants、写/删 sticky 策略、**命令运行 sticky** 与**联网安装 sticky**，并尽量删除 `sessions/<sessionId>/` 磁盘目录（`WorkspaceService.clearSession`）。本 REST 响应可含 `abs_path`（供 UI）；Agent 工具 `list_workspace_grants` 对默认工作区与用户数据根下路径脱敏，**不**把 `~/.opptrix` 根当作可访问目录暴露给模型（见 [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions/:id/workspace/grants` | `{ grants: WorkspaceGrant[] }` |
| POST | `/api/sessions/:id/workspace/grants` | 新增授权；body 见下 |
| DELETE | `/api/sessions/:id/workspace/grants/:grantId` | 按 grant `id` 移除；默认根返回 404 |

**POST body**

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string | **必填**，要授权的绝对路径 |
| `mode` | `"ro"` \| `"rw"` | 默认 `"ro"`；其它值按只读处理 |
| `label` | string | 可选显示名；缺省时用目录名 |

**成功响应示例**

```json
{
  "grants": [
    {
      "id": "…",
      "root_id": "default",
      "abs_path": "/Users/…/.opptrix/agent-workspace/sessions/<sessionId>",
      "mode": "rw",
      "label": "本对话工作区",
      "is_default": true
    }
  ]
}
```

```json
{ "grant": { "id": "…", "root_id": "grant_a1b2c3d4", "abs_path": "/path/to/folder", "mode": "ro", "label": "folder" } }
```

```json
{ "status": "removed" }
```

**错误**

| 状态码 | 场景 |
|--------|------|
| 400 | `path` 缺失；路径受保护或其它校验失败（`{ "error": "…" }`） |
| 404 | 会话不存在；DELETE 时 grant 不存在或试图删除默认根 |

前端客户端：`listWorkspaceGrants` / `addWorkspaceGrant` / `removeWorkspaceGrant`（`client-ui/src/api/client.ts`）。Agent 侧对应工具：`list_workspace_grants`（问可访问目录时首选）、`request_folder_access`（仅提示用户授权，不代替本 API）；`get_project_info` 已脱敏且不是授权清单。

## 错误

- HTTP 400：`{ "error": "..." }` 参数缺失或业务失败
- HTTP 404：未知 `/api/*` 路径
- 非 `/api` 路径：SPA fallback 返回 `index.html`
