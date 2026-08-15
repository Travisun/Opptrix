---
name: comps-analysis
description: 可比公司 / Trading Comps 估值工作流。用户说「可比公司」「对标估值」「同业估值」「Trading Comps」「PE/PB 对标」「comps」「/comps-analysis」时使用。构建同业样本、汇总倍数与溢折价；默认可预览 HTML（create_web）。数据完整度为 partial：缺样本或关键倍数时诚实降级。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 可比公司
  summary: 同业倍数与溢折价一页看清
  category: valuation
  slash-rank: "120"
  default-deliverable: web
  required-packs: fundamentals industry market artifacts
allowed-tools: search_instruments get_sector_list get_sector_constituents get_index_constituents batch_instrument_snapshots get_instrument_profile get_instrument_financials get_instrument_snapshot ask_user create_web update_web read_web list_web_vendor
---

# 可比公司（Trading Comps）

## 何时使用

用户要对**目标公司相对同业的交易倍数**做估值对照（PE/PB/PS/EV 等可用项），而非完整 DCF 或估值球场汇总页。边界：不做 `@skill:dcf-model` 的现金流折现；不做 `@skill:football-field` 的多方法区间并排总览——本技能聚焦 **Trading Comps 样本与倍数表**。

## 分析架构（投研方法）

- **问题/假设**：目标相对同业是溢价还是折价？驱动因素是增长、盈利质量还是情绪？
- **证据清单**：行业/板块成分、指数成分、批量快照、概况与财务、目标与样本现价
- **多维交叉验证**：业务相似度 vs 倍数离散；增长/利润率 vs 溢折价；剔除异常值前后结论是否稳健
- **结论与不确定**：中位数/分位为事实汇总；「应交易在 X 倍」为推断且须标假设
- **风险与缺口**：样本过少、跨市场口径、缺 EV/净利导致倍数不可比
- **事实 | 假设 | 推断** 必须分栏：报表与行情为事实；可比标准与剔除规则为假设；溢折价含义为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 目标标的 | `search_instruments` / `ask_user` | 多候选先确认 |
| 行业/板块池 | `get_sector_list` → `get_sector_constituents` | 改用指数或用户给定名单 |
| 指数对照 | `get_index_constituents` | 省略指数列 |
| 批量行情 | `batch_instrument_snapshots` | 逐只 `get_instrument_snapshot` 并注明慢路径 |
| 概况/业务 | `get_instrument_profile` | 仅用代码/名称做弱可比 |
| 财务/倍数输入 | `get_instrument_financials` | 缺关键科目则该倍数标「不可比」 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认目标与可比范围**：行业、市值带、是否含海外；不清则 `ask_user`。
2. **构建样本池**：板块/指数成分 → 去重 → 业务相似度初筛（概况）。
3. **取数**：批量快照 + 财务；计算可用倍数；标注口径与报告期。
4. **汇总与交叉验证**：中位数/分位、目标分位、异常值；事实/假设/推断分栏。
5. **交付网页（默认）**：`list_web_vendor` → `create_web` 完整 HTML（倍数表 + 可选本地 vendor 散点/箱线）；已有则 `read_web` / `update_web`。完整规范见 `@skill:create-web`。
6. **数据完整度**：标注 **partial**——样本不足或关键倍数缺失时诚实降级，禁止填假数。

## 网页报告建议目录

1. 目标卡片与数据时效  
2. 可比标准与样本筛选规则（假设）  
3. 样本名单与业务相似度说明  
4. Trading Comps 倍数表（含中位数/分位）  
5. 目标相对同业溢折价（事实汇总 + 推断分栏）  
6. 敏感性：剔除异常值 / 换样本  
7. 风险、缺口与后续观察  
8. 免责声明（无买卖建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回的倍数或样本  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 禁止把本页伪装成完整 DCF 或 football-field 总览  
- assumption / not-feasible（样本过少、口径不可比）须诚实降级并写明原因  
- 禁止假装「市场共识倍数」若工具未返回共识数据
