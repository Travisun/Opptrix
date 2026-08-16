---
name: income-investment
description: 收益型分配能力分析。用户说「股息能不能持续」「是不是收益率陷阱」「分红覆盖」「核心收益仓」「/income-investment」时使用。可持续收益 vs 机会型高息 vs 陷阱；安全门覆盖打分卡。非信用债分析。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 收益型分配分析
  summary: 检验可分配现金流与安全门，给出收益角色结论
  category: portfolio
  slash-rank: "114"
  default-deliverable: web
  required-packs: fundamentals market artifacts workspace
allowed-tools: search_instruments get_instrument_dividend get_instrument_cash_flow get_instrument_financials get_instrument_financial_indicators get_instrument_balance_sheet get_instrument_income_statement get_instrument_quotes get_instrument_snapshot get_current_time ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/financial_rigor.py
  - scripts/report_audit.py
---

# 收益型分配能力分析

回答：这家公司能否产生**足够耐久且有吸引力**的可分配收益，以支撑核心收益仓或机会型高息角色？**高显示股息率 ≠ 好机会。**

## 何时使用 / 非目标

| 使用 | 不要用 |
|------|--------|
| 股息/派息可持续性、收益率陷阱识别 | 信用债/再融资 → `@skill:credit-brief` |
| 核心收益 vs 机会型收益角色 | 完整买入六关 → `@skill:investment-checklist` |
| | 组合层面调仓总览 → `@skill:value-portfolio-review`（若已实现）或现有持仓复盘 |

## 研究质量（硬性）

- 安全门（覆盖失败、债务危机、结构恶化、诚信、数据不足）**覆盖**打分卡  
- 事实/估计/假设/判断分栏；双源差异 >1% 标记（遵循 `@skill:financial-data`）  
- 强制唯一结论态之一：`CORE INCOME` / `OPPORTUNISTIC INCOME` / `WATCHLIST` / `HOLD – DO NOT ADD` / `REDUCE` / `REJECT / YIELD TRAP` / `INSUFFICIENT DATA`  
- 署名 **Opptrix · AI Berkshire 分析**；非个性化投资建议  

## Opptrix 取数

`get_instrument_dividend` / `get_instrument_cash_flow` / `get_instrument_financials` / `get_instrument_financial_indicators` / `get_instrument_balance_sheet`；报价与快照按需。

行业特殊口径：REIT→FFO/AFFO；银行→资本与可分配利润；保险→偿付；资源→中周期现金流等——缺则降级并说明。

## 脚本

```bash
python scripts/financial_rigor.py verify-valuation ...
python scripts/financial_rigor.py calc ...
python scripts/financial_rigor.py three-scenario ...
python scripts/report_audit.py extract --report draft.md
python scripts/report_audit.py verdict --results results.json --report draft.md
```

脚本不联网；税后净收益在用户未提供居住地/账户类型时只列毛收益并说明不可算。

## 步骤

1. `get_current_time`；解析标的、角色、可选持仓权重  
2. A/B/C；不足则 `INSUFFICIENT DATA`  
3. 分配历史（尽量 5 年）→ 可分配现金追溯 → 质量与耐久 → 估值 → 可用收益 → 组合契合（若有）→ 三情景（须测减息）  
4. 打分卡 + 安全门 → 唯一 verdict  
5. 抽检通过后 `create_web`

## data_mode

多期股息+现金流覆盖可验证 → `full`；缺税/持仓仅公司层结论 → `proxy`；基本面不足以谈分配 → `insufficient`。

## 网页目录（固定结构）

1. 摘要 2. Verdict 与类别 3. 可能组合角色 4. 生意与现金来源 5. 股息历史与日历 6. 覆盖与安全 7. 资产负债表 8. 增长 9. 估值 10. 税与货币 11. 组合契合 12. 三情景 13. 减息风险 14. 买入/加仓条件 15. 减持条件 16. 监测表 17. 一句话结论 18. 来源与数据质量 + 免责声明

## 禁止

- 用打分平均抵消失败安全门  
- 编造净收益税率  
- 原仓库路径 / 脚本联网  
