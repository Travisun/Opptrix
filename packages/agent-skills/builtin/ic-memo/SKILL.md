---
name: ic-memo
description: 投委会 / IC 备忘结构化材料。用户说「投委会」「IC memo」「上会材料」「投资委员会备忘」「/ic-memo」时使用。禁止伪造 PT/仓位%；portfolio 可选。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 投委会备忘
  summary: 上会用结构化论点与风险材料
  category: decision
  slash-rank: "150"
  default-deliverable: web
  required-packs: fundamentals market news portfolio artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_snapshot get_instrument_news get_portfolio_holdings portfolio_summary ask_user create_web update_web read_web list_web_vendor
---

# 投委会备忘（IC Memo）

## 何时使用

用户要准备 **投委会/IC 风格结构化备忘**（议题、论点、风险、决策所需信息），而非日常 thesis 短备忘或覆盖启动长文。边界：日常论点用 `@skill:thesis-memo`；首次覆盖长文用 `@skill:coverage-initiation`。**禁止伪造目标价（PT）与仓位百分比**；组合上下文可选。

## 分析架构（投研方法）

- **问题/假设**：上会要回答的决策问题是什么？支持/反对证据是否充分？
- **证据清单**：基本面、行情、资讯、（可选）现有持仓暴露
- **多维交叉验证**：论点 vs 风险对称性；组合暴露 vs 议题标的（若有持仓）
- **结论与不确定**：材料服务讨论，不代替委员会决议；无伪造 PT
- **风险与缺口**：缺关键数据、无持仓上下文、用户未声明决策问题
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的与议题 | `search_instruments` / `ask_user` | 先确认决策问题 |
| 概况/财务 | `get_instrument_profile` / `get_instrument_financials` | 标明证据不足 |
| 行情 | `get_instrument_snapshot` | 省略价格章 |
| 资讯 | `get_instrument_news` | 省略事件章 |
| 组合暴露（可选） | `get_portfolio_holdings` / `portfolio_summary` | 明确「未纳入组合上下文」 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认上会议题与决策问题**（买入/加仓讨论、观察名单等——仅作结构，不给建议）。
2. **取数**：基本面/行情/资讯；按需组合暴露。
3. **按 IC 结构撰写**：议题 → 论点 → 证据 → 风险与对冲逻辑（非操作指令）→ 待决问题。
4. **严禁**编造 PT、目标仓位 %、未提供的敞口。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 会议元信息：标的、议题、数据时效  
2. 决策问题陈述  
3. 投资论点与关键证据（事实）  
4. 风险、不确定性与证伪条件  
5. 组合上下文（若有；否则标明未纳入）  
6. 事实 | 假设 | 推断分栏  
7. 待决问题清单（供讨论，非指令）  
8. 免责声明（无 PT/仓位建议；禁止伪造）

## 禁止

- **禁止伪造 PT、目标价、仓位 %**；禁止荐股式结论  
- 编造持仓或未返回数据  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- assumption / not-feasible 须诚实降级  
- 禁止把材料写成「委员会已通过」
