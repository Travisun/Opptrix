---
name: management-deep-dive
description: 管理层纵深研究。用户说「买股票就是买人」「管理层研究」「CEO 诚信」「资本配置能力」「承诺兑现」「/management-deep-dive」时使用。诚信一票否决；追踪承诺 vs 兑现与资本配置。默认 create_web；署名 Opptrix · AI Berkshire 投研流程。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 管理层纵深研究
  summary: 诚信一票否决，纵深评估能力、资本配置与治理
  category: deep-research
  slash-rank: "52"
  default-deliverable: web
  required-packs: fundamentals market news workspace artifacts
allowed-tools: search_instruments ask_user get_current_time get_instrument_profile get_instrument_shareholders get_instrument_dividend get_instrument_financials get_instrument_financial_indicators get_instrument_quotes get_instrument_notices get_notice_content list_news_articles get_news_article http_fetch browser_navigate workspace_write workspace_read opptrix_run create_web update_web read_web list_web_vendor
references:
  - scripts/financial_rigor.py
  - scripts/report_audit.py
  - scripts/run_rigor_json.py
  - scripts/scorecard.py
  - scripts/fixtures/sample_scorecard_full.json
  - scripts/fixtures/sample_verify_market_cap.json
---

# 管理层纵深研究

> 「买股票就是买人。」—— 段永平  
> 「评估管理层，要看他们在没人看着的时候做什么。」—— 巴菲特

输入：`公司名` 或 `人名 公司名`。署名：**Opptrix · AI Berkshire 投研流程**。

## 何时使用 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 管理层是核心逻辑，或投资研究中管理层评分不确定 | 资本配置短评 → `@skill:management-capital`（勿合并） |
| 需要承诺兑现率、危机中品格、资本配置逐笔评估 | 完整四大师公司研究 → `@skill:investment-research` |
| | 仅财报 MD&A 语气 → `@skill:earnings-review` |

本技能是投资研究「管理层模块」的**深化版**，不是完整公司尽调替代品。

## 研究质量（硬性）

- **诚信一票否决**：品格问题 → 综合档位 **不通过**，估值再便宜不打分对冲。  
- 看行为不看言辞；逆风决策权重大于顺风叙事。  
- A/B/C：履历与激励公开不足时标 C，允许留白，禁止假精确。  
- 强制结论：是否愿意把钱交给此人管 10 年（段永平三问）。  
- `get_current_time`；事实/观点分栏。

## 取数

| 维度 | 工具 |
|------|------|
| 画像/股东 | `get_instrument_profile` / `get_instrument_shareholders` |
| 分红/回购线索 | `get_instrument_dividend` / `get_instrument_financials` / `get_instrument_financial_indicators` |
| 公告原文 | `get_instrument_notices` / `get_notice_content` |
| 履历与舆论补洞 | `list_news_articles` / `http_fetch` / `browser_navigate` |
| 估值验算（回购时点） | 行情 `get_instrument_quotes` + 脚本 |

```bash
python scripts/run_rigor_json.py --input data.json --output result.json
# command: verify-valuation / verify-market-cap / cross-validate
python scripts/scorecard.py --input evidence.json --output scorecard.json
```

`scorecard` 的 `scores` 可映射：诚信→`duan`，战略执行→`buffett`，资本配置→`munger`，治理/继任→`li`；`gates.integrity_veto=true` 强制不通过。

## 步骤

### 1 — 识别关键决策人

表格：CEO/董事长、CFO、创始人（是否仍灵魂人物）、实控人、其他关键高管（任期/背景/持股）。区分「头衔上的人」与「真正做决策的人」。

可并行子任务（可选 `run_subagent`，用完即 reclaim）：发言与预测 / 资本配置 / 治理薪酬 / 侧面验证。

### 2 — 能力圈：战略与执行

过去 5 年公开发言：判断 vs 实际结果表。执行：战略落地、组织、危机、纠错速度。

### 3 — 诚信（最重要）

承诺 vs 兑现表 + 兑现率档位（>80% 优秀 … <40% 严重问题）。困难时期应对。利益相关方态度表（股东/员工/客户/供应商/社会）。

### 4 — 资本配置

并购 / 回购（`verify-valuation`）/ 分红 / 新业务投入逐笔评分 → 综合资本配置分。

### 5 — 治理

AB 股/VIE、持股变化、薪酬占利润比、关联交易。

### 6 — 侧面验证

员工/客户/行业口碑（公开可及）；标可得性；缺失写「不足」。

### 7 — CEO 离开情景 + 段永平三问

正直？有能力？愿意托付 10 年？→ 映射星级与决策档位。

### 8 — 交付

`create_web`；署名；免责声明。可选抽检 `report_audit`。

## 综合评分权重

| 维度 | 权重 |
|------|------|
| 诚信度 | 35% |
| 战略与执行 | 25% |
| 资本配置 | 25% |
| 治理结构 | 15% |

## 禁止

- 诚信有污点仍给「通过」  
- 爱上管理层叙事；无证据编造兑现率  
- 脚本联网；与 `management-capital` 混用边界不清  
- 无 web 交付结束（除非用户只要口头要点）  
