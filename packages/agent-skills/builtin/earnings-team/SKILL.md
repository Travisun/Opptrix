---
name: earnings-team
description: 财报精读团队 + 成稿。用户说「财报团队」「四大师读财报」「财报公众号成稿」「/earnings-team」时使用。四角色并行精读 → 合成底稿 → 编辑+读者评审 → create_web。署名 Opptrix · AI Berkshire 投研流程。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 财报精读团队
  summary: 四大师并行精读财报，合成后经编辑与读者评审成稿
  category: earnings
  slash-rank: "54"
  default-deliverable: web
  required-packs: fundamentals market news workspace artifacts
allowed-tools: search_instruments ask_user get_current_time run_subagent list_subagents get_subagent reclaim_subagent cancel_subagent update_research_checklist get_instrument_notices get_notice_content get_instrument_income_statement get_instrument_balance_sheet get_instrument_cash_flow get_instrument_financials get_instrument_financial_indicators get_instrument_quotes get_instrument_snapshot http_fetch browser_navigate read_document workspace_write workspace_read opptrix_run create_web update_web read_web list_web_vendor
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

# 财报精读团队 + 成稿

输入：`公司名 季度`。三阶段：研究 → 合成 → 发布。署名：**Opptrix · AI Berkshire 投研流程**。

## 何时使用 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 重要公司关键财报，需要深度 + 可读成稿 | 单人精读 → `@skill:earnings-review` |
| 四大师并行读同一期财报 | 非财报公众号三 Agent → `@skill:wechat-article` |
| | 全面公司研究团队 → `@skill:investment-team` |

## 研究质量（硬性）

一手优先（A/B/C 资料可得性）；强制超/符/低预期；论文影响四态；反面检验；禁止太极结论。并行独立成稿再综合。

## 团队角色

| 阶段 | 角色 | 大师 | 核心问题 |
|------|------|------|----------|
| 研究 | Team Lead（父） | — | 统筹、找交集与矛盾、定稿 |
| 研究 | business-reader | 段永平 | 生意变好还是变差？ |
| 研究 | financial-auditor | 巴菲特 | 真钱还是假钱？安全边际？ |
| 研究 | competition-reader | 芒格 | 竞争格局怎么变？ |
| 研究 | risk-hunter | 李录 | 隐瞒与风险信号？ |
| 发布 | editor | — | 研究报告 → 可读长文 |
| 发布 | reader-reviewer | — | 可读性/价值/可信度/行动指引 |

Brief：`references/role-briefs.md`。

## 取数与脚本

同 `@skill:earnings-review`。巴菲特角色必须跑 rigor（cross-validate / verify-market-cap / verify-valuation / three-scenario）。

```bash
python scripts/run_rigor_json.py --input data.json --output result.json
python scripts/scorecard.py --input evidence.json --output scorecard.json
python scripts/report_audit.py extract --report draft.md
```

## 并行编排（硬性）

### 阶段一 · 研究

1. `get_current_time`；拉取一手材料；评定 A/B/C；`update_research_checklist`。  
2. 父先验证公告/财务工具可达；失败则停并降级标注。  
3. **同一轮** `run_subagent` ×4（四大师）；子任务禁止再委派。  
4. 每路终态：`get_subagent` → **立即 `reclaim_subagent`**。  
5. 取数失败禁止伪装：顶栏降级声明。

### 阶段二 · 合成

综合四稿：共识点、矛盾点、被忽略角落。产出研究底稿（结构见下）。`scorecard.py` 辅助档位。

### 阶段三 · 发布

并行 `run_subagent`：editor + reader-reviewer → reclaim。Lead 处理「必须修改」，通读定稿。`report_audit` 准出 → **`create_web`**（可一篇成稿；底稿可 `workspace_write`，注意附件体积）。

### 收尾

`cancel_subagent`；无未 reclaim。

## 研究底稿目录

1. 一句话结论  
2. 本期最重要 3 个变化  
3. 四大师评分表  
4. 核心数据速览  
5. 各视角深度摘要  
6. 管理层语气与承诺  
7. 四大师会怎么做  
8. 结论四问  

## 成稿原则

保留专业深度与关键数据；倒金字塔；标题有信息量不做标题党；正反面；文末「所以呢」对持有者/观望者分别写清；免责声明。

## 禁止

- 伪并行；跳过 reclaim；拼报告不找矛盾  
- 「基本符合」太极；编辑降维成空话科普  
- 脚本联网；与 earnings-review / wechat-article 边界混淆  
- 无 web 交付结束（除非用户只要口头要点）  
