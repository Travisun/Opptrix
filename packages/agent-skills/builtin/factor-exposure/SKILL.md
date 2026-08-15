---
name: factor-exposure
description: 组合因子暴露诊断工作流（analyze_portfolio）。用户说「因子暴露」「风格暴露」「行业暴露」「Barra」「风险因子」「/factor-exposure」时使用。对持仓/关注列表做集中度与结构暴露解读；默认 create_web 交付。声明非官方 Barra 模型。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 因子暴露
  summary: 组合相对风格/行业因子的暴露诊断
  category: quant
  slash-rank: "260"
  default-deliverable: web
  required-packs: portfolio artifacts
allowed-tools: get_watchlist get_portfolio_holdings portfolio_summary analyze_portfolio search_instruments get_instrument_snapshot create_web update_web read_web list_web_vendor
---

# 因子暴露（组合结构诊断）

## 何时使用

用户要看**组合或关注列表相对行业/风格/集中度的暴露结构**，而非单只个股尽调或完整回测。边界：因子有效性检验用 `@skill:factor-research`；扰动稳健性用 `@skill:robustness-check`。

**能力声明**：本技能基于 `analyze_portfolio` 与持仓摘要做**结构暴露诊断**，**不是**官方 Barra / 商业风险模型（无完整因子协方差与特异风险分解）。

## 分析架构（投研方法）

- **问题/假设**：组合是否过度集中于少数行业/个股？风格倾斜是否与用户认知一致？
- **证据清单**：持仓/关注列表、组合摘要、`analyze_portfolio` 诊断输出
- **多维交叉验证**：权重集中度 vs 收益贡献（若可得）；行业权重 vs 个股头部
- **结论与不确定**：暴露为结构事实；「风险过高」属推断
- **风险与缺口**：无持仓、价格刷新失败、跨市场行业口径不一致
- **事实 | 假设 | 推断** 分栏：持仓权重为事实；代理风格标签为假设；风险含义为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 范围 | `ask_user`：持仓 / 关注列表 | 先确认再分析 |
| 列表与持仓 | `get_watchlist` / `get_portfolio_holdings` | 说明为空，给下一步 |
| 摘要 | `portfolio_summary` | 用明细自行汇总并标注 |
| 诊断 | `analyze_portfolio` | 省略诊断章，仅做集中度表 |
| 标的核对 | `search_instruments` / `get_instrument_snapshot` | 跳过价格刷新 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认范围**：持仓、关注列表或用户给定代码清单。
2. **取数**：列表/持仓 → 摘要 → `analyze_portfolio`。
3. **结构化暴露**：行业/个股集中度、头部权重、可得的风格代理字段；**显式声明非 Barra**。
4. **交叉验证**：摘要指标 vs 明细加总；事实/假设/推断分栏。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`（权重饼图/条形图用本地 vendor）；已有则 `read_web` / `update_web`。完整 HTML 规范见 `@skill:create-web`。

## 网页报告建议目录

1. 范围、时效与能力声明（非 Barra）
2. 组合摘要 KPI
3. 行业/个股暴露表
4. 集中度与头部持仓
5. 诊断要点（事实 / 推断分栏）
6. 风险、缺口与后续观察
7. 免责声明（无调仓建议）

## 禁止

- 荐股、调仓、目标仓位；编造暴露数字
- **禁止**把结果写成「官方 Barra 因子暴露」或商业风险模型输出
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 降级数据须标注可信度受限
