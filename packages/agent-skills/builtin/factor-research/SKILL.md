---
name: factor-research
description: 因子研究工作流（run_backtest）。用户说「因子研究」「因子回测」「单因子检验」「IC」「多空组合」「/factor-research」时使用。用回测解读因子历史表现；必须写明样本期与过拟合风险；默认 create_web 交付。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 因子研究
  summary: 单因子/多因子历史检验与过拟合警示
  category: quant
  slash-rank: "265"
  default-deliverable: web
  required-packs: strategy_extra artifacts
allowed-tools: run_backtest ask_user create_web update_web read_web list_web_vendor
---

# 因子研究

## 何时使用

用户要做**因子历史有效性/多空表现检验**（非只要组合当下暴露）。边界：当下持仓暴露用 `@skill:factor-exposure`；参数扰动网格用 `@skill:robustness-check`。

## 分析架构（投研方法）

- **问题/假设**：该因子在指定样本期内是否具备可复现的区分度？收益是否伴随不可接受回撤？
- **证据清单**：`run_backtest` 返回的收益、回撤、交易统计；用户声明的因子定义与样本期
- **多维交叉验证**：全样本 vs 分段；收益 vs 换手/成本（若可得）
- **结论与不确定**：历史≠未来；**过拟合**须单独成章
- **风险与缺口**：样本过短、幸存者偏差、无法做真正截面 IC 时诚实降级
- **事实 | 假设 | 推断** 分栏：回测 KPI 为事实；因子构造规则为假设；「仍有效」为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 因子定义与样本期 | `ask_user`（须写清起止日期、再平衡、费用假设） | **禁止**静默用未声明区间 |
| 回测 | `run_backtest` | 写明失败原因，禁止口头编造曲线 |
| 分段/对照 | 多次 `run_backtest` 或工具返回分段 | 标明无法分段验证 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认因子定义**：多空规则、标的池、再平衡频率、费用/滑点假设。
2. **写明样本期**：起止日期必须出现在报告首页；不足则提示拉长或降级。
3. **执行** `run_backtest`；必要时分段再跑。
4. **过拟合审查**：参数是否事后挑选、样本是否过拟合训练区间；无样本外则标明。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；见 `@skill:create-web`。

## 网页报告建议目录

1. 因子定义、样本期与假设表
2. 回测 KPI（全样本）
3. 分段/对照（若有）
4. 过拟合与数据缺口警示
5. 事实 / 推断分栏结论
6. 免责声明（非投资建议）

## 禁止

- 荐股或暗示因子必然持续有效
- 编造未返回的 IC/夏普/曲线；口头「回测」冒充 `run_backtest`
- **禁止隐瞒样本期**或用模糊「长期」代替具体日期
- **禁止无交付就结束**
