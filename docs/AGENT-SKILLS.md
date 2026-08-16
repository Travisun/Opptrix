# Agent Skills（工作流技能）

Opptrix 实现 [Agent Skills 开放标准](https://agentskills.io/specification) 的 Phase 1：内置技能、用户导入/编辑、会话激活与渐进披露。

UI 对用户称「**工作流技能**」，避免与专家「技能专长」（persona）混淆。设置页预览 Dialog 以单层滚动展示名称、说明与克制的步骤正文（不复用聊天级 Markdown）。

> **说明**：原独立包 `@opptrix/skills`（硬编码早报/收盘/产业链任务）已并入本包的**内置工作流技能**，不再作为现行依赖。

## 与其它概念的区别

| 概念 | 是什么 | 不是 |
|------|--------|------|
| **工作流技能（Agent Skills）** | 步骤说明与附件：discovery → activate → 按需读附件 | 不是 Tool Pack，不是专家人设 |
| **技能专长（persona）** | 专家角色语气与分析偏好 | 不提供逐步工作流正文 |
| **Tool Pack** | 按意图加载的 MCP 工具子集 | 不替代流程说明；技能可经 `allowed-tools` / `required-packs` 在激活时**自动挂上**对应 pack |

三者正交：对话可同时有角色 persona、已激活 Tool Pack、以及最多 3 个已激活工作流技能。

## 目录布局

```
packages/agent-skills/builtin/<name>/SKILL.md   # 内置
~/.opptrix/agent-skills/<name>/SKILL.md         # 用户（或 OPPTRIX_DATA_DIR/agent-skills）
```

可选子目录（路径须相对技能根、禁止 `..`）：

- `references/` — 知识库 / 参考资料
- `scripts/` — 辅助脚本
- `assets/` — 其它附件

`name` 必须与目录名一致，且符合规范：小写 `a-z0-9` 与连字符、1–64、不首尾连字符、无连续 `--`（**不能用下划线**）。

技能名用**连字符**对齐工具名的**下划线**：例如技能 `create-web` ↔ 工具 `create_web`，技能 `create-canvas` ↔ 工具 `create_canvas`。description 中宜同时写上工具名与中文触发词，便于 `/create` 与中文检索。

## Frontmatter：`allowed-tools` / `required-packs`

| 字段 | 说明 |
|------|------|
| `allowed-tools` | 空格分隔的**工具名**（如 `create_web update_web read_web list_web_vendor`）。激活技能时经 `packIdForTool` 收集所属 pack 并 `toolPackSessions.activate`；未知工具名忽略；**不是**运行时硬白名单 |
| `metadata.required-packs` 或 `requiredPacks` | 空格/逗号分隔的 **pack_id**（如 `market artifacts`）；与上项合并去重 |

激活副作用与 `activate_tool_pack` 一致：刷新本轮 active packs / context usage。`activate_agent_skill` 返回 `activated_packs` 与可选 `tools_hint`。

### Composer 展示元数据（`metadata.*`）

设置页 / Composer `/` 列表优先读下列字段（用户可见文案，**禁止**工具名、API、包名）：

| 字段 | 说明 |
|------|------|
| `metadata.title` | 中文短名，约 2–8 字（如「早报」「个股尽调」） |
| `metadata.summary` | 一句结果导向说明，建议 ≤40 字 |
| `metadata.category` | `market` \| `equity` \| `portfolio` \| `strategy` \| `deliverable` \| `ops` \| `valuation` \| `decision` \| `quant` \| `macro` \| `cn-market` \| `event` |
| `metadata.slash-rank` | 字符串数字，越小越靠前（如 `"10"`） |
| `metadata.default-deliverable` | 投研技能一律 `web`；`create-skill` / `browser-browse` / `scheduled-jobs` 为 `none` |

建议 `slash-rank`：早报 10、收盘 20、资讯 30、个股尽调 40、财报 50、信号 60、产业链 70、ETF 80、组合 90、回测 100、策略报告 110；估值/决策簇约 120–250；量化 260–280；宏观 290–305；A 股专题 310–330；事件/诚实缺口 340–365；**LEAN 启发技能 400–530**；网页 200、画布 210、脑图 220；浏览 900、定时 910、新建技能 920。

### 默认交付约定（投研 → Web）

| 约定 | 说明 |
|------|------|
| **默认** | 投研类内置技能激活后须能调用 `create_web`（`allowed-tools` 含 `create_web update_web read_web list_web_vendor`，`required-packs` 含业务 pack + `artifacts`），流程默认产出可预览 HTML 报告页 |
| **画布备选** | 用户明确要「画布 / 一页式机构报告」才用 `create_canvas`（`@skill:create-canvas`） |
| **结构图备选** | 用户只要「结构图 / 脑图」才用 `create_mindmap` |
| **运维类** | `browser-browse` / `scheduled-jobs` / `create-skill` **不**强迫 `create_web`（`default-deliverable: none`） |

正文建议含：何时使用、分析架构、数据维度表、步骤（含交付网页）、该技能专属网页目录、禁止项（含「禁止无交付就结束」）；结论须 **事实 \| 假设 \| 推断** 分栏；禁止荐股与编造未返回数字。

### 投研技能簇与诚实降级

除早报/尽调/回测等基础簇外，内置还包括：

| 簇 | category 示例 | 说明 |
|----|---------------|------|
| **估值 / 决策** | `valuation` / `decision` | DCF、可比、球场图、备忘录等；显式假设，禁止假装卖方共识。含 `multi-role-research-council`（投资研讨团 / 多空辩论 → 研究立场，非买卖指令） |
| **量化** | `quant` | 因子暴露/研究、稳健性、配对价差、股票池筛选 |
| **宏观** | `macro` | 宏观简报、风格轮动、跨资产、流动性地图 |
| **A 股专题** | `cn-market` | 催化日历、北向、主题政策、涨跌停归因、AH 对照 |
| **事件 / 诚实缺口** | `event` | 并购/IPO/再融资等；能力不足时 **诚实降级** |
| **LEAN 启发** | `quant` / `macro` / `portfolio` / `event` | 方法溯源 QuantConnect LEAN；**非**本机 LEAN 引擎；`slash-rank` **400–530** |

**诚实降级约定**（`assumption-only` / `not-feasible-now`）：

- 无官方风格指数、无原生协整库、无 AH 专用 capability、无 L2、无结构化催化剂库等 → 开篇声明，用代理/公告拼装，禁止装成完整能力
- `precedent-tx` / `seo-refi` / `credit-brief` / `esg-scan` 等须在正文开篇放 **能力声明横幅**；禁止伪造先例库、历史折价库、评级字母、ESG 分数
- 字段探测失败（如北向净买）→ 写缺口，**禁止编造**

### LEAN 启发技能

内置 `lean-*` 技能方法溯源 [QuantConnect LEAN](https://www.lean.io/) / 社区算法思路，用于投研工作流编排与教育解读。**主流程默认 CN（A股 / 场内 ETF）**：专节 `## A股适配（默认）` 与「步骤」第 1 步「确认默认 CN」双约束；美股原版方法仅作溯源对照，**禁止把美股成分/ETF 清单不经映射直接当 A 股结果**，也禁止假设可自由融券做空。

| 约定 | 说明 |
|------|------|
| **溯源** | 正文须写明灵感来自 LEAN 文档/示例/社区算法；可引用概念名（如 QC500、Dual Thrust、Black-Litterman）作路由触发词，但须写「默认 A股适配」 |
| **默认市场** | **CN（A股 / 场内 ETF）**；用户点名美股/港股再切换并声明数据差异。各 `lean-*` 须同时满足：① `## A股适配（默认）`；②「何时使用」首句默认 CN；③「步骤」第 1 步确认默认 CN；④「分析架构」含微观/制度风险；⑤ 禁止美股清单直套与自由做空 |
| **非引擎** | **禁止假装本机运行 LEAN Runtime**；禁止伪造 LEAN 回测曲线、订单日志或 QuantConnect 云端结果；取数/计算仅限 Opptrix 工具与 `opptrix_run` 沙盒 |
| **slash-rank** | **400–530**（与既有投研簇错开；W1–W2 约 400–455，W3–W4 约 460–530） |
| **交付** | 与其他投研技能相同：`default-deliverable: web`，`create_web` 四件套 + `artifacts`；网页 TOC 第 1 节为「范围：默认 A股/场内 ETF + LEAN 溯源」，并保留「A股适配与限制」 |
| **诚实横幅** | 如流动性筛选（非官方 QC500）、Pearson（无协整声明）、Black-Litterman / 利率地产 / 情绪文本（assumption-only）、波动通道无 VIX、参数网格未做 Walk-forward 等，须开篇声明；无 VIX/官方 QC500 等不可硬适配时标 partial / assumption-only / not-feasible-now |

与相邻技能边界示例：`lean-pearson-pairs`（仅相关）vs `@skill:pairs-rv`（价差框架）；`lean-param-grid-optimize` vs `@skill:robustness-check` / `@skill:factor-research`。

## Frontmatter：`references`

YAML frontmatter 可选字段 `references`：字符串数组，列出技能内附加文件的**相对路径**（如 `references/chain-knowledge.json`）。

| 约束 | 说明 |
|------|------|
| 条数 | ≤ 16 |
| 路径 | 相对路径；禁止绝对路径、`..`、NUL |
| 用途 | 索引与设置页预览；运行时仍通过 `get_agent_skill_file` / `GET .../file?path=` 按需读取 |

## 渐进披露

1. **Discovery**：system 注入短目录（仅 name + description）
2. **Activation**：`activate_agent_skill` → 会话 sticky（最多 **3** 个）→ 注入完整正文（约 20k 字截断保护）→ 按声明自动挂 Tool Pack
3. **Resources**：`get_agent_skill_file` 按需读 `references/` / `scripts/` / `assets/`（路径 confine 在技能根内）

系统底线（Layer0）永远高于技能正文；技能不合并进 `rolePersona`。

## `@skill:name` 互调与依赖激活

技能正文可用反引号包裹的 `` `@skill:other-name` `` 引用其它已安装技能。

| 行为 | 说明 |
|------|------|
| **解析** | `resolveSkillDependencies(name)` 从正文提取引用；仅保留**已存在**且非自身的技能名 |
| **自动激活** | `activate_agent_skill` 激活主技能时，递归激活依赖（`AgentSkillSessionStore` + `resolveDeps`） |
| **上限** | 同会话已激活总数 ≤ **3**（含依赖）；超限则跳过依赖并记入 `depNotes` |
| **循环检测** | 访问栈检测环；遇到环跳过并记入 `depNotes`，不死循环 |

返回字段含 `activated` / `skipped` / `active` / `depNotes` / `activated_packs`（及可选 `tools_hint`），便于 Agent 向用户说明未装上的依赖，并直接使用已挂上的工具。

## 内置技能目录

| name | title | 默认交付 | 备注 |
|------|------|----------|------|
| `morning-market-brief` | 早报 | web | `market`/`news`/`portfolio` + `artifacts`；`create_web` |
| `closing-market-brief` | 收盘 | web | `market` + `artifacts` |
| `news-digest` | 资讯摘要 | web | `news` + `artifacts` |
| `equity-deep-dive` | 个股尽调 | web | `fundamentals`/`market`/`instrument_analytics` + `artifacts` |
| `multi-role-research-council` | 投资研讨团 | web | 分析师→多空辩论→主席→风险互评；`run_subagent`；`fundamentals`/`market`/`news`/`instrument_analytics` + `artifacts`；报告署名 Opptrix投资研讨团流程 |
| `earnings-quick-read` | 财报速读 | web | `fundamentals` + `artifacts` |
| `instrument-signals` | 标的信号 | web | `instrument_analytics` + `artifacts` |
| `industry-chain` | 产业链 | web | 知识库 + `industry` + `artifacts` |
| `etf-research` | ETF研究 | web | `etf` + `artifacts` |
| `portfolio-review` | 组合复盘 | web | `portfolio` + `artifacts` |
| `run-backtest` | 策略回测 | web | `strategy_extra` + `artifacts` |
| `strategy-report` | 策略报告 | web | `strategy_extra` + `artifacts` |
| `factor-exposure` | 因子暴露 | web | `portfolio` + `artifacts`；非 Barra |
| `factor-research` | 因子研究 | web | `strategy_extra` + `artifacts`；须写样本期 |
| `robustness-check` | 稳健性检验 | web | `instrument_analytics`/`strategy_extra`/`workspace` + `artifacts` |
| `pairs-rv` | 配对价差 | web | assumption-only；无原生协整库 |
| `universe-screen` | 股票池筛选 | web | 成分+批量快照；非荐股池 |
| `macro-brief` | 宏观简报 | web | `market`/`news` + `artifacts` |
| `style-rotation` | 风格轮动 | web | assumption-only；板块代理风格 |
| `cross-asset` | 跨资产对照 | web | 多市场对照；非风险平价 |
| `liquidity-map` | 流动性地图 | web | 资金流/龙虎榜；无 L2 |
| `catalyst-calendar` | 催化日历 | web | 公告+交易日历；无催化剂库 |
| `northbound-flow` | 北向资金 | web | 字段探测；禁编造净买 |
| `theme-policy-map` | 主题政策地图 | web | 政策主题映射；非产业链上下游 |
| `limit-move-attribution` | 涨跌停归因 | web | 禁明日连板名单 |
| `ah-compare` | AH对照 | web | 汇率假设显式 |
| `mna-event` | 并购事件 | web | 公告条款；无假先例 |
| `ipo-note` | 新股笔记 | web | assumption-only |
| `precedent-tx` | 先例交易 | web | **not-feasible-now**；无先例库横幅 |
| `seo-refi` | 再融资条款 | web | **not-feasible-now**；无历史折价库 |
| `credit-brief` | 信用简报 | web | **not-feasible-now**；禁伪造评级 |
| `esg-scan` | ESG扫描 | web | **not-feasible-now**；禁伪造 ESG 分数 |
| `create-web` | 网页报告 | web | 投研 HTML **默认载体**；`/opptrix-vendor`；禁 CDN |
| `create-canvas` | 投研画布 | 备选 | 用户点名画布 / 一页式机构报告 |
| `create-mindmap` | 结构脑图 | 备选 | 用户只要结构图 |
| `browser-browse` | 网页浏览 | none | `browser`；不强迫 web |
| `scheduled-jobs` | 定时任务 | none | `automation`；写入前确认 |
| `create-skill` | 新建技能 | none | 引导 frontmatter（含展示元数据与 web 交付约定） |

### `industry-chain` 与知识库

- Frontmatter：`references: [references/chain-knowledge.json]`
- 步骤要求先 `get_agent_skill_file(skill_name="industry-chain", path="references/chain-knowledge.json")` 再匹配行业节点
- 代表公司可用 `get_sector_list` / `get_sector_constituents` / `search_instruments` 补全，禁止编造
- **默认交付** `create_web` HTML 产业链报告；用户只要结构图时用 `create_mindmap`

### 意图路由（相对旧硬编码工具）

| 用户说法（示例） | 走工作流技能 | **勿**再推荐的旧路径 |
|------------------|--------------|----------------------|
| 早报、开市简报、盘前速览 | `morning-market-brief` | 已删除的 `get_morning_brief` / Hub `market_report` |
| 收盘报告、尾盘复盘 | `closing-market-brief` | 已删除的 `get_closing_report` / Hub `market_report` |
| 投资研讨团、多角色研讨、多空辩论、研究委员会、研讨链、TradingAgents | `multi-role-research-council` | 勿用 `evaluate_instrument` 评分卡代替；勿仅刷资讯；报告品牌用 Opptrix投资研讨团流程，禁 TradingAgents研究会 |
| 产业链、上下游、行业透视 | `industry-chain` | 已删除的 `industry_mining` / `industry_mermaid` |
| 帮我建工作流技能、新建/定制技能 | `create-skill` → `create_agent_skill` | 勿跳过引导直接 import；勿与 Tool Pack 混淆 |
| 画布、可视化报告、一页式报告、对比表报告、create_canvas | `create-canvas` → `create_canvas` | 投研默认用网页；勿用正文 chart 围栏冒充完整报告；勿用 `workspace_write` |
| 网页、HTML、离线图表页、交互页面、投研报告页、create_web | `create-web` → `create_web` | **投研默认交付**；只许 `/opptrix-vendor`；禁 CDN；勿与画布混淆 |
| 思维导图、脑图、mindmap、结构图、create_mindmap | `create-mindmap` → `create_mindmap` | 仅结构图；勿与完整报告混淆 |
| 回测、run_backtest | `run-backtest` → `run_backtest` | 自动挂 `strategy_extra`；勿口头编造回测 |
| 策略报告、strategy_report | `strategy-report` → `strategy_report` | 自动挂 `strategy_extra` |
| ETF、场内基金、净值、持仓 | `etf-research` | 自动挂 `etf` |
| 持仓、组合复盘、关注列表 | `portfolio-review` | 自动挂 `portfolio`；勿荐股调仓 |
| 新闻、资讯、公告摘要 | `news-digest` | 自动挂 `news` |
| 打开网页、浏览链接、截图 | `browser-browse` | 自动挂 `browser` |
| 定时任务、预约任务 | `scheduled-jobs` | 自动挂 `automation`；写入前须确认 |
| 技术指标、策略信号、evaluate_instrument | `instrument-signals` | 自动挂 `instrument_analytics`；信号≠荐股 |

### `create-skill` 与附件创建

- 内置引导技能：先 `activate_agent_skill(create-skill)`，再按步骤收集需求
- `create_agent_skill` / `POST /api/agent-skills` 支持 `references` 与 `files: [{ path, content }]`
- 附件路径须在 `references/`、`scripts/`、`assets/` 下；写入时自动合并进 frontmatter `references`

市场全景数据仍用 Tool Pack `market` 下的 `get_market_dynamics` 等；技能只规定**步骤与输出形状**。

## Agent 工具（meta pack）

| 工具 | 说明 |
|------|------|
| `list_agent_skills` | 索引（name + description + source） |
| `activate_agent_skill` | 会话激活；自动解析 `` `@skill:` `` 依赖；按 `allowed-tools` / `required-packs` 自动挂 Tool Pack；上限 3；返回 `depNotes`、`activated_packs` |
| `get_agent_skill` | 读完整步骤说明 |
| `get_agent_skill_file` | 读附件（须 confine） |
| `create_agent_skill` | 创建（须 `ask_user` + `confirmed=true`；可选 `references`、`files`） |
| `import_agent_skill` | 导入 Markdown（须确认） |
| `delete_agent_skill` | 删用户技能（须确认；不可删内置） |

## REST / 设置页

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agent-skills` | 列表 |
| GET | `/api/agent-skills/:name` | 详情（含正文） |
| POST | `/api/agent-skills` | 创建（可含 `references`、`files: [{ path, content }]`） |
| POST | `/api/agent-skills/import` | 粘贴导入 |
| POST | `/api/agent-skills/:name/fork` | **复制内置**为用户可编辑副本（同名已存在则 409） |
| PUT | `/api/agent-skills/:name` | **更新**用户技能（内置只读 → 403，须先 fork） |
| GET | `/api/agent-skills/:name/file?path=` | 预览附件内容 |
| DELETE | `/api/agent-skills/:name` | 删除用户技能 |

设置页 → **工作流技能**：列表、粘贴导入、**fork 内置后编辑**、删除用户技能。内置只读；要改步骤须先 fork。

## 包

`@opptrix/agent-skills` — 解析、校验、Registry、依赖解析、prompt 组装、fork/update。

详见 [API.md](./API.md)、[AGENT-GUIDE.md](./AGENT-GUIDE.md)。
