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
| GET | `/api/providers/presets` | 大模型提供商预置列表（有序：中国 → 海外 → 本地 Ollama → 自定义；`base_url` 优先 models.dev 缓存，否则静态 fallback；含 `region`） |
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
| GET | `/api/news/multimodal/status` | 多模态运行时状态（ffmpeg、SenseVoice 就绪、`canEnrich*`） |
| POST | `/api/news/multimodal/sensevoice/ensure` | 准备本机语音识别模型（内置优先，缺失则下载到用户目录） |
| POST | `/api/news/multimodal/whisper/ensure` | **已废弃**；代理到 `sensevoice/ensure` |
| GET | `/api/news/articles/:id/enrichment` | 文章 enrichment 结果 |
| POST | `/api/news/articles/:id/enrich` | 触发 enrichment；返回 `{ job_id }` |
| GET | `/api/news/enrichment/jobs/:jobId` | 查询 enrichment 任务进度 |

**新闻 enrichment 音视频**

- 转写引擎：**SenseVoice q8**（设置字段 `offline_whisper_model` 保留兼容；旧值 `tiny`/`base`/… 归一化为 `q8`）。
- 模型加载：**内置（安装包）→ `~/.opptrix/sensevoice/models` → 按需下载**。

### 沙盒环境设置

命令隔离（`shell_run` / `shell_install`）的**永久出站白名单**与局域网策略。持久化于用户 SQLite：`preference` / `sandbox_settings`。运行时与部署环境变量 `OPPTRIX_SHELL_ALLOWED_DOMAINS`（逗号分隔，支持 `*.example.com`）**并集**合并；命中合并白名单的目标免弹出站确认（仍受 SSRF / LAN 策略约束）。设置页入口：**设置 → 沙盒环境**。

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
    "allow_lan_access": false
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
    "needs_elevation": true
  }
}
```

**`status` 字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | string | `macos` / `linux` / `windows` / `unknown` |
| `supported` | boolean | 当前 OS 是否支持命令隔离 |
| `sandbox_available` | boolean | 命令隔离是否已开启（SRT 是否启用） |
| `ready` | boolean | 总体就绪（依赖齐全且平台安装步骤已完成） |
| `message` | string | 面向用户的摘要说明（不含路径） |
| `setup_hint` | string? | 可选；设置引导文案 |
| `missing_dependencies` | string[]? | 可选；缺失或未就绪的组件（诊断用，UI 一般不直出） |
| `needs_windows_install` | boolean? | Windows：WFP / 隔离用户尚未配置 |
| `needs_linux_install` | boolean? | Linux：AppArmor / userns 等尚未配置 |
| `can_auto_install` | boolean? | 桌面版可触发一次系统授权（UAC / pkexec） |
| `needs_elevation` | boolean? | 需用户批准提升权限一次 |
| `userns_restricted` | boolean? | Linux：内核限制非特权 user namespace（如 Ubuntu 24.04+） |

设置页 `SandboxEnvironmentStatusCard` 消费本端点；`needs_elevation` + `can_auto_install` 为真时显示「完成设置」（桌面版 IPC）。

**PUT body**（字段均可选；缺省沿用当前值或默认）

| 字段 | 类型 | 说明 |
|------|------|------|
| `allowed_domains` | string[] | 域名或 IP 列表；支持 `*.example.com` 通配 |
| `allow_lan_access` | boolean | 默认 `false`；为 `false` 时拒绝保存 localhost / 私网条目 |

**PUT 成功**：`{ "settings": { allowed_domains, allow_lan_access } }`（去重、小写、去尾点）

**PUT 失败（400）**：`{ "error": "…", "invalid_lines"?: string[] }`

- 请求体无效
- 域名格式非法（`invalid_lines` 列出原行）
- `allow_lan_access=false` 且列表含 localhost / 私网地址

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
| `prefer_opptrix_python` | boolean | 默认 `false`；为 `true` 且托管已安装时优先于系统 Python |

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

创建成功后服务端自动写入（客户端不可指定）：`id`（由 `title` slug 为 `local-{slug}`，冲突加后缀）、`source: "local"`、`official: false`、`icon`（默认 expert 图标）、`defaultPacks: ["fundamentals", "instrument_analytics"]`、`defaultResearchTier: "L2"`、`defaultSessionTitle`（同 `title`）、`complianceVersion: "1"`、`version: "1.0.0"`。

```http
POST /api/experts
Content-Type: application/json

{
  "title": "行业研究助手",
  "summary": "聚焦产业链景气与竞争格局的结构化解读",
  "persona": "你是一位行业研究助手，熟悉 A 股中游制造…",
  "tags": ["行业", "产业链"]
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
    "complianceVersion": "1"
  }
}
```

**PATCH `/api/experts/:id` 请求体**：`title` / `summary` / `persona` / `tags` 均可选；仅 `source: "local"` 可更新。内置专家 → 403 `{ "error": "内置专家不可编辑" }`；id 不存在 → 404。字段校验与 POST 相同；`persona` 省略时保留原值。

```http
PATCH /api/experts/local-hang-ye-yan-jiu-zhu-shou
Content-Type: application/json

{ "title": "行业研究助手 v2", "persona": "更新后的技能专长…" }
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
| POST | `/api/sessions` | 创建会话；body 见下；响应 `{ session: SessionMeta }`；同时写入 `rolePersona` 快照 |
| GET | `/api/sessions/:id` | 会话详情 + 消息列表（当前 `session` 子对象不含 `expertId`；专家绑定以列表或创建响应为准） |
| GET | `/api/sessions/:id/role-persona` | `{ rolePersona, expertId }`；旧会话空值会惰性回填并持久化 |
| PUT | `/api/sessions/:id/role-persona` | body `{ rolePersona }` → `sanitizeExpertPersona`；成功写回并返回 `{ rolePersona, expertId }` |
| POST | `/api/sessions/:id/attachments` | 上传附件（raw body + `Content-Type` + `X-Attachment-Name`）；校验当前会话模型 `media` 能力与限额；响应 `{ attachment: ChatAttachmentMeta }` |
| GET | `/api/sessions/:id/attachments/:attachmentId` | 流式返回附件二进制（`Content-Type` 来自元数据；路径规范化防穿越） |
| DELETE | `/api/sessions/:id/attachments/:attachmentId` | 删除未入 turns 引用的附件；已引用 → 409 |
| POST | `/api/sessions/:id/chat/stream` | SSE 聊天；body `{ message, model?, attachments?: string[] }`（`attachments` 为已上传附件 id 列表） |
| POST | `/api/sessions/:id/chat` | 同步聊天；body 同上 |
| GET | `/api/speech/status` | 本机语音识别就绪状态：`{ ready, engine, modelName, modelsDir, language?, promptEnabled? }` |
| POST | `/api/speech/transcribe` | 语音转写；raw body（`application/octet-stream`）+ `X-Speech-Mime`；响应 `{ text, engine, model, language?, empty? }` |

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
- `PATCH /api/sessions/:id` 切换 `model` 时按新窗口再检查；响应可含 `contextHint`（有压缩时）。

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
| `kind` | `image` \| `pdf` \| `video` \| `audio` | 媒体种类 |
| `mime` / `name` / `size` / `createdAt` | — | MIME、原始文件名、字节数、ISO 时间 |
| `width` / `height` / `duration` | number | 可选元数据 |

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
| `model` | string | 可选；`providerId:modelName` |
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

工作区文件工具（`workspace` pack：`workspace_*` / `http_fetch` / `download_file` / `shell_platform_status` / `shell_run` / `shell_install` / `list_workspace_grants` / `list_local_data_apis` / `get_local_data_catalog` / `prepare_fuyao_dump` / `request_session_lan_access` 等；**无 REST**，经聊天 MCP）与会话文件夹授权见 [AGENT-GUIDE.md · 工作区编程](./AGENT-GUIDE.md#工作区编程本地数据目录与扶摇-dump) 与下方 grants 路由。扶摇 Parquet 由 `prepare_fuyao_dump` 在服务端鉴权落盘公共区，Agent **勿**用 `market sync` / `dailyDump` 作主路径。

**Shell（系统隔离）**：无独立 REST；经聊天 MCP 工具调用。`shell_run` / `shell_install` 在 OS 级沙箱中执行，路径仍受本会话 grants 约束。首次 `shell_run` / `shell_install` 需用户确认运行命令（`confirmation.kind === "shell_run"`，选项 `allow_once` / `allow_session` / `cancel`）；选 `allow_session` 后本会话内跳过重复运行确认（内存，会话删除失效）。`pip`/`npm` 安装**另**需用户确认联网（`confirmation.kind === "network_install"`，选项 `once` / `sticky` / `cancel`）；选 `sticky` 后本会话内跳过重复联网确认。出站访问未在永久白名单（`OPPTRIX_SHELL_ALLOWED_DOMAINS` ∪ 设置页白名单，见上文「沙盒环境设置」）且本会话未 grant 时，SRT `sandboxAskCallback` 触发 `confirmation.kind === "network_egress"`（选项 `allow_host_once` / `allow_host_session` / `cancel`）；`ping` / 路由探测与运行命令可合并为一次确认。`shell_platform_status` 无需确认，可在运行前探测 `ready` / `setup_hint` / `needs_elevation` / `can_auto_install` / `needs_linux_install` / `userns_restricted`（Linux deb 自动依赖、Ubuntu 一次 pkexec、Windows 一次 UAC、AppImage 内置组件等，见 [DESKTOP.md](./DESKTOP.md#命令隔离agent-shell)）。

### Workspace grants（会话文件夹授权）

按**会话**管理 Agent 可访问的本地根目录。列表时会确保存在默认工作区（`root_id: "default"`，路径为用户数据目录下 `agent-workspace/sessions/<sessionId>/`，`mode: "rw"`，`is_default: true`；**每会话隔离**）。额外授权由用户在聊天侧选择文件夹后写入；受保护路径（如用户库、`agent-privileges`、`sessions/` 容器目录本身等）不可授权。默认根不可删除。会话删除时服务端会清理该会话的 grants、写/删 sticky 策略、**命令运行 sticky**、**联网安装 sticky**、**会话局域网授权**（`SessionLanAccessStore`），并尽量删除 `sessions/<sessionId>/` 磁盘目录（`WorkspaceService.clearSession`；**不删** `agent-workspace/shared/`）。本 REST 响应可含 `abs_path`（供 UI）；Agent 工具 `list_workspace_grants` 对默认工作区与用户数据根下路径脱敏，**不**把 `~/.opptrix` 根当作可访问目录暴露给模型（见 [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)）。

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
