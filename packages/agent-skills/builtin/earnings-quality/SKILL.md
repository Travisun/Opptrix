---
name: earnings-quality
description: 盈利质量分析。用户说「盈利质量」「利润含金量」「应计」「现金流质量」「earnings quality」「/earnings-quality」时使用。vs earnings-quick-read：本技能深挖质量而非速读亮点；含 financial_indicators；不做假造假实锤。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 盈利质量
  summary: 利润与现金流匹配度的质量体检
  category: equity
  slash-rank: "170"
  default-deliverable: web
  required-packs: fundamentals artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_income_statement get_instrument_balance_sheet get_instrument_cash_flow get_instrument_financial_indicators ask_user create_web update_web read_web list_web_vendor
---

# 盈利质量

## 何时使用

用户要评估 **会计利润的质量与可持续性**（现金流匹配、应计、费用资本化线索、一次性项目等），而非只要报告期速读亮点。边界：vs `@skill:earnings-quick-read`——速读给关键数字变化；本技能给 **质量框架与红旗清单**。三表完整预测模型用 `@skill:financial-model`。

## 分析架构（投研方法）

- **问题/假设**：利润增长是否由经营现金支撑？是否存在质量红旗需跟踪？
- **证据清单**：三表、财务指标、概况中的业务描述
- **多维交叉验证**：净利润 vs 经营现金流；应收/存货 vs 收入；非经常性 vs 扣非（若可得）
- **结论与不确定**：比率与科目为事实；「操纵嫌疑」仅为待查推断，**不做造假实锤**
- **风险与缺口**：缺指标、跨市场科目名差异
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的与报告期 | `ask_user` / 用户指定 | 先确认 |
| 财务摘要 | `get_instrument_financials` | 质量结论降级 |
| 三表 | income / balance / cash_flow 工具 | 缺表现省略对应检验 |
| 指标 | `get_instrument_financial_indicators` | 用原始科目手算并说明 |
| 概况 | `get_instrument_profile` | 不做强行行业对比 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与报告期**。
2. **取数**：财务摘要、三表、`get_instrument_financial_indicators`。
3. **质量体检**：现金转化、应计粗估、营运资本压力、一次性项目（若可识别）。
4. **红旗清单**：仅列「待核实」项，禁止实锤造假。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 标的、报告期与时效  
2. 利润与经营现金流对照  
3. 关键质量指标表  
4. 营运资本与应计线索  
5. 红旗 / 待核实清单（推断）  
6. 事实 | 假设 | 推断分栏  
7. 风险与数据缺口  
8. 免责声明（无买卖建议；非审计结论；不做造假实锤）

## 禁止

- 荐股；指控财务造假并写成既定事实  
- 编造指标  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 与速读技能混淆：只列同比不做质量框架  
- assumption / not-feasible 须诚实降级
