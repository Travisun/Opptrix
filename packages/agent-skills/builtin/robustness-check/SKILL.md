---
name: robustness-check
description: 稳健性检验工作流（verify_instrument_strategy + opptrix_run 扰动网格）。用户说「稳健性」「参数敏感性」「扰动检验」「网格搜索」「/robustness-check」时使用。对策略/信号做参数扰动并汇总；默认 create_web 交付。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 稳健性检验
  summary: 策略参数扰动与验证网格
  category: quant
  slash-rank: "270"
  default-deliverable: web
  required-packs: instrument_analytics strategy_extra workspace artifacts
allowed-tools: verify_instrument_strategy run_backtest opptrix_run ask_user workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 稳健性检验

## 何时使用

用户要验证策略/信号在**参数扰动**下是否仍站得住，而非单次点估计回测。边界：单次回测用 `@skill:run-backtest`；因子研究用 `@skill:factor-research`。

## 分析架构（投研方法）

- **问题/假设**：结论是否依赖某一组「刚好好看」的参数？
- **证据清单**：`verify_instrument_strategy` 结果、`run_backtest`（若适用）、`opptrix_run` 扰动网格输出
- **多维交叉验证**：基准参数 vs 邻域网格；胜率/回撤分布是否塌缩
- **结论与不确定**：稳健≠可交易；网格设计本身可过拟合
- **风险与缺口**：无法批量回测、标的数据不足
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的与策略 | `ask_user` | 先确认 |
| 基准验证 | `verify_instrument_strategy` | 说明工具失败原因 |
| 回测对照 | `run_backtest` | 仅做信号层验证 |
| 扰动网格 | `opptrix_run`（可 `workspace_write` 固化表） | 手工列出少量扰动并标明非穷尽 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认基准参数**与扰动维度（窗口、阈值、阈值等）。
2. **跑基准** `verify_instrument_strategy`（及可选 `run_backtest`）。
3. **扰动网格**：用 `opptrix_run` 批量计算；结果表可 `workspace_write`。
4. **汇总稳健性**：哪些参数邻域结论同向/翻转；事实与推断分栏。
5. **交付网页（默认）**：热力/表格用本地 vendor；见 `@skill:create-web`。

## 网页报告建议目录

1. 检验范围与基准参数
2. 基准验证/回测结果
3. 扰动网格设计与结果表
4. 稳健性结论（事实 / 推断）
5. 过拟合与缺口
6. 免责声明

## 禁止

- 荐股；编造网格结果
- 只展示「最好看」的一组参数隐瞒其余
- **禁止无交付就结束**
