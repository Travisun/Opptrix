---
name: investment-team
description: 四角色并行投研团队。用户说「投研团队」「四大师并行」「team 研究」「多 Agent 投研」「/investment-team」时使用。Team Lead + 段/巴/芒/李四角色经 run_subagent 并行独立成稿再综合；禁止联网失败伪装。默认 create_web；署名 Opptrix · AI Berkshire 分析。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 四角色并行投研团队
  summary: Team Lead 统筹，四大师并行独立研究后交叉验证并强制结论
  category: deep-research
  slash-rank: "51"
  default-deliverable: web
  required-packs: fundamentals market news workspace artifacts
allowed-tools: search_instruments ask_user get_current_time run_subagent list_subagents get_subagent reclaim_subagent cancel_subagent update_research_checklist get_instrument_snapshot get_instrument_quotes get_instrument_profile get_instrument_financials get_instrument_income_statement get_instrument_balance_sheet get_instrument_cash_flow get_instrument_financial_indicators get_instrument_dividend get_instrument_shareholders list_news_articles get_news_article get_instrument_notices get_notice_content http_fetch browser_navigate workspace_write workspace_read opptrix_run create_web update_web read_web list_web_vendor
references:
  - references/role-briefs.md
  - references/checklist.json
  - scripts/financial_rigor.py
  - scripts/report_audit.py
  - scripts/run_rigor_json.py
  - scripts/scorecard.py
  - scripts/fixtures/sample_scorecard_full.json
  - scripts/fixtures/sample_verify_market_cap.json
---

# 四角色并行投研团队

对用户指定标的做**真正并行**的四大师投研，再由 Team Lead（父 Agent）综合。署名：**Opptrix · AI Berkshire 分析**。

## 何时使用 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 需要四角色**独立成稿**再交叉验证 | 单人七模块深度研究 → `@skill:investment-research` |
| 重要标的首次/重大重做，愿付并行成本 | 多空辩论研讨团 → `@skill:multi-role-research-council`（勿合并） |
| | 未上市六侦察 → `@skill:private-company-research` |
| | 财报专属团队 → `@skill:earnings-team` |

## 研究质量（硬性）

同契约：四大师、强制结论档位、镜子测试、A/B/C、快速否决、事实/观点分栏、`get_current_time`、禁止训练知识冒充联网结果。  
**并行纪律**：禁止「一个 prompt 切四段」冒充对抗；四角色必须各自 `run_subagent` 独立取证成稿。

## 团队结构

| 角色 | 视角 | 职责 |
|------|------|------|
| Team Lead（父） | 综合 | 统筹、交叉验证、scorecard、定稿、`create_web` |
| business-analyst | 段永平 | 生意本质、护城河、用户价值 |
| financial-analyst | 巴菲特 | 财务质量、估值、安全边际（须跑 rigor） |
| industry-researcher | 芒格 | 行业格局、竞争、失败路径 |
| risk-assessor | 李录 | 风险、管理层、长期确定性 |

详细 brief：`get_agent_skill_file(..., path="references/role-briefs.md")`。

## 取数

与 `@skill:investment-research` 相同工具栈。财务角色须 `workspace_write` 后 `opptrix_run`：

```bash
python scripts/run_rigor_json.py --input data.json --output result.json
python scripts/scorecard.py --input evidence.json --output scorecard.json
```

脚本**不联网**。第二源由 Agent 用公告/资讯/`http_fetch` 写入后再 `cross-validate`。

## 并行编排（对齐 multi-role-research-council）

### S0 — 范围与预检

1. 确认标的；多候选 `ask_user`。`get_current_time`。评定 A/B/C，写入 checklist。
2. `update_research_checklist` 加载 `references/checklist.json`。
3. **取数可达性预检**：父 Agent 先试一次 `get_instrument_snapshot`（或等价工具）。若失败 → **停止启动子 Agent**，醒目标注并询问用户是否继续（继续则整份报告顶栏标注降级，`data_mode=proxy/insufficient`）。后台子任务无法向用户弹权限确认时，父必须先保证工具可用。

### S1 — 四角色并行（硬性）

在同一轮对四角色各调用一次 `run_subagent`（可 background）：

- `role` / `instructions`：按 `role-briefs.md`；注入标的、A/B/C、数据截止。
- 子 Agent **自行取数**；父不代写结论数字。
- **联网/取数失败禁止伪装**：子报告顶部必须醒目标注「未能刷新数据，置信度降级」，并如实告知 Team Lead；Lead 可中止研究。

四路终态后：`get_subagent` 收结果 → **立即 `reclaim_subagent`** → checklist 勾选。禁止堆积未回收会话；子 Agent **禁止再** `run_subagent`。

### S2 — 交叉验证与综合

1. 比对四稿关键数字冲突；财务稿须含 rigor 输出摘要。
2. 找共识与矛盾（矛盾优先分析）。
3. 镜子测试 + 快速否决；`scorecard.py` 输出档位。
4. 强制结论：通过 / 有条件通过 / 不通过 / 灰色地带。

### S3 — 抽检与交付

`report_audit` extract → 核验 → verdict。`list_web_vendor` → **`create_web`**。署名 **Opptrix · AI Berkshire 分析** + 免责声明。

### S4 — 收尾

checklist 完成或标注跳过；`cancel_subagent` 清理残留；确认无未 reclaim 任务。

## 最终报告结构

1. 一句话结论 + 决策档位 + A/B/C  
2. 四维评分总表（1–5）与综合分  
3. 核心数据速览（近 2 年）  
4. 各维度摘要（每角 3–5 条）  
5. Bull vs Bear  
6. 买入前 Checklist（10 项）  
7. 分层建议（激进/稳健/保守）+ 价格/条件区间  
8. 镜子测试；AI 置信度 vs 投资确定性  
9. 免责声明  

## 禁止

- 伪并行（单上下文四段）；跳过 reclaim  
- 联网失败仍输出「完整已刷新」报告  
- 覆盖研讨团技能语义；无强制结论；C 级假完整  
- 脚本联网；源仓路径；无 web 交付结束（除非用户只要口头要点）  
