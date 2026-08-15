---
name: performance-attribution
description: 组合业绩归因。用户说「业绩归因」「收益分解」「贡献度」「Brinson」「谁贡献了收益」「/performance-attribution」时使用。partial；非完整 Brinson；须有方法局限专节。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 业绩归因
  summary: 持仓收益贡献分解与方法局限说明
  category: portfolio
  slash-rank: "230"
  default-deliverable: web
  required-packs: portfolio market artifacts
allowed-tools: get_portfolio_holdings portfolio_summary analyze_portfolio batch_instrument_snapshots ask_user create_web update_web read_web list_web_vendor
---

# 业绩归因

## 何时使用

用户要理解 **持仓/组合收益由哪些标的或因子贡献**，而非一般组合复盘结构。边界：结构与集中度用 `@skill:portfolio-review`；压力情景用 `@skill:stress-test`。完整度 **partial**：**非完整 Brinson**（缺规范基准与行业配置数据时不做伪 Brinson）；须设 **方法局限专节**。

## 分析架构（投研方法）

- **问题/假设**：区间收益主要来自哪些持仓？集中贡献是否过高？
- **证据清单**：持仓、组合摘要、批量行情（区间若可得）、用户指定基准（可选）
- **多维交叉验证**：个股贡献加总 vs 组合摘要；权重 vs 涨跌贡献
- **结论与不确定**：贡献分解为模型输出；归因叙事为推断
- **风险与缺口**：无成本价/无区间收益、无基准、非完整 Brinson
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 持仓 | `get_portfolio_holdings` | 无法归因则 not-feasible |
| 摘要 | `portfolio_summary` | 用明细估算并说明 |
| 诊断 | `analyze_portfolio` | 可选 |
| 行情 | `batch_instrument_snapshots` | 仅用持仓内已有盈亏字段 |
| 基准/区间 | `ask_user` | 不做伪 Brinson；仅持仓贡献 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认归因区间与是否有基准**。
2. **取持仓与摘要**；按需批量快照。
3. **贡献分解**：权重 × 收益（或可用盈亏字段）；列出 Top/Bottom 贡献。
4. **方法局限专节**：说明非完整 Brinson、基准缺失、交易成本未计入等。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；标注 **partial**。

## 网页报告建议目录

1. 组合范围、区间与时效  
2. 总收益/盈亏摘要（事实）  
3. 持仓贡献表与图  
4. 集中贡献说明  
5. **方法局限专节**  
6. 事实 | 假设 | 推断分栏  
7. 风险与缺口  
8. 免责声明（无调仓建议）

## 禁止

- 荐股/调仓；假装完整 Brinson 或官方业绩报告  
- 编造基准收益  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 缺少方法局限专节  
- assumption / not-feasible 须诚实降级
