---
name: multi-role-research-council
description: 多角色研讨 / 多空辩论工作流。用户说「多角色研讨」「多空辩论」「研究委员会」「研讨链」「TradingAgents」「multi-role-research-council」「/多角色研讨」时使用。四类分析师并行取证 → Bull/Bear 辩论（2–5 轮自适应）→ 主席综合研究立场 → 风险三人互评 → create_web 综合研究报告。研究立场为看多/看空倾向（非买卖指令）；须附固定免责声明。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 多角色研讨
  summary: 多空辩论与风险互评，交付综合研究报告
  category: decision
  slash-rank: "42"
  default-deliverable: web
  required-packs: fundamentals market news instrument_analytics artifacts
allowed-tools: search_instruments ask_user run_subagent list_subagents get_subagent reclaim_subagent cancel_subagent update_research_checklist get_instrument_snapshot get_instrument_quotes get_instrument_chart get_instrument_profile get_instrument_financials get_instrument_balance_sheet get_instrument_cash_flow get_instrument_income_statement get_instrument_financial_indicators get_instrument_money_flow get_instrument_cyq get_market_sentiment get_cn_market_special get_dragon_tiger get_limit_updown list_news_articles get_news_article get_instrument_notices get_notice_content get_instrument_institution_rating get_instrument_institution_report create_web update_web read_web list_web_vendor
references:
  - references/role-templates.md
  - references/result-schemas.json
  - references/debate-stop-rules.md
  - references/report-outline.md
  - references/checklist-template.json
  - references/cn-market-playbook.md
---

# 多角色研讨

## 何时使用

用户要对**单只股票/标的**做 **TradingAgents 式多角色互评**：多空辩论 + 风险视角交叉，最终交付**综合研究报告**（默认可预览网页）。触发词含：多角色研讨、多空辩论、研究委员会、研讨链、TradingAgents、`/多角色研讨`。

**边界（勿硬跳转其他技能）**：

- 只要单人尽调长文、不要辩论链 → 说明本技能侧重互评；用户坚持单人路径时可口头改做尽调要点，**不要**硬写 `` `@skill:equity-deep-dive` ``
- 只要空头情景、不要完整研讨链 → 可缩小为 Bear 侧攻击表，**不要**硬写 `` `@skill:bear-case` ``
- 只要现价/快照 → 不要激活本技能

可引用 `` `@skill:create-web` `` 补齐 HTML 交付规范。

## 分析架构（投研方法）

- **问题/假设**：在可得证据下，研究立场更接近看多倾向、看空倾向、均衡，还是证据不足？
- **角色链（固定顺序）**：
  1. 四类**分析师**（可并行）：行情结构 / 基本面 / 资讯披露 / 资金情绪
  2. **Bull / Bear** 辩论（2–5 轮自适应停止）
  3. **research_chair** 综合 → 研究立场枚举
  4. **风险三人**（进取 / 中性 / 稳健）两阶段互评
  5. 父 Agent 汇总 → `create_web`
- **研究立场枚举**（对用户文案）：
  | 枚举 | 用户文案 |
  |------|----------|
  | `bullish` | 看多倾向 |
  | `bearish` | 看空倾向 |
  | `balanced` | 均衡 |
  | `insufficient_evidence` | 证据不足 |
- **证据纪律**：事实与推断分栏；禁止把研究立场写成买卖/仓位指令
- **编排**：全程用父会话 `run_subagent`；子任务禁止再委派；阶段结束须 `reclaim_subagent`

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的定位 | `search_instruments` / 快照 | 多候选时 `ask_user` |
| 行情结构 | `get_instrument_snapshot` / `get_instrument_chart` / 报价 | 标明无实时价 |
| 基本面 | `get_instrument_profile` / `get_instrument_financials` 及三表/指标 | 「暂无该期数据」 |
| 资讯 | `list_news_articles` → `get_news_article` | 省略资讯章 |
| 公告披露 | `get_instrument_notices` → `get_notice_content` | 省略公告章 |
| 资金情绪 | `get_instrument_money_flow` / `get_market_sentiment` / 龙虎榜等（见 A股对照） | 省略资金章 |
| 机构观点（可选） | `get_instrument_institution_rating` / `get_instrument_institution_report` | 标明未纳入 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

工具对照详见 `get_agent_skill_file(..., path="references/cn-market-playbook.md")`。**禁止**虚构不存在的资讯工具名。

## 步骤（S0–S7）

### S0 — 确认范围与清单

1. 确认标的（代码/名称）；多候选 `ask_user`。
2. 读附件：`role-templates.md`、`result-schemas.json`、`debate-stop-rules.md`、`checklist-template.json`、`report-outline.md`、`cn-market-playbook.md`（经 `get_agent_skill_file`）。
3. `update_research_checklist` 写入清单模板各项（进行中）。

### S1 — 四分析师并行取证

对行情结构 / 基本面 / 资讯披露 / 资金情绪各 `run_subagent`（`mode` 按耗时选 foreground 或 background）：

- `role` / `instructions`：按 `references/role-templates.md`
- `result_schema`：`result-schemas.json` → `analyst`
- 子 Agent 自行调用允许的取数工具；父不代写结论数字

四路完成后：`get_subagent` 收结果 → **立即** `reclaim_subagent` → checklist 勾选对应项。

### S2 — Bull / Bear 辩论（自适应轮次）

1. 将四分析师 JSON 摘要注入 Bull、Bear 的 `task`/`context`。
2. 每轮：先 Bear 攻击（或按模板约定序），再 Bull 回应（或反之）；双方均用 `debate` schema。
3. 每轮结束后由父（或轻量 chair 子任务）用 `chair_stop` schema 判定是否停止；规则见 `debate-stop-rules.md`（最少 2 轮、最多 5 轮）。
4. 每轮子任务终态后 **reclaim**；禁止堆积未回收会话。

### S3 — research_chair 综合

1. `run_subagent`：role=`research_chair`，schema=`research_chair`。
2. 输出必须含：`stance`（四枚举之一）、`stance_label_zh`、关键论据、未决问题、数据缺口。
3. reclaim；checklist 更新。

### S4 — 风险三人（两阶段）

**阶段 A（并行）**：进取 / 中性 / 稳健各自独立出具风险备忘（schema=`risk`），只读主席结论 + 分析师摘要，互不看到对方草稿。

**阶段 B（互评）**：将三人草稿交叉注入，再各跑一轮短评（仍用 `risk`，字段标注 `phase: "peer_review"`）：指出他人遗漏与过度自信。

全部 reclaim。

### S5 — 父 Agent 汇总

合并：分析师要点、辩论收敛点、主席立场、风险共识与分歧。事实 | 推断 | 缺口分栏。研究立场只用上表用户文案，并强调**非买卖建议**。

### S6 — 交付网页

`list_web_vendor` → `create_web`（完整 HTML；图表仅用本地 vendor）。目录与**固定免责声明**见 `report-outline.md`。已有则 `read_web` / `update_web`。规范可参考 `` `@skill:create-web` ``。

### S7 — 收尾

checklist 全部完成或标注跳过原因；取消仍在跑的子任务（`cancel_subagent`）；确认无未 reclaim 的协作任务。

## 网页报告建议目录

见 `references/report-outline.md`（须含固定免责声明全文）。

## 禁止

- 荐股、目标价、仓位%、买卖时机；把 `bullish`/`bearish` 写成「买入/卖出」指令  
- 编造未返回的财务/资金/公告事实  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 子 Agent 再 `run_subagent`；跳过 reclaim 导致会话堆积  
- 辩论不足 2 轮就出主席结论，或超过 5 轮仍强行继续  
- 使用不存在的工具名（如 `get_instrument_news`）  
- 在用户可见文案中暴露内部实现术语
