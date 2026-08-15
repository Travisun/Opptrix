---
name: dcf-model
description: DCF / 现金流折现估值工作流。用户说「DCF」「折现」「自由现金流估值」「WACC」「终值」「内在价值模型」「/dcf-model」时使用。显式假设驱动；默认 create_web 交付。WACC/永续增长率等仅作假设并 ask_user；可用 opptrix_run + workspace_write 固化模型。assumption-only：禁止假装卖方共识。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: DCF模型
  summary: 显式假设下的折现估值框架
  category: valuation
  slash-rank: "125"
  default-deliverable: web
  required-packs: fundamentals workspace artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_income_statement get_instrument_cash_flow ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# DCF 模型（现金流折现）

## 何时使用

用户要做**显式假设驱动的 DCF / FCFF·FCFE 折现框架**，而非同业倍数表或估值球场汇总。边界：相对估值用 `@skill:comps-analysis`；多方法区间并排用 `@skill:football-field`。本技能产出 **假设透明的折现模型 + 网页报告**，完整度标记为 **assumption-only**。

## 分析架构（投研方法）

- **问题/假设**：在何种增长、利润率、再投资与折现率下，内在价值区间如何？
- **证据清单**：历史财务与现金流（事实）、用户确认的 WACC/g/预测期（假设）、情景结果（模型输出）
- **多维交叉验证**：历史增长 vs 预测增长；FCF 转化 vs 会计利润；终端价值占比是否过高
- **结论与不确定**：价值区间随假设变动；禁止输出「唯一正确目标价」
- **风险与缺口**：缺历史 FCF、无法估净债务、跨市场税率/WACC 不可比
- **事实 | 假设 | 推断** 分栏：历史数字为事实；WACC/g/增长路径为假设；「合理价值带」为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认再建模 |
| 概况 | `get_instrument_profile` | 业务章从简 |
| 财务与利润 | `get_instrument_financials` / `get_instrument_income_statement` | 标明历史基期不足 |
| 现金流 | `get_instrument_cash_flow` | 改用间接推算并标假设 |
| 关键假设 | `ask_user`（WACC、g、预测期、税率等） | **禁止**静默填「市场共识」 |
| 计算固化 | `opptrix_run` + `workspace_write` | 仅聊天展示公式并说明未落盘 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与模型口径**：FCFF vs FCFE、币种、预测年数。
2. **拉取历史事实**：财务/利润/现金流；整理基期 FCF 与净债务（若可得）。
3. **收集假设**：对 WACC、永续 g、收入/利润率路径等 **必须 ask_user**；不得假装共识或卖方默认值。
4. **建模**：可用 `opptrix_run` 计算；关键中间表 `workspace_write` 便于复用。
5. **情景与敏感性**：基准/乐观/悲观；对 WACC 与 g 做二维敏感。
6. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。
7. **标注 assumption-only**：全程区分事实/假设/推断；不可行则写 not-feasible 原因。

## 网页报告建议目录

1. 标的与模型口径、数据时效  
2. 历史基期与事实摘要  
3. 显式假设表（WACC、g、增长、税率等）  
4. 预测期现金流与终值拆解  
5. 企业价值 → 股权价值桥（若可得净债务）  
6. 情景与敏感性（事实输出 + 推断解读分栏）  
7. 局限、缺口与复算清单  
8. 免责声明（无买卖建议；非目标价承诺）

## 禁止

- 荐股；编造历史数字或「华尔街共识 WACC」  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- **禁止假装共识**：未返回的一致预期/WACC 不得写成市场共识  
- assumption / not-feasible 须诚实降级（缺基期、用户拒给关键假设则中止估值结论）  
- 禁止把单一点估计包装成「公允目标价」
