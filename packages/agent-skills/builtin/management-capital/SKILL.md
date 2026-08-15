---
name: management-capital
description: 管理层与资本配置评估。用户说「管理层」「资本配置」「回购分红」「ROE 质量」「管理层履历」「/management-capital」时使用。assumption-only；无 managerInfo tool；可用 browser 补履历。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 管理层与资本配置
  summary: 资本回报与配置行为的结构化评估
  category: equity
  slash-rank: "175"
  default-deliverable: web
  required-packs: fundamentals news browser artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_cash_flow get_instrument_news browser_navigate browser_snapshot ask_user create_web update_web read_web list_web_vendor
---

# 管理层与资本配置

## 何时使用

用户要评估 **管理层相关线索与资本配置行为**（分红、回购、再投资、并购扩张等），而非只要财务速读。边界：盈利质量数字框架用 `@skill:earnings-quality`；竞争壁垒用 `@skill:competitive-moat`。完整度 **assumption-only**：仓库 **无 managerInfo 专用工具**；履历类信息需用户提供或经 **browser** 补公开网页，并标明来源与时效。

## 分析架构（投研方法）

- **问题/假设**：资本回报是否与再投资决策一致？现金用途是否清晰？
- **证据清单**：财务与现金流、资讯中的分红回购并购、公开履历网页（browser）
- **多维交叉验证**：FCF vs 分红回购；ROE/ROIC 趋势 vs 扩张叙事
- **结论与不确定**：配置行为描述为事实；「管理层优秀/糟糕」为推断
- **风险与缺口**：无结构化高管库、网页来源不可靠、海外披露差异
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 概况 | `get_instrument_profile` | 业务章从简 |
| 财务/现金流 | `get_instrument_financials` / `get_instrument_cash_flow` | 配置分析降级 |
| 事件资讯 | `get_instrument_news` | 省略近期事件 |
| 履历/公开介绍 | `browser_navigate` + `browser_snapshot` | 标明无履历；不编造简历 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与关注点**（分红回购 / 并购 / 管理层变动）。
2. **取财务与资讯事实**。
3. **履历补全**：无专用 tool → 经 browser 读公司/监管公开页，或 `ask_user`；失败则 omission。
4. **资本配置框架**：来源与用途、回报趋势、激励线索（仅公开事实）。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；标注 **assumption-only**。

## 网页报告建议目录

1. 标的与时效  
2. 资本配置事实摘要（分红/回购/投资/筹资）  
3. 回报指标趋势（若有）  
4. 管理层公开信息与来源（browser/用户）  
5. 评估框架结论（推断分栏）  
6. 事实 | 假设 | 推断  
7. 缺口与 not-feasible 项  
8. 免责声明（无买卖建议；非尽职调查替代）

## 禁止

- 荐股；编造高管履历或未披露薪酬  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 假装存在 managerInfo 工具结果  
- assumption / not-feasible 须诚实降级  
- 禁止人格攻击式「管理层评价」
