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
| `news_center_status` | — | 资讯中心状态（刷新/订阅规模/文章总量） |
| `news_groups_list` | — | 资讯分组列表 |
| `news_sources_list` | — | 订阅来源列表 |
| `news_articles_list` | `view` + `group_id`/`subscription_id` + `limit?` | 本地订阅文章列表 |
| `news_article_detail` | `article_id` | 单篇正文 |
| `news_source_validate` | `url`, `title?` | 添加前探测（不写入） |
| `news_source_add` | `url`, `title?`, `group_id?`, `enabled?` | 验证并添加订阅 |
| `news_source_delete` | `subscription_id` | 删除订阅（Agent 工具层须 `confirmed=true`） |
| `news_sources_import` | `schema_version` + `subscriptions`（或仅数组） | 批量导入（Agent 工具层须 `confirmed=true`） |
| `news_group_create` | `title` | 新建资讯分组 |
| `news_group_update` | `group_id` + `title?`/`sort_order?` | 重命名 / 排序 |
| `news_group_delete` | `group_id` | 删分组（订阅改未分组；Agent 须 `confirmed=true`） |
| `news_source_move_group` | `subscription_id`, `group_id?` | 移动订阅分组（空=`未分组`） |
| `notice_content` | `url`, `max_chars?` | 公告/披露正文（HTML/PDF） |
| `cn_market_special` | `kind` + 可选 code/date/tag… | A 股专题（连板天梯/飙升/热股/异动/同花顺概念目录；成分/财务指标用专用 feature） |
| `trade_calendar` | `year?` | A 股交易日历 |
| `macro_series` | `scope?` / `kind` / `page?` / `page_size?` | 宏观序列（中国 MACRO_INDICATOR；国外/行业/油价/翻页→eastmoney cjsj） |
| `index_constituents` | `index_code` / `code` | 指数/同花顺板块成分 |
| `market_dynamics` | — | 市场全景（指数/全球/涨跌榜/龙虎榜）；启用同花顺时可选 `cn_limit_up` / `cn_skyrocket` / `cn_limit_ladder` |
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
| GET | `/api/providers/presets` | 大模型提供商预置列表（有序：中国 → 海外 → 本地 Ollama → 自定义；`base_url` 为完整兼容根，优先 models.dev 缓存否则静态 fallback，运行时不自动补 `/v1`；含 `region`） |
| POST | `/api/providers/discover-models` | `{ base_url, api_key }`：对 `{base_url}/models` 探测拉模型（`base_url` 原样拼接，不补 `/v1`） |
| GET | `/api/templates` | 评分卡模板列表 |
| POST | `/api/chat` | `{ "message": "..." }` Agent 对话 |
| POST | `/api/evaluate` | `{ "code", "scorecard?" }` |
| POST | `/api/screen` | 410：本地筛选已移除 |
| POST | `/api/portfolio` | 组合分析 |
| POST | `/api/search` | `{ "keyword" }` |
| POST | `/api/signal` | `{ "code" }` |
| POST | `/api/strategy/report` | `{ "code" }` |
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
| `market_dynamics` | — | 市场全景；同花顺启用时附加涨停池/飙升榜/连板天梯（`cn_limit_*` / `cn_skyrocket`） |
| `dragon_tiger` | `date?` | 龙虎榜 |
| `limit_updown` | `date?` | 涨跌停池 |
| `market_sentiment` | `code?` | 情绪/热度 |
| `sector_list` | `market?` / `kind?` / `plate_type?` | 板块或行业目录 |
| `sector_constituents` | `board_key` 或 `industry_code` + 分页 | 板块/行业成分股 |
| `etf_profile` | InstrumentRef / code | ETF 档案 |
| `market_session` | `market?` | 轻量交易时段（非完整日历） |

服务端通过 `@opptrix/news-feed` 拉取并缓存订阅源；浏览器不直连第三方 feed。Agent 聊天工具（`news` pack：`add_news_source` / `delete_news_source` / `import_news_sources` / `create_news_group` 等）经同一 ResearchHub `news_*` feature 调度，与下表 REST 共用存储；破坏性写操作的确认纪律见 [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/news/settings` | `{ settings: { refresh_interval_min, retention_years, max_articles } }` |
| PUT | `/api/news/settings` | 保存刷新间隔、保留年限（默认 3 年）、文章数量上限（null=不限） |
| GET | `/api/news/subscriptions` | 订阅列表 |
| PUT | `/api/news/subscriptions` | `{ subscriptions: FeedSubscription[] }` 全量保存 |
| DELETE | `/api/news/subscriptions/:id` | 删除单条 |
| POST | `/api/news/subscriptions/item` | `{ url, title?, enabled?, group_id? }` 验证并添加 |
| POST | `/api/news/subscriptions/import` | `{ schema_version, subscriptions }` 批量导入（已存在 url 跳过） |
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
| GET | `/api/news/multimodal/status` | 多模态运行时状态（ffmpeg、SenseVoice 就绪、`canEnrich*`、`sensevoiceEnsure` 任务快照） |
| POST | `/api/news/multimodal/sensevoice/ensure` | **立即返回** `{ ok, started, job }`；后台准备语音模型。请轮询 GET 同路径直至 `job.phase` 为 `ready` / `error` |
| GET | `/api/news/multimodal/sensevoice/ensure` | 查询 ensure 任务：`{ job: { phase, percent, message, ready, … } }` |
| POST | `/api/news/multimodal/whisper/ensure` | **已废弃**；代理到 `sensevoice/ensure`（同样异步 job） |
| GET | `/api/news/multimodal/whisper/ensure` | **已废弃**；代理到 SenseVoice ensure 状态 |
| GET | `/api/news/articles/:id/enrichment` | 文章 enrichment 结果 |
| POST | `/api/news/articles/:id/enrich` | 触发 enrichment；返回 `{ job_id }` |
| GET | `/api/news/enrichment/jobs/:jobId` | 查询 enrichment 任务进度 |

**新闻 enrichment 音视频**

- 转写引擎：**SenseVoice q8**（设置字段 `offline_whisper_model` 保留兼容；旧值 `tiny`/`base`/… 归一化为 `q8`）。
- 模型加载：**内置（安装包）→ `~/.opptrix/sensevoice/models` → 按需下载**。
- **ensure 为异步 job**：`POST …/sensevoice/ensure` 不阻塞下载；客户端用短超时启动后轮询 `GET` 同路径（或 `status.sensevoiceEnsure`）。设置保存时的后台 bootstrap 与显式 ensure **共用同一 job**，不会双开下载。
- `job.phase`：`idle` → `preparing` → `downloading` → `ready` | `error`；含 `percent` / `message`（产品级文案）。

### 沙盒环境设置

命令隔离（`opptrix_run`）的**永久出站白名单**、局域网策略，以及 Windows **隔离强度**（`windows_isolation_mode`：`elevated` 完整隔离 / `unelevated` 基础隔离，默认 `unelevated`）。持久化于用户 SQLite：`preference` / `sandbox_settings`。运行时与部署环境变量 `OPPTRIX_SHELL_ALLOWED_DOMAINS`（逗号分隔，支持 `*.example.com`）**并集**合并；命中合并白名单的目标免弹出站确认（仍受 SSRF / LAN 策略约束）。设置页入口：**设置 → 沙盒环境**。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings/sandbox` | 读取当前设置 |
| GET | `/api/settings/sandbox/status` | 命令隔离环境自检（就绪 / 组件 / 是否开启） |
| PUT | `/api/settings/sandbox` | 校验并保存（归一化后写入 SQLite） |

**GET 响应**

```json
{
  "settings": {
    "allowed_domains": ["example.com", "*.example.com"],
    "allow_lan_access": false,
    "windows_isolation_mode": "unelevated"
  }
}
```

**GET `/api/settings/sandbox/status` 响应**

```json
{
  "status": {
    "platform": "linux",
    "supported": true,
    "sandbox_available": true,
    "ready": false,
    "message": "首次使用命令隔离需要一次系统授权；运行命令时将自动请求，也可稍后在设置中重试",
    "setup_hint": "首次使用命令隔离需要一次系统授权；运行命令时将自动请求，也可稍后在设置中重试",
    "needs_linux_install": true,
    "can_auto_install": true,
    "needs_elevation": true,
    "windows_isolation_mode": "unelevated",
    "network_isolation_level": "basic"
  }
}
```

> 注：缺 `windows_isolation_mode` 或非法值时服务端 normalize 为 `unelevated`（产品默认基础隔离）；已显式保存为 `elevated` 的配置保持不变。`network_isolation_level` 为用户向字段：`full` / `basic` / `none`。
>
> **Windows 两种模式（与 Codex 对齐）**：
> - `unelevated`（基础隔离，默认）：RestrictedToken 降权启动；**不**初始化 SRT/WFP、不要求隔离凭据。网络限制更弱（出站靠确认/白名单）；若请求与 elevated 同等的完整网络隔离则硬拒绝。
> - `elevated`（完整隔离）：走系统级沙箱运行时（架构：SRT / `srt-win` + 网络过滤器）。首次可能需一次系统授权；凭据失效（错误 **1326 / 1312**）时最多自动刷新再执行一次。

**`status` 字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | string | `macos` / `linux` / `windows` / `unknown` |
| `supported` | boolean | 当前 OS 是否支持命令隔离 |
| `sandbox_available` | boolean | 命令隔离是否已开启（完整隔离路径指运行时是否启用；基础隔离仍可为 true） |
| `ready` | boolean | 总体就绪（依赖齐全且平台安装步骤已完成；基础隔离下不要求完整隔离凭据） |
| `message` | string | 面向用户的摘要说明（不含路径） |
| `setup_hint` | string? | 可选；设置引导文案 |
| `missing_dependencies` | string[]? | 可选；缺失或未就绪的组件（诊断用，UI 一般不直出） |
| `needs_windows_install` | boolean? | Windows：完整隔离尚未配置（基础隔离下为 false） |
| `needs_linux_install` | boolean? | Linux：AppArmor / userns 等尚未配置 |
| `can_auto_install` | boolean? | 桌面版可触发一次系统授权（UAC / pkexec） |
| `needs_elevation` | boolean? | 需用户批准提升权限一次 |
| `userns_restricted` | boolean? | Linux：内核限制非特权 user namespace（如 Ubuntu 24.04+） |
| `windows_isolation_mode` | string? | Windows：`elevated`（完整隔离）/ `unelevated`（基础隔离） |
| `network_isolation_level` | string? | 用户向：`full` / `basic` / `none`（基础隔离通常为 `basic`） |

设置页状态卡消费本端点；`needs_elevation` + `can_auto_install` 为真时显示「完成设置」（桌面版 IPC）。

**PUT body**（字段均可选；缺省沿用当前值或默认）

| 字段 | 类型 | 说明 |
|------|------|------|
| `allowed_domains` | string[] | 域名或 IP 列表；支持 `*.example.com` 通配 |
| `allow_lan_access` | boolean | 默认 `false`；为 `false` 时拒绝保存 localhost / 私网条目 |
| `windows_isolation_mode` | string | 可选；`elevated` \| `unelevated`；缺省/非法值 normalize 为 `unelevated`；非 Windows 仍可持久化，运行时忽略 |

**PUT 成功**：`{ "settings": { allowed_domains, allow_lan_access, windows_isolation_mode } }`（域名去重、小写、去尾点）

**PUT 失败（400）**：`{ "error": "…", "invalid_lines"?: string[] }`

- 请求体无效
- 域名格式非法（`invalid_lines` 列出原行）
- `allow_lan_access=false` 且列表含 localhost / 私网地址
- `windows_isolation_mode` 非 `elevated` / `unelevated`

**会话级局域网（无独立 REST）**：除全局 `allow_lan_access` 外，单对话可通过 Agent 工具 `request_session_lan_access` 或 `ask_user`（选项 `allow_lan_session`）在内存中授权（`SessionLanAccessStore`）；**可覆盖**全局关闭，**不写回**本 API 的 settings。有效 LAN = 全局 **OR** 本对话；`clearSession` 清除会话授权。LAN 仅影响私网/localhost 连接判定，具体 host 仍可能需出站确认。详见 [AGENT-GUIDE.md · 会话局域网](./AGENT-GUIDE.md#会话局域网与全局设置)。

Shell 运行时出站确认（`sandboxAskCallback` / `confirmation.kind === "network_egress"`）见下方 Shell 说明与 [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)。

### Python 环境设置

运行 Python 脚本与 `pip` 安装依赖时的解释器选择与镜像源。持久化于用户 SQLite：`preference` / `python_settings`。设置页入口：**设置 → Python 环境**。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings/python` | 读取当前设置 |
| GET | `/api/settings/python/status` | 探测系统 / Opptrix 托管 Python 与当前采用源 |
| PUT | `/api/settings/python` | 校验并保存镜像列表与优先托管开关 |
| POST | `/api/settings/python/install` | 启动托管 Python 安装（幂等：进行中返回当前 job） |
| GET | `/api/settings/python/install` | 查询安装任务状态与进度 snapshot |

**GET `/api/settings/python/status` 响应（摘要）**

```json
{
  "status": {
    "active_source": "system",
    "ready": true,
    "recommend_install": false,
    "message": "已检测到系统 Python，可直接运行脚本与安装依赖。"
  }
}
```

**PUT body**

| 字段 | 类型 | 说明 |
|------|------|------|
| `pip_index_urls` | string[] | pip 镜像 URL 列表（首个用于 `PIP_INDEX_URL`） |
| `prefer_opptrix_python` | boolean | 默认 `true`；运行时只要托管已安装即优先采用（存量 `false` 会迁移为 `true`） |

**GET `/api/settings/python/install` 响应（摘要）**

```json
{
  "job": {
    "state": "running",
    "message": "正在下载 Python 安装包…",
    "accepted": true,
    "phase": "download",
    "percent": 35,
    "bytes_downloaded": 5242880,
    "bytes_total": 15728640,
    "steps": ["准备安装", "下载安装包", "解压文件", "配置环境", "安装 pip", "验证安装"],
    "error": null
  }
}
```

`POST /api/settings/python/install` 在安装进行中再次调用时返回当前 job（幂等）。

### 市场数据包（导出 / 导入）

本地市场库 `.opmd` 打包可能较久，**导出主路径为异步 job**（避免单次 HTTP 卡数分钟无反馈）。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/market-data/export/jobs` | 启动导出；body 可选 `{ "pack": "us"\|"crypto"\|… }`；立即返回 `job_id` |
| GET | `/api/market-data/export/jobs/:id` | 查询进度（`queued`/`running`/`ready`/`failed`） |
| GET | `/api/market-data/export/jobs/:id/download` | `ready` 后下载临时文件（短超时） |
| GET | `/api/market-data/export` | **兼容旧客户端**的同步导出（可能较长；新 UI 勿用） |
| POST | `/api/market-data/package/inspect` | 校验上传的 `.opmd`（`Content-Type: application/octet-stream`） |
| POST | `/api/market-data/import` | 导入 `.opmd` 覆盖/合并本地库（octet-stream） |

**轮询**：`POST .../export/jobs` → 每 1–2s `GET .../jobs/:id` → `status=ready` 后 `GET .../download`。

### 研报库设置（无图 Hybrid RAG）

**当前主路径**：文档 parse + embed 就绪后，Agent 经 `search_library`（`searchHybrid`，FTS ⊕ 向量，`scope=library`）跨会话检索，再 `read_document(document_id)` 多跳精读；语义模型未就绪时自动降级关键词检索（FTS）。**无需建图、不依赖主题关联图**。

**关联图已硬删（不再提供）**：主题关联图生成 / 进度看板 / 图检索与相关设置字段均已移除。下列端点与能力**不再提供**：

| 已移除 | 说明 |
|--------|------|
| `GET` / `PATCH` `/api/settings/doc-library` | 含 `generateForReports` / `generateForNews` / `graph.modelRef` |
| `GET` `/api/settings/doc-library/status` | 关联进度看板 |
| `POST` `/api/settings/doc-library/association/requeue` | 深度关联重入队 |
| `GET` `/api/doc-library/graph/search` | 主题社区图检索 |
| SQLite 图表 | `entities` / `edges` / `graph_jobs` / `graph_communities` / `graph_community_*`（doc-library schema **v5 DROP**） |
| 历史列 | `documents.llm_graph_at`（doc-library schema **v6 删除列**） |

设置页无关联 UI。跨会话/全库检索请用 Agent 工具 `search_library` → `read_document`。

### 语义检索模型（文档库）

本地语义检索（Hybrid RAG 向量侧）。与桌面内置策略一致：**桌面安装包默认内置** multilingual-e5-small（`resources/llms/multilingual-e5-small/`）；运行时优先内置 → 用户目录 `~/.opptrix/llms/`（兼容旧 `~/.opptrix/models/`）→ 开发态按需下载。未就绪时 `search_document` / `searchHybrid` / `search_library` 自动降级为 FTS，不中断对话。用户可见文案使用「语义检索模型」，勿暴露内部引擎名。

安装为**异步任务**（对照托管 Python）：`POST …/install` **立即返回**并在后台下载；客户端用默认短超时（约 10s）即可，**勿再 await 完整下载**。轮询 `GET …/semantic-model`（或 `GET …/install`）查看 `phase` / 进度。安装成功后按需 `tryEnable`，向量回填延后执行（非 boot 阻塞）。旧客户端若仍长超时 await POST，会立刻拿到 `{ ok, started, job }`，须改为轮询。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings/semantic-model` | `{ installed, label, source?, phase, progress, message, error, job }`；`phase`: `idle` \| `downloading` \| `enabling` \| `ready` \| `error` |
| GET | `/api/settings/semantic-model/install` | `{ job }` 安装任务快照（与上同源） |
| POST | `/api/settings/semantic-model/install` | 启动后台下载；立即 `{ ok: true, started: true, job }`；已在 downloading/enabling 时返回当前 job，不双开 |
| POST | `/api/settings/semantic-model/uninstall` | 同步：删除用户目录模型副本并卸载运行时后端（不删安装包内置） |

**GET 响应示例（空闲未装）**

```json
{
  "installed": false,
  "label": "语义检索模型",
  "source": "missing",
  "phase": "idle",
  "progress": { "file": null, "receivedBytes": 0, "totalBytes": null, "percent": 0 },
  "message": "尚未安装语义检索模型。可在设置中一键安装。",
  "error": null
}
```

**POST /install 响应示例**

```json
{
  "ok": true,
  "started": true,
  "job": {
    "phase": "downloading",
    "message": "正在下载语义检索模型…",
    "accepted": true,
    "started": true,
    "percent": 1,
    "file": null,
    "receivedBytes": 0,
    "totalBytes": null,
    "error": null,
    "installed": false,
    "label": "语义检索模型",
    "source": "missing"
  }
}
```

**GET 响应示例（已就绪）**

```json
{ "installed": true, "label": "语义检索模型", "source": "bundled", "phase": "ready", "progress": { "file": null, "receivedBytes": 0, "totalBytes": null, "percent": 100 }, "message": "语义检索已就绪", "error": null }
```

### 研报整理引擎（Parse Router）

按格式选引擎：文本（`text-l0`）/ Office（`office-l0`，`.docx` / `.doc` / `.pptx` / `.ppt`）/ PDF（`pdf-extract-l0`，弱文本或深度整理时升 `ocr-l2`）/ 图片直 OCR（`ocr-l2`；未就绪时友好失败）。引擎不可用则保留最佳结果。用户文案用「深度整理」，勿暴露引擎专名 / 绝对路径。支持扩展名：`.txt` `.md` `.docx` `.doc` `.pptx` `.ppt` 图片与 `.pdf`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings/parse-engines` | `{ deep, semantic }`；`deep` 含可用性与 `job`（phase / progress / message），无路径字段给 UI |
| GET | `/api/settings/parse-engines/deep/prepare` | `{ job }` 准备任务快照（与上 `deep.job` 同源） |
| POST | `/api/settings/parse-engines/deep/prepare` | 启动后台下载；立即 `{ ok: true, started: true, job }`；已在 downloading 时返回当前 job，不双开；客户端用默认 10s 超时，勿阻塞等下载完成 |
| POST | `/api/settings/parse-engines/deep/mark-ready` | 同步再跑一次 prepare（兼容旧客户端） |
| POST | `/api/settings/parse-engines/deep/uninstall` | 移除用户目录深度整理模型副本（不删安装包内置模型） |

`GET /api/settings/parse-engines` 的 `deep` 含 `source: 'bundled' \| 'user' \| 'missing'`（与语义模型一致）；`job.phase`: `idle` \| `downloading` \| `ready` \| `error`。旧 `layout/*` 路由仍可达但返回「已停用」。

**POST /deep/prepare 响应示例**

```json
{
  "ok": true,
  "started": true,
  "job": {
    "phase": "downloading",
    "message": "正在准备扫描件文字识别…",
    "accepted": true,
    "started": true,
    "percent": 1,
    "file": null,
    "receivedBytes": 0,
    "totalBytes": null,
    "error": null,
    "available": false,
    "installed": false,
    "label": "扫描件识别",
    "source": "missing"
  }
}
```

入库选项（服务层 `ingestFromAttachment`）：`deepParse?: boolean`、`forceEngine?: 'text-l0' \| 'office-l0' \| 'pdf-extract-l0' \| 'ocr-l2' \| 'rapidocr-l2' \| 'unlimited-ocr-l2'`（后二者为兼容别名）。

许可与依赖（开发者）：见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

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

### 工作流技能 / Agent Skills

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agent-skills` | `{ skills: [{ name, description, source, references?, … }] }` |
| GET | `/api/agent-skills/:name` | `{ skill }` 含正文 `body` |
| POST | `/api/agent-skills` | 创建：`{ name, description, body, references?, files?: [{ path, content }], … }` → 201 |
| POST | `/api/agent-skills/import` | `{ markdown }` 导入完整技能说明 → 201 |
| POST | `/api/agent-skills/:name/fork` | 将**内置**技能复制为用户可编辑副本（同名已存在 → 409）→ 201 |
| PUT | `/api/agent-skills/:name` | 更新用户技能：`{ description, body, references?, … }`（内置只读 → 403，须先 fork） |
| GET | `/api/agent-skills/:name/file?path=` | 预览附件：`{ skill_name, path, content }`（`path` 相对技能根，须 confine） |
| DELETE | `/api/agent-skills/:name` | 删除用户技能（不可删内置） |

早报 / 收盘 / 产业链等叙事由对话中激活内置工作流技能完成（见 [AGENT-SKILLS.md](./AGENT-SKILLS.md)）；已移除 Hub feature `industry_mining` / `industry_mermaid` / `market_report` 与 `POST /api/industry/mermaid`。

详见 [AGENT-SKILLS.md](./AGENT-SKILLS.md)。

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

### 计划任务 / Schedule

定时执行智能体提示词或受控脚本。持久化于用户 SQLite（`packages/user-store` 的 `schedule` 命名空间）；调度引擎为 `@opptrix/schedule` 的 `ScheduleService`。Sidecar 启动时注册 `registerScheduleRoutes` 并调用 `scheduleService.start()`（进程内每 **20s** 扫描到期任务，`trigger: 'timer'`）。

计划任务仅在 **应用运行或托盘常驻** 时由进程内 timer 执行；完全退出后不执行。桌面 `reconcile` **只**注销遗留 OS 注册（LaunchAgent / schtasks / systemd），**不再**注册系统级 tick。`POST /api/schedule/tick`（`trigger: 'os'`）仅兼容旧 runner；详见 [DESKTOP.md · 计划任务与后台常驻](./DESKTOP.md#计划任务与后台常驻)。tick / claim 前会释放超时 `running` lease（默认 45 分钟标为 `interrupted`），每个 job 的 `scheduled_job_runs` 硬顶保留最近 100 条。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/schedule/settings` | 读取全局设置 |
| PATCH | `/api/schedule/settings` | 更新设置；可选 `resync_os: true` 清理遗留 OS 状态字段 |
| GET | `/api/schedule/jobs` | 列出全部任务 |
| GET | `/api/schedule/jobs/:id` | 单条任务详情 |
| POST | `/api/schedule/jobs` | 创建任务 |
| PATCH | `/api/schedule/jobs/:id` | 更新任务 |
| DELETE | `/api/schedule/jobs/:id` | 删除任务 |
| POST | `/api/schedule/jobs/:id/run` | 立即执行一次（`trigger: 'manual'`） |
| POST | `/api/schedule/tick` | 扫描并执行到期任务（**仅本机**；兼容旧 OS runner，`trigger: 'os'`） |
| GET | `/api/schedule/status` | 汇总状态、启用任务数、最近失败 |
| GET | `/api/schedule/os/reconcile` | 桌面 reconcile 提示（`register_tick` 恒为 false） |

**`ScheduleSettings`（GET/PATCH `/api/schedule/settings`）**

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `master_enabled` | boolean | `true` | 总开关；为 `false` 时 `tick` 跳过所有到期任务 |
| `run_when_closed` | boolean | `false` | **兼容字段**：始终 `false`；PATCH 忽略写入；不再注册系统 crontab |
| `autostart` | boolean | `true` | 桌面：登录项 / Linux XDG Autostart，以 `--background` 托盘常驻 |
| `allow_shell_scripts` | boolean | `true` | 为 `false` 时禁止创建/改为 `shell_script` 任务 |
| `os_tick_status` | `'synced' \| 'pending' \| 'error' \| 'n/a'` | `'n/a'` | 遗留字段；新版本通常为 `n/a` |
| `os_tick_error` | string \| null | `null` | 遗留 OS 注销失败原因（少见） |

PATCH 时若变更 `master_enabled` 或 `autostart` 且未带 `resync_os`，可将 `os_tick_status` 置为 `pending` 以提示桌面 reconcile（强制 remove）。`resync_os: true` 时清理任务级 `os_*` 字段并返回健康摘要。计划任务仅在 **应用运行或托盘常驻** 时由进程内 timer 执行；完全退出后不执行。

**任务类型**

| 字段 | 取值 | 说明 |
|------|------|------|
| `kind` | `agent_prompt` \| `shell_script` | 载荷类型 |
| `schedule_kind` | `once` \| `interval` \| `cron` | 调度方式 |
| `schedule` | object | `once`: `{ run_at: ISO8601 }`；`interval`: `{ every_sec, anchor? }`；`cron`: `{ expression }` |
| `payload` | object | `agent_prompt`: `{ prompt, session_id? }`；`shell_script`: `{ argv: string[], cwd? }` |

**`ScheduledJob` 响应字段（节选）**：`id`、`title`、`enabled`、`kind`、`schedule_kind`、`schedule`、`payload`、`next_run_at`、`last_run_at`、`last_status`、`os_status`、`created_at`、`updated_at`。

**POST `/api/schedule/jobs` body 示例（智能体定时分析）**

```json
{
  "title": "每日收盘复盘",
  "kind": "agent_prompt",
  "schedule_kind": "cron",
  "schedule": { "expression": "0 16 * * 1-5" },
  "payload": { "prompt": "总结今日 A 股大盘与关注标的" },
  "enabled": true
}
```

**POST `/api/schedule/tick`**

- 仅允许来源 IP 为 `127.0.0.1` / `::1` / `::ffff:127.0.0.1`；否则 **403** `{ "error": "仅允许本机调用" }`
- 成功：`{ "result": { "due": string[], "ran": string[], "skipped": string[] } }`
- `master_enabled=false` 时返回空数组（不执行）
- 通过乐观 claim（推进 `next_run_at` + running lease）保证幂等，避免并发 tick 重复执行同一到期窗口

**GET `/api/schedule/status` 响应（节选）**

```json
{
  "master_enabled": true,
  "run_when_closed": false,
  "allow_shell_scripts": true,
  "autostart": true,
  "os": { "status": "n/a", "message": "…", "error": null, "autostart": true },
  "jobs": { "total": 2, "enabled": 1, "disabled": 1, "next_due": "2026-07-28T08:00:00.000Z" },
  "enabled_jobs": 1,
  "recent_failures": [],
  "recent_failure_count": 0
}
```

**GET `/api/schedule/os/reconcile`**

供 Electron `schedule-bridge.cjs` 读取：`register_tick` **恒为 `false`**（不再注册系统 crontab）、`run_when_closed: false`、`autostart`、`interval_sec`（保留字段，固定 **60**）、`os_tick_status`、`desktop_required: true`。桌面侧每次 reconcile 仍调用 `removeTickRegistration` 清理旧版遗留。

**错误**

| 场景 | 状态码 | 说明 |
|------|--------|------|
| 任务不存在 | 404 | GET/PATCH/DELETE/run |
| `shell_script` 未开启 | 400 | `尚未允许计划任务运行脚本，请先在设置中开启` |
| 非法调度/载荷 | 400 | 创建或更新校验失败 |
| 非本机 tick | 403 | `POST /api/schedule/tick` |

执行历史暂无独立 REST 端点；Agent 经 `list_scheduled_job_runs` 读取，或 UI 经 status 的 `recent_failures` 摘要。

## Agent

`POST /api/chat` 使用 `@opptrix/agent` 的 `AgentEngine`，内置 tools 调用同一 `ResearchHub`。

### Experts（专家目录）

内置专家来自远程静态目录 `https://update.opptrix.org/experts/`（`StaticHttpExpertProvider`）；网络不可用时降级到包内 `catalog.mock.json`（`LocalJsonExpertProvider`，`source: "builtin"`）。用户自建专家持久化于 user-store `local_experts`（`source: "local"`）。`ExpertCatalogService` 合并公开/远程与本地自建；列表 `ExpertCatalog.source` 为 `"remote"`（远程成功）或 `"local"`（降级）。

**JSON Schema（远程/静态目录契约）**

| 文件 | 说明 |
|------|------|
| [`expert-definition.schema.json`](../packages/agent/src/experts/schemas/expert-definition.schema.json) | 单条 `ExpertDefinition` |
| [`expert-catalog-file.schema.json`](../packages/agent/src/experts/schemas/expert-catalog-file.schema.json) | 静态文件 `{ schemaVersion?, experts[] }` |
| [`remote-expert-http.schema.json`](../packages/agent/src/experts/schemas/remote-expert-http.schema.json) | 远程 HTTP 列表/详情契约 |
| [`remote-catalog.example.json`](../packages/agent/src/experts/examples/remote-catalog.example.json) | 部署示例 |

部署与字段说明见 [EXPERT-GUIDE §7 远程专家 datasource](./EXPERT-GUIDE.md#7-远程专家-datasource)。UI 中 `persona` 对用户显示为「技能专长」，API 字段名不变。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/experts` | 分页列表；响应为 `ExpertCatalog` |
| GET | `/api/experts/:id` | 单条完整定义；响应 `{ expert: ExpertDefinition }` |
| POST | `/api/experts` | 创建本地专家；响应 `{ expert: ExpertDefinition }`（201） |
| PATCH | `/api/experts/:id` | 更新本地专家（内置拒绝 403） |
| DELETE | `/api/experts/:id` | 删除本地专家（内置拒绝 403） |

**GET `/api/experts` 查询参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 可选；匹配 `title` / `summary` / `tags`（不区分大小写） |
| `tag` | string | 可选；精确匹配某一 tag |
| `scope` | `"public" \| "personal" \| "all"` | 可选；默认 `all`（公开=内置，个人=本地） |
| `limit` | number | 可选；默认 50，范围 1–100 |
| `cursor` | string | 可选；上一页 `nextCursor`（数值 offset） |

**POST `/api/experts` 请求体**

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 必填；空白 → 400 `请填写专家名称` |
| `summary` | string | 必填；空白 → 400 `请填写专家简介` |
| `persona` | string | 必填；技能专长（API 字段 `persona`；UI 同义文案）；经 `sanitizeExpertPersona` 消毒；空白 → 400 `请填写角色设定`；消毒失败 → 400 `角色设定无效，请修改后重试` |
| `tags` | string[] | 可选；trim 后去重，最多 8 个 |
| `starterPrompts` | `ExpertStarterPrompt[]` | 可选；空会话 Composer 快捷提问；经 `normalizeExpertStarterPrompts` 规范化，**最多 6 条**；空/无效 → 不写入该字段 |

创建成功后服务端自动写入（客户端不可指定）：`id`（由 `title` slug 为 `local-{slug}`，冲突加后缀）、`source: "local"`、`official: false`、`icon`（默认 expert 图标）、`defaultPacks: ["fundamentals", "instrument_analytics"]`、`defaultResearchTier: "L2"`、`defaultSessionTitle`（同 `title`）、`complianceVersion: "1"`、`version: "1.0.0"`。

```http
POST /api/experts
Content-Type: application/json

{
  "title": "行业研究助手",
  "summary": "聚焦产业链景气与竞争格局的结构化解读",
  "persona": "你是一位行业研究助手，熟悉 A 股中游制造…",
  "tags": ["行业", "产业链"],
  "starterPrompts": [
    { "id": "sp-chain", "title": "梳理产业链", "content": "请梳理该行业上下游与竞争格局。" }
  ]
}
```

```json
{
  "expert": {
    "id": "local-hang-ye-yan-jiu-zhu-shou",
    "title": "行业研究助手",
    "summary": "聚焦产业链景气与竞争格局的结构化解读",
    "icon": { "kind": "icon", "value": "expert" },
    "tags": ["行业", "产业链"],
    "official": false,
    "source": "local",
    "version": "1.0.0",
    "persona": "你是一位行业研究助手…",
    "defaultPacks": ["fundamentals", "instrument_analytics"],
    "defaultResearchTier": "L2",
    "defaultSessionTitle": "行业研究助手",
    "complianceVersion": "1",
    "starterPrompts": [
      { "id": "sp-chain", "title": "梳理产业链", "content": "请梳理该行业上下游与竞争格局。" }
    ]
  }
}
```

**PATCH `/api/experts/:id` 请求体**：`title` / `summary` / `persona` / `tags` / `starterPrompts` 均可选；仅 `source: "local"` 可更新。内置专家 → 403 `{ "error": "内置专家不可编辑" }`；id 不存在 → 404。字段校验与 POST 相同；`persona` 省略时保留原值；传入 `starterPrompts` 时整体替换（规范化后为空则清除该字段）。

```http
PATCH /api/experts/local-hang-ye-yan-jiu-zhu-shou
Content-Type: application/json

{ "title": "行业研究助手 v2", "persona": "更新后的技能专长…", "starterPrompts": [] }
```

响应 `{ expert: ExpertDefinition }`。

**DELETE `/api/experts/:id`**

- 成功：`{ "ok": true, "deleted": "<id>" }`
- 404：id 不存在 `{ "error": "expert not found" }`
- 403：内置专家 `{ "error": "内置专家不可删除" }`

删除仅移除目录条目；**已有绑定该专家的会话与消息不受影响**（会话已快照的 `rolePersona` 继续用于 Layer 1）。

> 目录 `persona` 仅在**创建会话**时复制到 `session.rolePersona`；之后与目录解耦。详见 [EXPERT-GUIDE.md](./EXPERT-GUIDE.md)。

**`ExpertCatalogEntry`（列表项，不含 `persona`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 专家唯一 id（如 `equity-analysis`） |
| `title` | string | 展示标题 |
| `summary` | string | 一句话简介 |
| `icon` | `{ kind: "emoji" \| "icon"; value: string }` | 元数据；UI 统一固定 Fluent 图标 |
| `tags` | string[] | 分类标签 |
| `official` | boolean | 可选；官方内置 |
| `source` | `"builtin" \| "local"` | 可选；来源 |
| `version` | string | 可选；目录版本 |

**`ExpertCatalog` 响应**

| 字段 | 类型 | 说明 |
|------|------|------|
| `experts` | `ExpertCatalogEntry[]` | 当前页 |
| `source` | `"local" \| "remote"` | 远程目录成功时为 `"remote"`；降级内置 mock 时为 `"local"` |
| `fetchedAt` | string | ISO 8601 |
| `nextCursor` | string | 可选；有更多时返回 |

**`ExpertDefinition`（详情，扩展列表项）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `persona` | string | 技能专长（注入 system prompt Layer 1；服务端会消毒，见 [EXPERT-GUIDE §3](./EXPERT-GUIDE.md#3-技能专长persona写法指导)） |
| `defaultPacks` | string[] | 创建会话后自动激活的工具包 id |
| `defaultResearchTier` | `"L1" \| "L2" \| "L3"` | 默认研究档位 |
| `defaultSessionTitle` | string | 可选；新建会话默认标题 |
| `complianceVersion` | string | persona 合规版本标记 |
| `starterPrompts` | `ExpertStarterPrompt[]` | 可选；最多 6 条；缺省或空 = 无快捷提问。绑定该专家的**空会话**欢迎区：顶部动画品牌为「Opptrix 专家」，主标题为「专家可以帮你干点什么？」，副文案用 `summary`；Composer 优先展示这些 chips（无则回退全局欢迎提问） |

**`ExpertStarterPrompt`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 条目 id；缺省或冲突时服务端生成（如 `sp-…`） |
| `title` | string | chip 短文案；空则用 `content` 前约 24 字 |
| `content` | string | 点击后填入/发送的正文；trim 后为空的项会被跳过 |

规范化（`normalizeExpertStarterPrompts` / `MAX_EXPERT_STARTER_PROMPTS = 6`）：trim、去空 `content`、保证 `id` 唯一、截断至最多 6 条；全部无效时返回「无字段」。

**示例**

```json
{
  "experts": [
    {
      "id": "macro-strategy",
      "title": "宏观策略顾问",
      "summary": "解读宏观周期、政策取向与跨资产联动，帮你建立自上而下视角",
      "icon": { "kind": "icon", "value": "expert" },
      "tags": ["宏观", "策略", "政策"],
      "official": true,
      "source": "builtin",
      "version": "1.0.0"
    }
  ],
  "source": "local",
  "fetchedAt": "2026-07-24T12:00:00.000Z"
}
```

```json
{
  "expert": {
    "id": "equity-analysis",
    "title": "个股分析助手",
    "summary": "聚焦单只标的的基本面、估值与趋势结构，给出结构化研究解读",
    "icon": { "kind": "icon", "value": "expert" },
    "tags": ["个股", "基本面", "估值"],
    "official": true,
    "source": "builtin",
    "version": "1.0.0",
    "persona": "你是一位个股分析助手，擅长从商业模式、财务质量…",
    "defaultPacks": ["fundamentals", "instrument_analytics"],
    "defaultResearchTier": "L3",
    "defaultSessionTitle": "个股分析",
    "complianceVersion": "1"
  }
}
```

**错误**

| 状态码 | 场景 | 响应体 `error` 示例 |
|--------|------|---------------------|
| 404 | `GET` / `PATCH` / `DELETE` 时 id 不存在 | `expert not found` |
| 403 | `PATCH` 内置专家 | `内置专家不可编辑` |
| 403 | `DELETE` 内置专家 | `内置专家不可删除` |
| 400 | POST 缺 `title` / `summary` / `persona` | `请填写专家名称` / `请填写专家简介` / `请填写角色设定` |
| 400 | persona 消毒失败（空、>4000 字、命中注入模式） | `角色设定无效，请修改后重试` |
| 400 | PATCH 后 `title` / `summary` 为空 | `请填写专家名称` / `请填写专家简介` |
| 400 | PATCH 本地专家 id 存在但 repo 层找不到 | `找不到该专家` |

前端客户端：`listExperts` / `getExpert` / `createExpert` / `updateExpert` / `deleteExpert`（`client-ui/src/api/client.ts`）。

**设计自己的专家**（技能专长写法、Layer 0/1 关系、远程目录部署）：见 [EXPERT-GUIDE.md](./EXPERT-GUIDE.md)。

### Sessions（会话）

会话元数据持久化于 user-store；列表与创建经下列 REST。带 `expertId` 的会话在侧栏显示 `expertIcon`；Agent 每轮 Layer 1 使用会话快照 `rolePersona`（见 [AGENT-GUIDE §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)、[EXPERT-GUIDE §4](./EXPERT-GUIDE.md#4-注意事项)）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions` | `{ sessions: SessionMeta[] }` 活跃会话（含 `expertId` / `expertIcon`；**不含** `rolePersona` 全文） |
| POST | `/api/sessions` | 创建会话；body 见下；响应 `{ session: SessionMeta }`；同时写入 `rolePersona` 快照；有配置时 `session.model` 继承全局 `default_model` |
| GET | `/api/sessions/:id` | 会话详情 + 消息列表（当前 `session` 子对象不含 `expertId`；专家绑定以列表或创建响应为准） |
| GET | `/api/sessions/:id/role-persona` | `{ rolePersona, expertId }`；旧会话空值会惰性回填并持久化 |
| PUT | `/api/sessions/:id/role-persona` | body `{ rolePersona }` → `sanitizeExpertPersona`；成功写回并返回 `{ rolePersona, expertId }` |
| POST | `/api/sessions/:id/attachments` | 上传附件（raw body + `Content-Type` / `X-Attachment-Mime` + `X-Attachment-Name`）；PDF 始终可走本地文本整理（不要求模型原生 `pdf` 能力）；响应 `{ attachment: ChatAttachmentMeta }`（PDF 含 `extract.status=pending`，后台异步整理） |
| GET | `/api/sessions/:id/attachments` | 列出会话附件元数据（含 Agent 创建的 `canvas` / `mindmap` / `web`）；响应 `{ attachments: Array<ChatAttachmentMeta & { referenced: boolean }> }`（`referenced`：是否已被 turns 引用，与 DELETE 409 判定一致；按 `createdAt` 升序） |
| GET | `/api/sessions/:id/attachments/:attachmentId` | 流式返回附件二进制（`Content-Type` 来自元数据；canvas/mindmap 用 `application/vnd.opptrix.*`；web 入口为 `index.html`；路径规范化防穿越） |
| GET | `/api/sessions/:id/attachments/:attachmentId/web` | 重定向到 `.../web/index.html` |
| GET | `/api/sessions/:id/attachments/:attachmentId/web/export.png` | 服务端 Playwright **整页（fullPage）**截图导出长图 PNG；非 web kind → 404；浏览组件未就绪 → 503 + 可读错误文案；成功 `image/png` |
| GET | `/api/sessions/:id/attachments/:attachmentId/web/*` | 安全服务网页制品目录下相对文件（默认 `index.html`）；拒绝路径穿越；响应带 CSP（`connect-src 'self'`，默认禁外网） |
| PUT | `/api/sessions/:id/attachments/:attachmentId` | **仅** `kind=canvas` / `mindmap`：写回源码或节点树；其它 kind → 400。canvas：body 为 TSX 原文（`text/plain`）或 `{ source }`；mindmap：JSON 树（`{ rootId, nodes }` 或等价对象）。成功 `{ attachment: ChatAttachmentMeta }` |
| GET | `/api/sessions/:id/attachments/:attachmentId/meta` | 返回最新 `{ attachment: ChatAttachmentMeta }`（含 PDF `extract` 整理状态与可选 `documentId`，以及 canvas/mindmap/web 元数据，供 UI 轮询） |
| GET | `/api/sessions/:id/attachments/:attachmentId/extract` | 返回 `{ attachment_id, name, kind, extract }` 整理摘要（`extract` 同下表，含 `documentId?`） |
| GET | `/api/sessions/:id/attachments/:attachmentId/extract/text` | 返回整理后的文本/Markdown（`text/markdown`）；整理中 202 `{ status: 'pending' }`；失败 422 `{ status: 'failed', message? }`；供右侧文件预览面板渲染 Word/PPT/Markdown/Txt |
| DELETE | `/api/sessions/:id/attachments/:attachmentId` | 删除未入 turns 引用的附件；已引用 → 409 |
| GET | `/api/opptrix-vendor/manifest` | 离线网页库清单（钉版本）；同源别名 `/opptrix-vendor/manifest` |
| GET | `/api/opptrix-vendor/*` | 离线网页库静态文件（如 `chart.js/chart.umd.min.js`）；同源别名 `/opptrix-vendor/*`；目录由 `OPPTRIX_WEB_VENDOR_DIR` 或桌面 `resources/web-vendor` 解析 |
| POST | `/api/sessions/:id/chat/stream` | SSE 聊天；body `{ message, model?, attachments?: string[] }`（`attachments` 为已上传附件 id 列表） |
| POST | `/api/sessions/:id/chat` | 同步聊天；body 同上 |
| POST | `/api/sessions/:id/chat/cancel` | 取消进行中的聊天；无活动流 → 404；同时清空 pending `ask_user`、soft steer、该会话 turn-wake / job waits·watches（**不** cancel 全局后台 Job） |
| GET | `/api/sessions/:id/pending-wakes` | `{ wakes, job_watches? }`：未到期纯延时 timer + 挂起的 Job watch 摘要（Composer 条数；长任务依赖终态续跑，无 soft timer） |
| GET | `/api/sessions/:id/pending-job-watches` | `{ watches }`：仅 Job watch 列表（无 fallback 倒计时字段） |
| GET | `/api/sessions/:id/jobs` | 本会话相关后台任务列表（见下 **会话后台 Job**） |
| POST | `/api/sessions/:id/jobs/:jobId/cancel` | 结束可取消的后台任务（见下） |
| GET | `/api/sessions/:id/live-progress` | SSE：会话过程事件（含 `job_progress` / `job_watch` 等；见下） |
| POST | `/api/sessions/:id/chat/steer` | Soft steer：生成中注入补充说明，**不** abort；body `{ message: string }` → `{ ok: true }` 或 `{ ok: false, reason: 'no_active_chat' \| 'empty' }`；下一 LLM 轮前以用户消息「（补充）…」写入会话；SSE 可发 `steer_applied` |
| POST | `/api/sessions/:id/chat/user-prompt` | 回填 `ask_user` / 密钥问答；见下 |
| POST | `/api/sessions/:id/fork` | 从助手气泡分叉新会话；body `{ message_index }`（display turn 索引，须为 assistant）→ `{ session, messages, contextRef }`；无效索引/角色 → 404 |
| POST | `/api/sessions/:id/truncate` | 编辑重发前截断：从指定 **user** display turn 起删除该条及之后（同步 `turns` / `messages`，清空 `sessionMemory`）；body `{ message_index: number }`（整数 ≥0）→ `{ session, messages, contextRef }`；非 user 锚点或无效 → 404；校验失败 → 400 |
| GET | `/api/speech/status` | 本机语音识别就绪状态：`{ ready, engine, modelName, modelsDir, language?, promptEnabled? }` |
| POST | `/api/speech/transcribe` | 语音转写；raw body（`application/octet-stream`）+ `X-Speech-Mime`；响应 `{ text, engine, model, language?, empty? }` |

**会话后台 Job（`list_jobs` / Composer 任务面板）**

长任务（`opptrix_run({ background: true })`、`ensure_python` 安装、`prepare_fuyao_dump` 冷下载等）登记为全局 Job；有会话 watch 时推送进度，终态触发同会话自动续跑。Agent 工具 `list_jobs` / `cancel_job` 与下列 REST 语义对齐。**无** `wait_job` 工具或等价阻塞等待 API。

**GET `/api/sessions/:id/jobs`**

| Query | 类型 | 说明 |
|-------|------|------|
| `states` | string \| string[] | 可选；逗号分隔或数组。允许：`queued` / `accepted` / `preparing` / `running` / `completed` / `failed` / `cancelled` |
| `kind` | string | 可选；`shell-command` \| `python-install` \| `fuyao-dump` |
| `limit` | number | 可选；默认 20，钳制 1–50 |

会话不存在 → 404。返回本会话相关 Job（`meta.session_id` 匹配 **或** 本会话已挂 watch），按 `updatedAtMs` 降序截断。

```json
{
  "jobs": [
    {
      "job_id": "shell-…",
      "kind": "shell-command",
      "title": "下载依赖",
      "label": "正在执行命令…",
      "state": "running",
      "percent": 42,
      "cancelable": true,
      "eta_seconds": 120,
      "stdout_tail": "…",
      "meta": { "command_summary": "pip install …", "exit_code": null }
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `title` | 展示标题；缺省时 shell 回退 `command_summary` |
| `label` | 进度文案（`progress.message`） |
| `cancelable` | shell-command 通常为 `true`；python-install / fuyao-dump 默认 `false` |
| `stdout_tail` | 可选；已截断的 stdout 尾部 |
| `meta` | 可选摘要：`command_summary` / `exit_code` / `dump_kind` 等 |

**POST `/api/sessions/:id/jobs/:jobId/cancel`**

取消可取消的全局 Job，并清除本会话对该 `jobId` 的 watch。成功：`{ ok: true, job_id, cancelled: true }`。不可取消 / 不存在 / 已终态等 → **400** `{ ok: false, job_id, cancelled: false, error }`。会话不存在 → 404；空 `jobId` → 400。

**SSE `job_progress`（经 `GET /api/sessions/:id/live-progress`）**

有会话 watch 时，Job 进度（节流）与终态（立即）推送：

```json
{
  "type": "job_progress",
  "job_id": "shell-…",
  "kind": "shell-command",
  "state": "running",
  "label": "正在执行命令…",
  "percent": 42,
  "title": "下载依赖",
  "cancelable": true,
  "stdout_tail": "…"
}
```

相对早期事件，扩展字段：`title`（可选）、`cancelable`（可选）、`stdout_tail`（可选，已截断；运行中节流刷新）。Composer 任务面板据此更新标题、输出区与「结束任务」可用性。

**Composer 语音转写**

- 默认引擎 **SenseVoice**（`OPPTRIX_SPEECH_ENGINE=sensevoice`）；备选 Whisper（`whisper`）。
- SenseVoice 默认模型 `q8`（ModelScope `FunAudioLLM/SenseVoiceSmall-GGUF` → `sensevoice-small-q8.gguf`，约 242MB）+ `fsmn-vad.gguf`。
- SenseVoice 首次转写自动下载：预编译 CLI（约 6MB）+ q8 模型（约 242MB）+ VAD（约 2MB）；可选 `OPPTRIX_SENSEVOICE_MODEL=f16`。
- Whisper 分支：默认 `tiny`（`~/.opptrix/whisper-models/ggml-tiny.bin`），语言 `zh`；经 whisper-cli `--prompt` 偏置简体与股票代码。
- 环境变量：`OPPTRIX_SPEECH_ENGINE`、`OPPTRIX_SENSEVOICE_MODEL`、`OPPTRIX_SENSEVOICE_BIN`、`OPPTRIX_MODELSCOPE_BASE`、`OPPTRIX_HF_MIRROR`；Whisper 专用：`OPPTRIX_WHISPER_MODEL`、`OPPTRIX_WHISPER_LANGUAGE`、`OPPTRIX_WHISPER_PROMPT`。
- 桌面端经 Electron IPC 上传录音；服务端用 ffmpeg 转 16 kHz WAV 后调用 `@opptrix/local-inference`。新闻 enrichment 音视频转写同样使用 SenseVoice q8；桌面安装包内置模型优先加载。

**会话上下文压缩（长对话）**

- 每轮聊天按当前模型窗长（优先 [models.dev](https://models.dev) 模糊匹配，失败降级启发式，默认 128k）估算用量；接近上限时 micro / structured 压缩，SSE 推送 `context_compact`。
- UI transcript（`turns`）不变；模型侧使用 `sessionMemory` + 近端消息。详见 [AGENT-GUIDE §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)。
- `PATCH /api/sessions/:id` 切换 `model` 时按新窗口再检查；响应可含 `contextHint`（有压缩时）。设置非空会话模型会同步更新全局 `default_model` 并刷新 Agent registry；清空（`null` / 空串）只改本会话，不破坏默认模型。新建会话继承当前 `default_model`。
- 同一路由可 PATCH `llmParams`（`temperature` / `maxTokens` / `reasoningEffort`）；按会话持久化，旧会话缺省时请求体温度 1、`max_tokens` 4096、不发 `reasoning_effort`。GET session 的 `session.llmParams` 供 Composer 选模面板读写。

**SSE `context_compact` 事件**

```json
{
  "type": "context_compact",
  "level": "structured",
  "message": "已整理较早对话要点，后续仍按你的目标继续。",
  "usageRatio": 0.88,
  "contextTokens": 128000
}
```

`level`：`micro` | `structured` | `overflow_retry`。

**`AvailableModel`（`GET /api/models/available`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `contextTokens` | number | 上下文窗口（models.dev + 启发式） |
| `attachment` | boolean | 是否支持附件上传 |
| `inputModalities` / `outputModalities` | `MediaKind[]` | 输入/输出模态（含 `text` / `image` / `pdf` / `video` / `audio`） |
| `attachmentLimits` | `{ maxBytesByKind; maxCount; maxTotalBytes }` | 按模型族动态分档的上传限额 |
| `media` | 同上嵌套对象 | 与上述字段等价的组合视图 |

**`ChatAttachmentMeta`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 附件 id（落盘 `~/.opptrix/chat-attachments/{sessionId}/{id}/`） |
| `kind` | `image` \| `pdf` \| `document` \| `video` \| `audio` \| `canvas` \| `mindmap` \| `web` | 媒体种类；`document` = 文本 / Word / PPT；`canvas` / `mindmap` / `web` = Agent 制品（通常由 `create_canvas` / `create_mindmap` / `create_web` 写入，列表 API 自然包含） |
| `mime` / `name` / `size` / `createdAt` | — | MIME、原始文件名、字节数、ISO 时间；画布常用 `application/vnd.opptrix.canvas+tsx`，脑图常用 `application/vnd.opptrix.mindmap+json` |
| `width` / `height` / `duration` | number | 可选元数据 |
| `extract` | `AttachmentExtractMeta`（见下） | PDF / 文档 / 图片：本地文本整理（含 OCR）状态 |
| `canvas` | `{ mode: 'fluid' \| 'print'; page?; pageCount? }` | 可选；`kind=canvas` 时的版面元数据（默认 `fluid`；`page` 可选/遗留） |
| `mindmap` | `{ rootId: string }` | 可选；`kind=mindmap` 时的根节点 id |

**`AttachmentExtractMeta`（`ChatAttachmentMeta.extract`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | `pending` \| `ready` \| `failed` | 整理进度 |
| `documentId` | string | 可选；本地文档库（`@opptrix/doc-library`，`~/.opptrix/doc-library/doc-library.db`）内的 document id；与库内 parse 状态镜像，上传 ingest 后即写入，供 Agent 工具与跨附件去重 |
| `error` | string | 可选；`failed` 时的原因摘要 |
| `pageCount` / `charCount` | number | 可选；整理完成后的页数 / 字符数 |
| `readyAt` | string | 可选；整理完成时间（ISO） |

PDF / 文档 / 图片上传后经 Parse Router 异步整理（按格式选 `text-l0` / `office-l0` / `pdf-extract-l0`，弱文本或深度整理时升 `ocr-l2`；图片必经本地 OCR）→ **文档库 + legacy 双写**（`extract.md` / `extract-chunks.json` 仍落在附件目录）。`.pptx` / `.ppt` 尽量按幻灯片分 chunk（`page` = slide）；`.doc` 由产品侧抽取，无需用户先转。图片 `extract` ready 后 Agent 侧注入 OCR 目录文本（可辅以 vision）。Agent 按需阅读工具见 [AGENT-GUIDE §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)（`list_session_documents` / `search_document` / `read_document`）。画布 / 脑图 / 网页由 Agent `artifacts` pack 创建，经附件列表与右侧预览打开；canvas/mindmap 写回用上文 `PUT .../attachments/:attachmentId`；网页相对资源用 `GET .../attachments/:aid/web/*`，离线库用 `/api/opptrix-vendor/*`；网页预览「下载长图」走 `GET .../web/export.png`（服务端整页截图，不向 iframe 开 `allow-same-origin`），PDF 由客户端基于长图切页。第三方依赖许可见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。

**`AvailableModel.contextTokens`**：`GET /api/models/available` 等列表项附带上下文窗口（优先 models.dev 异步查询 + 模糊匹配，失败降级启发式；只读派生，无需用户配置）。

**POST `/api/sessions` body**

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 可选；省略时：无 `expertId` 为「新对话」，有 `expertId` 为专家的 `defaultSessionTitle` 或 `title` |
| `expertId` | string | 可选；须存在于专家目录；创建后写入 `expertId` 与 `expertIcon`，并将消毒后的专家 `persona`（失败则默认研究员）写入会话 `rolePersona` |

无 `expertId` 时，`rolePersona` 初始为默认投研研究员文案（可随后编辑）。

**`GET/PUT /api/sessions/:id/role-persona`**

| 方法 | 说明 |
|------|------|
| GET | 返回本会话技能专长全文；若记录中为空则按专家目录或默认研究员回填一次 |
| PUT | 更新本会话技能专长；**不**修改专家目录；消毒失败 → 400 `技能专长无效，请修改后重试`；缺字段 → 400 `请填写技能专长` |

```http
PUT /api/sessions/{id}/role-persona
Content-Type: application/json

{ "rolePersona": "你擅长解读财报与行业景气度。" }
```

```json
{ "rolePersona": "你擅长解读财报与行业景气度。", "expertId": "equity-analysis" }
```

**`SessionMeta`（`GET /api/sessions` / `POST` 成功响应中的 `session`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 会话 id |
| `title` | string | 标题 |
| `createdAt` / `updatedAt` | string | ISO 8601 |
| `model` | string | 可选；`providerId:modelName`；新建时若已配置则继承 `default_model` |
| `archivedAt` | string \| null | 归档时间 |
| `archiveFolderId` | string \| null | 归档文件夹 |
| `expertId` | string \| null | 绑定专家 id；`null` 为默认投研研究员会话 |
| `expertIcon` | `{ kind: "emoji" \| "icon"; value: string } \| null` | 侧栏图标；无专家时为 `null` |
| `usageTotals` | `{ promptTokens; completionTokens; totalTokens } \| null` | 可选；会话累计 LLM 用量 |

**`GET /api/sessions/:id` 附加字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `messages[].usage` | `{ promptTokens; completionTokens; totalTokens }` | 可选；该轮 assistant 回复累计用量（含 tool 循环与压缩） |
| `messages[].attachments` | `ChatAttachmentMeta[]` | 可选；用户 pin 或模型原生输出的媒体元数据 |
| `messages[].usageEstimated` | boolean | 可选；无上游 usage 时为 `true`（客户端展示「约」） |
| `contextUsage` | `{ usedTokens; limitTokens; remainingTokens; modelRef; estimated }` | Composer 上下文占用估算（`assembleModelView` + 窗长） |

**`GET /api/sessions/:id/context-usage`**

返回 `{ contextUsage }`；404 时会话不存在。切模型后客户端应 refetch。

**聊天 SSE `done` 事件** 可附带 `turn_usage`（本轮 assistant 用量）与 `context_usage`（同上结构），便于流式结束后刷新 UI。

**示例 — 默认研究员会话**

```json
{ "title": "新对话" }
```

```json
{
  "session": {
    "id": "…",
    "title": "新对话",
    "createdAt": "2026-07-24T12:00:00.000Z",
    "updatedAt": "2026-07-24T12:00:00.000Z",
    "expertId": null,
    "expertIcon": null
  }
}
```

**示例 — 专家会话**

```json
{ "expertId": "macro-strategy" }
```

```json
{
  "session": {
    "id": "…",
    "title": "宏观策略研讨",
    "createdAt": "2026-07-24T12:00:00.000Z",
    "updatedAt": "2026-07-24T12:00:00.000Z",
    "expertId": "macro-strategy",
    "expertIcon": { "kind": "emoji", "value": "🌐" }
  }
}
```

**错误**

| 状态码 | 场景 |
|--------|------|
| 400 | `expertId` 不在目录中（`{ "error": "未知专家：…" }`） |
| 404 | `GET /api/sessions/:id` 时会话不存在 |

前端客户端：`createSession({ title?, expertId? })`（`client-ui/src/api/client.ts`）。

常用 slash 命令（在 message 中）：`/diagnose`, `/screen`, `/institution`, `/signal`, `/portfolio`, `/writer` 等，详见 `packages/agent/src/engine.ts`。

工作区文件工具（`workspace` pack：`workspace_*` / `http_fetch` / `download_file` / `shell_platform_status` / `opptrix_run` / `code_preflight` / `list_workspace_grants` / `resolve_workspace_path_uri` / `list_local_data_apis` / `get_local_data_catalog` / `prepare_fuyao_dump` / `request_session_lan_access` 等；多数**无 REST**，经聊天 MCP）与会话文件夹授权见 [AGENT-GUIDE.md · 工作区编程](./AGENT-GUIDE.md#工作区编程本地数据目录与扶摇-dump) 与下方 grants / file 路由。扶摇 Parquet 由 `prepare_fuyao_dump` 在服务端鉴权落盘公共区（冷下载先 `preparing`+`job_id` 再轮询），Agent **勿**用 `market sync` / `dailyDump` 作主路径。

**Shell（系统隔离）**：无独立 REST；经聊天 MCP 工具 `opptrix_run({ command })` 调用。在 OS 级沙箱中执行任意命令，路径受本会话 grants 约束；同会话隔离配置复用。围栏内**无**「首次运行命令」总确认；包安装源默认已并入会话 allowlist，可直接 `opptrix_run(command="pip install …")`。其它外网域名经运行时确认（`confirmation.kind === "network_egress"`，选项 `allow_host_once` / `allow_host_session` / `cancel`）或结果中的 `suggested_escalate`。自写脚本建议先 `code_preflight`（软门禁，不硬拦运行）。`escalate=unsandboxed` 每次确认，禁止对本对话一律放行。Windows 读取 `windows_isolation_mode`（默认 `unelevated` 基础隔离；`elevated` 完整隔离，见上文「沙盒环境设置」）。完整隔离下凭据失效（1326/1312）最多自动刷新再执行一次。沙盒子进程使用随包 Mozilla CA（`SSL_CERT_FILE` 等）。永久白名单 = `OPPTRIX_SHELL_ALLOWED_DOMAINS` ∪ 设置页白名单。`shell_platform_status` 无需确认，可在运行前探测 `ready` / `setup_hint` / `needs_elevation` / `can_auto_install` / `needs_linux_install` / `userns_restricted` / `windows_isolation_mode` / `network_isolation_level`（见 [DESKTOP.md](./DESKTOP.md#命令隔离agent-shell)）。

### Workspace grants（会话文件夹授权）

按**会话**管理 Agent 可访问的本地根目录。列表时会确保存在默认工作区（`root_id: "default"`，路径为用户数据目录下 `agent-workspace/sessions/<sessionId>/`，`mode: "rw"`，`is_default: true`；**每会话隔离**）。额外授权由用户在聊天侧选择文件夹后写入；受保护路径（如用户库、`agent-privileges`、`sessions/` 容器目录本身等）不可授权。默认根不可删除。会话删除时服务端会清理该会话的 grants、写/删 sticky 策略、**出站授权**、**会话局域网授权**（`SessionLanAccessStore`），并 dispose 会话级隔离句柄，尽量删除 `sessions/<sessionId>/` 磁盘目录（`WorkspaceService.clearSession`；**不删** `agent-workspace/shared/`）。本 REST 响应可含 `abs_path`（供 UI）；Agent 工具 `list_workspace_grants` 对默认工作区与用户数据根下路径脱敏，**不**把 `~/.opptrix` 根当作可访问目录暴露给模型（见 [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions/:id/workspace/grants` | `{ grants: WorkspaceGrant[] }` |
| POST | `/api/sessions/:id/workspace/grants` | 新增授权；body 见下 |
| DELETE | `/api/sessions/:id/workspace/grants/:grantId` | 按 grant `id` 移除；默认根返回 404 |
| GET | `/api/sessions/:id/workspace/file` | 流式读取已授权文件（见下） |

**POST body（grants）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string | **必填**，要授权的绝对路径 |
| `mode` | `"ro"` \| `"rw"` | 默认 `"ro"`；其它值按只读处理 |
| `label` | string | 可选显示名；缺省时用目录名 |

### Workspace file（消息内媒体流）

供聊天 Markdown 渲染 `opptrix-ws://` 引用。仅服务**本会话已授权**的 `root_id`；路径经 `resolveSafePath` 防穿越。

| Query | 类型 | 说明 |
|-------|------|------|
| `root_id` | string | **必填**：`default` / `shared` / `grant_*` |
| `path` | string | **必填**：相对路径（禁止 `..` / 绝对路径） |

成功：`Content-Type`（按扩展名）、`Content-Length`、文件流。失败：会话不存在 404；未授权 / 穿越 403；文件不存在 404。错误文案不暴露系统绝对路径。

**Agent 协议**：消息内写 `opptrix-ws://{root_id}/{relPath}`，或先调 MCP `resolve_workspace_path_uri`。

**成功响应示例（grants）**

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
