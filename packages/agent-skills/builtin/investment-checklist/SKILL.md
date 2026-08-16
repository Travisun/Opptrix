---
name: investment-checklist
description: 巴菲特买入前六关 Checklist。用户说「买入前检查」「过一遍 checklist」「镜子测试」「/investment-checklist」时使用。目标是排除坏选择；C 级数据不足≠否决。易混 equity-deep-dive（完整尽调）。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 买入前 Checklist
  summary: 六关评分 + 镜子测试 + 快速否决，给出通过/否决/灰色
  category: thinking
  slash-rank: "106"
  default-deliverable: web
  required-packs: fundamentals market artifacts workspace
allowed-tools: search_instruments batch_instrument_snapshots get_instrument_snapshot get_instrument_quotes get_instrument_financials get_instrument_financial_indicators get_instrument_cash_flow get_instrument_dividend get_instrument_profile get_instrument_shareholders list_news_articles get_current_time ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor run_subagent list_subagents reclaim_subagent
references:
  - scripts/checklist_score.py
  - scripts/financial_rigor.py
  - scripts/fixtures/sample_checklist.json
---

# 巴菲特买入前 Checklist

对一家或多家公司过六关。**宁可错过，不可做错**——目标是排除坏选择。

## 何时使用 / 非目标

| 使用 | 不要用 |
|------|--------|
| 买入前快速过关 / 多公司对比 | 完整四大师深度长文 → `@skill:investment-research` |
| 镜子测试与快速否决 | 通用尽调叙事 → `@skill:equity-deep-dive` |
| | 收益型分配专评 → `@skill:income-investment` |

## 研究质量（硬性）

- A/B/C：C 级不勉强填满六关；**数据不足 = 灰色地带**，≠ 通过/否决  
- 镜子测试不可跳过：≤5 句话说不清 → **不买**  
- 快速否决一票否决；诚信污点不可被高分对冲  
- 关键财务用 `financial_rigor`；署名 **Opptrix · AI Berkshire 投研流程**

## 六关

1. **能力圈**：一句话说清赚钱方式；10 年后还做什么  
2. **好生意**：ROE/毛利/FCF/轻资产/负债（`verify-valuation`）  
3. **护城河**：五类 +「给对手 100 亿能否复制」  
4. **管理层**：诚信、资本配置、利益对齐  
5. **安全边际**：倍数分位 + `three-scenario`  
6. **纪律**：FOMO/停牌五年/200 字理由  

每关 ★1–5（无半星）。

## Opptrix 取数

精简 #1 栈：`search_instruments` / `batch_instrument_snapshots` / financials / indicators / cash_flow / dividend / profile / shareholders / news。多公司可并行子 Agent，须回收。

## 脚本

```bash
# Agent 对每关打星并写入 JSON 后：
python scripts/checklist_score.py --input checklist.json --output score.json

python scripts/financial_rigor.py verify-valuation --price ... --eps ...
python scripts/financial_rigor.py three-scenario --price ... --eps ... --shares ...
```

`checklist_score` 输出 `pass` / `conditional_pass` / `reject` / `grey`；`data_mode` 随 gates 完整度自适应。

## 步骤

1. 解析公司列表；未上市 → N/A 简述  
2. A/B/C 标注  
3. 取数 → 六关评分 → 镜子测试 → 快速否决清单  
4. `checklist_score.py` 汇总；多公司总览表  
5. `create_web`：每家一章 + 明确结论  

## 快速否决（触发即否决）

说不清赚钱方式；连续 3 年 FCF 为负无改善；诚信污点；护城河不可逆侵蚀；博傻；无法承受归零；纯跟风；写不清 200 字理由。

## 网页目录建议

1. 总览对比表  
2. 各公司六关 + 数据表 + 镜子测试 + 结论  
3. 否决/灰色说明  
4. 免责声明  

## 禁止

- 跳过镜子测试给「通过」  
- C 级因填不满表格就否决  
- 原仓库路径 / 脚本联网  
