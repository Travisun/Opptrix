# AI Berkshire → Opptrix Skill 映射清单（定稿）

> 源仓库：`/Users/mac/Documents/ai-berkshire`（xbtlin/ai-berkshire）  
> Canonical 工作流：`skills/*.md`（Claude Code slash 源）；`codex-skills/*/SKILL.md` 大多由 sync 生成  
> 额外纳入：`codex-skills/investment-memo-craft`（Codex-only 手写，无同名 `skills/*.md`）  
> 目标分支：`new-ai-berkshire-skills`  
> 用途：供后续逐个实现 Agent Skill；**本文件只做映射，不含实现**。  
> 脚本与数据流契约见 [`ai-berkshire-skill-contract.md`](./ai-berkshire-skill-contract.md)。

## 覆盖范围

| 来源 | 处理 |
|------|------|
| `skills/*.md`（20） | 全部映射为独立基础 skill |
| `codex-skills/investment-memo-craft` | 额外映射 1 个写作/排版叠加 skill |
| 投研总入口 | 新增 `ai-berkshire`，按场景路由全部基础 skill |
| `tools/*.py` 中取数型（`ashare_data` / `twstock_data` / `xueqiu_scraper` / `morningstar_fair_value` / `stock_screener` / `momentum_backtest*`） | **不**单独建 skill；由 Opptrix Agent 工具替换，或在契约中禁止脚本联网 |
| `tools/financial_rigor.py` / `tools/report_audit.py` | **不**单独建 skill；算法移植为各需严谨计算的 skill 内 `scripts/` |
| Claude Code 内置 `/deep-research` | 非本仓分发，**不映射** |

## 命名与边界约定

- skill name：小写连字符，**无 `ab-` / `qp-` 前缀**，≤64，`[a-z0-9]+(-[a-z0-9]+)*`
- 与现有 builtin **冲突改名**（勿覆盖）：
  - 源 `thesis-tracker` → **`value-thesis-tracker`**
  - 源 `portfolio-review` → **`value-portfolio-review`**
- 其余尽量保留原名（`investment-research`、`investment-team`、…）
- 投研总入口 skill：**`ai-berkshire`**（单独一行）
- 默认产物：投研/内容类均为可预览 **web**（`create_web`）；纯规范类可为 web 或 checklist 页；署名见契约

## 统计

| 项 | 数量 |
|----|-----:|
| 基础 skill（可独立实现） | **21** |
| 投研总入口 | **1**（`ai-berkshire`） |
| 映射表行数 | **22** |
| 分类 | deep-research=5，earnings=2，industry=4，portfolio=5，thinking=3，content=1，overlay=1，orchestrator=1 |

## 映射表

| # | 源路径 | Opptrix skill name | 中文标题 | 类别 | 核心理念要点 | 原数据/工具依赖 | Opptrix 替换取数（具体工具名） | 计划 scripts | 默认产物 | 完备风险 | 边界备注（与现有 builtin 易混技能） |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `skills/investment-research.md` | `investment-research` | 四大师综合深度研究 | deep-research | 巴菲特/芒格/段永平/李录四视角系统研究；强制结论；信息丰富度 A/B/C；反共识与留白 | WebSearch/WebFetch；`financial-data`；`financial_rigor`；`report_audit` | `search_instruments` → `get_instrument_snapshot` / `get_instrument_quotes` / `get_instrument_profile` / `get_instrument_financials` / `get_instrument_income_statement` / `get_instrument_balance_sheet` / `get_instrument_cash_flow` / `get_instrument_financial_indicators` / `get_instrument_dividend` / `get_instrument_shareholders`；资讯 `list_news_articles` / `get_news_article` / `get_instrument_notices` / `get_notice_content`；补洞 `http_fetch` / `browser_navigate`；写盘 `workspace_write` | `scripts/financial_rigor.py`；`scripts/report_audit.py` | web | 多市场一手财报可能缺口；须 `data_mode` 自适应 | 易混 `equity-deep-dive`（通用尽调，无四大师强制框架）；勿合并 |
| 2 | `skills/investment-team.md` | `investment-team` | 四角色并行投研团队 | deep-research | Team Lead + 四大师并行独立研究再综合；禁止联网失败伪装；强制交叉验证 | 同 #1 + 多 Agent 并行（源用 Claude Team） | 同 #1；并行用 `run_subagent` / `list_subagents` / `reclaim_subagent`；编排写入 `update_research_checklist` | 同 #1 | web | 子 Agent 权限/联网与成本高；须防伪完整报告 | 易混 `multi-role-research-council`（研讨团多空辩论，非四大师框架）；勿合并 |
| 3 | `skills/management-deep-dive.md` | `management-deep-dive` | 管理层纵深研究 | deep-research | 「买股票就是买人」；诚信一票否决；资本配置与激励 | WebSearch；财报/回购；`financial_rigor verify-valuation` | `get_instrument_profile` / `get_instrument_shareholders` / `get_instrument_dividend` / `get_instrument_financials` / `get_instrument_notices`；履历补洞 `browser_*` / `http_fetch` / `list_news_articles` | `scripts/financial_rigor.py` | web | 公开履历与激励数据常不足 → C 级须留白 | 易混 `management-capital`（资本配置短评，非人物纵深）；勿合并 |
| 4 | `skills/private-company-research.md` | `private-company-research` | 未上市公司深度研究 | deep-research | 信息稀缺下还原生意真实价值；多 Agent；诚实留白；禁止虚假精确 | WebSearch/WebFetch；几乎无标准财报 API；融资轮次/可比公司 | 公开线索：`http_fetch` / `browser_*` / `list_news_articles` / `search_library`；可比上市同业用 `search_instruments` + `get_instrument_*`；用户导入融资 JSON → `workspace_write` | 可选 `scripts/financial_rigor.py`（可比/情景算术） | web | 数据缺口极高；默认常 `proxy`/`insufficient` | 勿与 `equity-deep-dive` 混用（后者偏上市标的） |
| 5 | `skills/deep-company-series.md` | `deep-company-series` | 《看懂 XX》长文系列 | deep-research | 3–8 篇公众号级系列；事实核查优先于文采；篇数按复杂度适配 | 一手财报 + 第三方口径；可复用同公司 earnings/research 报告 | 同 #1 取数栈；系列文稿 `workspace_write`；终稿 `create_web`（可多页/多附件） | 可选 `scripts/report_audit.py`（关键数字抽检） | web | 超长文易超附件上限，须拆 `references/` 或多 skill 产物 | 易混 `wechat-article`（单篇三 Agent）；本 skill 为多篇系列 |
| 6 | `skills/earnings-review.md` | `earnings-review` | 财报精读（一手资料） | earnings | 只读原始财报/纪要；像巴菲特读年报；非原始须标注 | 年报/季报原文；`financial_rigor`；`report_audit`；`financial-data` | `get_instrument_notices` / `get_notice_content`；三表 `get_instrument_income_statement` / `get_instrument_balance_sheet` / `get_instrument_cash_flow` / `get_instrument_financials`；原文补洞 `http_fetch` / `browser_*` / `read_document` | `scripts/financial_rigor.py`；`scripts/report_audit.py` | web | 非 CN 市场原文可得性不一 | 易混 `earnings-quick-read`（速读摘要）；本 skill 为一手精读；勿合并 |
| 7 | `skills/earnings-team.md` | `earnings-team` | 财报精读团队 + 成稿 | earnings | 四大师并行读财报 → 合成底稿 → 编辑润色 → 读者评审 | 同 #6 + 多 Agent + 发布向文风 | 同 #6 + `run_subagent` 并行；成稿 `create_web` | 同 #6 | web | 流程长、产物多文件，注意附件上限 | 易混 `earnings-review`（单人精读）与 `wechat-article`（非财报专属） |
| 8 | `skills/industry-research.md` | `industry-research` | 产业链全景投资研究 | industry | 产业链切片 + 各环节头部公司四大师框架；信息充分度标注 | WebSearch；行业报告；个股财务 | `get_sector_list` / `get_sector_constituents` / `search_instruments` + 批量 `batch_instrument_snapshots` / `get_instrument_financials`；宏观 `get_macro_series`；资讯 `list_news_articles` | `scripts/financial_rigor.py`；`scripts/report_audit.py` | web | 全产业链覆盖面广，易半成品 | 易混 `industry-chain`（知识库透视，非四大师投研）；勿合并 |
| 9 | `skills/industry-funnel.md` | `industry-funnel` | 行业漏斗筛选 | industry | 全市场→粗筛≤10→终选 3→四大师短评 + 仓位建议 | WebSearch；硬指标筛选；终选深度短文 | `search_instruments` / `get_sector_constituents` / `batch_instrument_snapshots` / `get_instrument_financial_indicators` / `evaluate_instrument`；终选再走 #1 子集工具 | 可选 `scripts/quality_gate.py`（规则打分）；`scripts/financial_rigor.py` | web | 全市场宇宙依赖成分/列表完整性 | 易混 `universe-screen` / `quality-screen`；漏斗含终选深度分析 |
| 10 | `skills/quality-screen.md` | `quality-screen` | 去劣筛选（7 条硬指标） | industry | 宁可漏网不可误杀；7 硬指标 + 豁免规则；批量个股/行业/指数/主题 | WebSearch 拉 ROE/FCF/毛利率等历史序列 | `get_instrument_financial_indicators` / `get_instrument_financials` / `get_instrument_cash_flow` / `batch_instrument_snapshots`；宇宙 `get_index_constituents` / `get_sector_constituents` / `search_instruments` | `scripts/quality_screen.py`（读 panels 打分）；可选 `financial_rigor.py` | web | 10 年 ROE 等长历史字段可能 `proxy` | 易混 `universe-screen`、`lean-qc500-style-screen`、`lean-magic-formula`；本 skill 为价值投资去劣，非量化因子 |
| 11 | `skills/bottleneck-hunter.md` | `bottleneck-hunter` | 供应链瓶颈猎手 | industry | 超级趋势→物理瓶颈→标的；瓶颈≠机会；估值透支检验；台股月营收信号 | WebSearch；台股 `twstock_data`；估值手算 | 趋势/新闻 `list_news_articles` / `http_fetch` / `browser_*`；标的 `search_instruments` + `get_instrument_quotes` / `get_instrument_financials`；台股缺口诚实声明或用户导入月营收 JSON | `scripts/financial_rigor.py` | web | 供应链一手数据弱；台股月营收可能不足 | 易混 `theme-policy-map` / `industry-research`；本 skill 聚焦瓶颈套利 |
| 12 | `skills/investment-checklist.md` | `investment-checklist` | 巴菲特买入前 Checklist | thinking | 六关筛选；镜子测试不可跳过；快速否决清单；C 级≠否决 | WebSearch；`financial_rigor` 估值/三情景 | 同 #1 精简取数；多标的 `batch_instrument_snapshots` | `scripts/financial_rigor.py` | web | 多公司对比时取数量大 | 易混 `equity-deep-dive` / `coverage-initiation`；Checklist 目标是排除坏选择 |
| 13 | `skills/income-investment.md` | `income-investment` | 收益型分配能力分析 | portfolio | 可持续收益 vs 机会型高息 vs 收益率陷阱；安全门否决覆盖打分 | 一手财报；股息/派息；`financial_rigor`；`report_audit`；A/B/C | `get_instrument_dividend` / `get_instrument_cash_flow` / `get_instrument_financials` / `get_instrument_financial_indicators` / `get_instrument_balance_sheet` | `scripts/financial_rigor.py`；`scripts/report_audit.py` | web | 派息可持续性需多期现金证据 | 易混 `credit-brief` / `seo-refi`；非信用债分析 |
| 14 | `skills/portfolio-review.md` | **`value-portfolio-review`** | 价值投资组合审视 | portfolio | 从研究公司到管理组合；「今天还会买吗」；集中度与相关性；三情景预期回报 | 持仓清单；WebSearch；`financial_rigor` | 用户持仓 JSON/`get_portfolio_holdings` / `portfolio_summary` / `analyze_portfolio` / `get_watchlist`；行情财务同 #1；`batch_instrument_snapshots` | `scripts/financial_rigor.py` | web | 无持仓文件时须用户提供权重 | **勿覆盖**现有 `portfolio-review`（关注列表/持仓事实复盘，不做价值调仓建议）；边界写清 |
| 15 | `skills/thesis-tracker.md` | **`value-thesis-tracker`** | 价值投资论文追踪 | portfolio | 买入后纪律：核心假设/红线/估值锚点；红线触发即行动建议 | 既有 research/team 报告；WebSearch；`financial_rigor` | 读既有产物 `workspace_read` / `read_document` / `search_library`；刷新锚点 `get_instrument_quotes` / `get_instrument_financial_indicators` / `list_news_articles` | `scripts/financial_rigor.py` | web | 依赖历史论文结构；无基线先建档 | **勿覆盖**现有 `thesis-tracker`（workspace SSOT 论点看板）；本 skill 为巴菲特式论文红线纪律 |
| 16 | `skills/thesis-drift.md` | `thesis-drift` | 投资论文漂移检测 | portfolio | 只认证据变化；区分事实/估值/措辞；禁止文风漂移制造假变化 | 两份报告路径；`financial_rigor`；依赖 thesis 结构 | `workspace_read` / `read_document` 对比两份；数值差用 scripts 验算；可选刷新行情工具 | `scripts/financial_rigor.py`；可选 `scripts/thesis_drift_diff.py` | web | 缺结构化基线时只能部分抽取 | 易混 `thesis-update` / `value-thesis-tracker`；本 skill 专做新旧对比 |
| 17 | `skills/news-pulse.md` | `news-pulse` | 股价异动快速归因 | portfolio | 四侦察并行（公司/监管/对手/情绪）；是否触发论文重审；10 分钟判断 | WebSearch/WebFetch；可选 `xueqiu_scraper` | `get_instrument_quotes` / `get_instrument_chart`；`list_news_articles` / `get_news_article` / `get_instrument_notices` / `get_notice_content`；补洞 `http_fetch` / `browser_*`；并行 `run_subagent`；**禁止**移植雪球爬虫凭据 | 无强制脚本（纯编排） | web | 社交媒体情绪源弱；勿假装雪球全量 | 易混 `news-digest`（摘要）与 `limit-move-attribution`；本 skill 为异动归因+论文重审门闩 |
| 18 | `skills/dyp-ask.md` | `dyp-ask` | 段永平式问答 | thinking | 以段永平思维方式回答；大道至简；不装懂宏观 | 一般无强制取数；涉及时事可搜 | 按需 `list_news_articles` / `http_fetch`；多数回合无需工具 | 无 | web（或短答+可选 web） | 人设一致性依赖提示词质量 | 无同名 builtin；勿做成通用聊天替身 |
| 19 | `skills/financial-data.md` | `financial-data` | 财务数据交叉验证规范 | thinking | 关键数据双源；误差>1%标记；市值手算；台股 FinMind 规范 | `ashare_data` / `twstock_data`；多市场站点 | **规范 skill**：取数统一走 `get_instrument_*` 族 + `http_fetch` 第二源；校验走 `scripts/financial_rigor.py`；台股专属 API **不**在脚本内联网 | `scripts/financial_rigor.py`（规范演示/验算） | web（规范说明页） | 作为被其他 skill 引用的 SSOT 规范 | 非 `get_instrument_financials` 工具本身；其他 AB skill 应引用本规范而非另起口径 |
| 20 | `skills/wechat-article.md` | `wechat-article` | 公众号三 Agent 成稿 | content | 作者→编辑→读者；可发布中文长文 | WebSearch；主题研究 | 主题取证同新闻/财报工具子集；三角色 `run_subagent`；成稿 `create_web` | 无强制；涉财务时用 `financial_rigor.py` | web | 非投研决策主路径；质量依赖评审环 | 易混 `deep-company-series` / `earnings-team` 成稿阶段 |
| 21 | `codex-skills/investment-memo-craft/`（Codex-only） | `investment-memo-craft` | 投研报告写作与版式叠加 | overlay | 决策可读性：生意机制、可证伪护城河、逆向、估值→行动；冷静 Markdown 版式；不替代取数/审计 | 叠加在 research/team 等产出之上 | 读已有底稿 `workspace_read`；需要时补 `get_instrument_*`；终稿 `create_web` | 无（写作叠加）；数字仍须上游 rigor | web | 单独使用无研究底稿易空转 | 易混 `thesis-memo`（短论点备忘）与 `ic-memo`；本 skill 为长文研究报告版式/判断叠加 |
| 22 | （Opptrix 新增总入口） | `ai-berkshire` | AI Berkshire 投研流程 | entry | 按场景路由到全部基础 skill；强制质量规则；默认 web 交付与统一署名 | 路由全部 #1–#21；共享 `financial-data` 规范 | 路由激活：`activate_agent_skill` / `get_agent_skill`；取数与子流程委托各基础 skill；并行 `run_subagent`；交付 `create_web` | 可选 `scripts/route_hints.json`（场景→skill）；无联网脚本 | web | 路由不当会重复跑重 skill → 成本爆炸 | 易混 `multi-role-research-council`；本 skill 是价值投资 skill 总入口，不是研讨团 |

## 源工具层对照（不单独建 skill）

| 源 `tools/` | 职责 | Opptrix 处置 |
|-------------|------|----------------|
| `financial_rigor.py` | Decimal 市值/估值/交叉验证/三情景/Benford/精确 calc | 移植进需严谨计算的 skill `scripts/`；经 `opptrix_run` 调用 |
| `report_audit.py` | 报告数字抽检 extract →（Agent 取数）→ verdict | 同上移植；**脚本本身不联网取数** |
| `ashare_data.py` | A 股行情/财务/估值/搜索（curl） | 由 `get_instrument_*` / `search_instruments` 替换；禁止 skill 脚本再 curl |
| `twstock_data.py` | 台股 FinMind 行情/财务/月营收 | 有能力则 `get_instrument_*`；否则 `insufficient`/`proxy` + 用户导入 |
| `xueqiu_scraper.py` | Playwright 雪球爬虫（凭据） | **不移植**；用新闻/公告工具或用户粘贴 |
| `morningstar_fair_value.py` | Morningstar 筛选器抓取 | **不移植**；估值用 `evaluate_instrument` / 财务工具 |
| `stock_screener.py` / `momentum_backtest*.py` | 动量+价值演示筛/回测 | **不映射为 AB skill**；量化类见 quants/lean 技能 |
| `star_history_chart.py` | 仓库星标图 | 与投研无关，忽略 |

## 实现优先级建议（非绑定）

1. **P0 规范与骨架**：`financial-data`、`investment-checklist`、`quality-screen`、契约内 `financial_rigor`/`report_audit` 脚本模板  
2. **P1 主研究路径**：`investment-research` → `investment-team` → `earnings-review`  
3. **P2 持仓纪律**：`value-thesis-tracker`、`thesis-drift`、`value-portfolio-review`、`news-pulse`  
4. **P3 行业/系列/内容**：`industry-funnel`、`industry-research`、`bottleneck-hunter`、`deep-company-series`、`wechat-article`、`investment-memo-craft`  
5. **P4 总入口收口**：`ai-berkshire`（依赖基础 skill 就绪）

## 完整 skill 名列表（22）

**基础（21）**：`investment-research`、`investment-team`、`management-deep-dive`、`private-company-research`、`deep-company-series`、`earnings-review`、`earnings-team`、`industry-research`、`industry-funnel`、`quality-screen`、`bottleneck-hunter`、`investment-checklist`、`income-investment`、`value-portfolio-review`、`value-thesis-tracker`、`thesis-drift`、`news-pulse`、`dyp-ask`、`financial-data`、`wechat-article`、`investment-memo-craft`

**总入口（1）**：`ai-berkshire`

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-08-16 | 定稿：20 canonical + `investment-memo-craft` + 总入口 `ai-berkshire`；冲突改名 `value-thesis-tracker` / `value-portfolio-review` |
| 2026-08-16 | 分支 `new-ai-berkshire-skills`：21 基础 + `ai-berkshire` 投研流程已落地（SKILL + 必要 scripts/references）；禁止外部源仓路径；取数走 Opptrix 工具 |
| 2026-08-16 | 产品命名：`ai-berkshire` 展示名/署名由「编排」改为「投研流程」 |
