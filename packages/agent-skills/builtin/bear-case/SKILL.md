---
name: bear-case
description: 空头情景 / Devil’s advocate 工作流。用户说「空头」「看空逻辑」「反方观点」「证伪多头」「bear case」「/bear-case」时使用。多头假设与攻击点一一对应；默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 空头情景
  summary: 多头假设的系统性质疑与证伪路径
  category: decision
  slash-rank: "145"
  default-deliverable: web
  required-packs: fundamentals news market artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_snapshot get_instrument_news ask_user workspace_read create_web update_web read_web list_web_vendor
---

# 空头情景（Bear Case）

## 何时使用

用户要做 **Devil’s advocate / 空头情景**：系统性质疑多头叙事，列出可验证的攻击点与触发条件。边界：正面论点备忘用 `@skill:thesis-memo`；全面尽调用 `@skill:equity-deep-dive`。本技能强调 **多头假设 ↔ 攻击一一对应**，不是单纯罗列风险词。

## 分析架构（投研方法）

- **问题/假设**：若多头错了，最可能错在哪几条？何种证据会提前示警？
- **证据清单**：财务恶化信号、负面资讯、估值拥挤线索、用户或 workspace 中的多头假设
- **多维交叉验证**：每条多头支柱对照反向证据；区分已发生事实 vs 情景推演
- **结论与不确定**：空头路径为情景（假设驱动）；不得写成「必然下跌」
- **风险与缺口**：无明确多头假设、资讯片面、缺财务
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 多头假设来源 | 用户陈述 / `workspace_read` / 会话 thesis | `ask_user` 索要 2–5 条多头支柱 |
| 概况/财务 | `get_instrument_profile` / `get_instrument_financials` | 仅做定性攻击并降级 |
| 行情 | `get_instrument_snapshot` | 省略估值拥挤章 |
| 资讯 | `get_instrument_news` | 省略舆情攻击点 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **提取多头假设清单**（编号）；缺失则 `ask_user`。
2. **逐条取证攻击**：财务/资讯/结构；每条攻击对应一条多头假设。
3. **情景路径**：温和承压 / 严重恶化；写清触发指标。
4. **事实 | 假设 | 推断** 分栏；标明哪些是已发生、哪些是推演。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 标的与时效  
2. 多头假设清单（编号）  
3. 一一对应攻击表（假设 → 反证/机制）  
4. 空头情景路径与触发条件  
5. 事实 | 假设 | 推断分栏  
6. 观察清单与时间盒  
7. 风险：空头偏见与数据缺口  
8. 免责声明（无做空/买卖建议）

## 禁止

- 荐股、鼓动做空；编造负面「爆雷」事实  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 只写笼统风险、不与多头假设一一对应  
- assumption / not-feasible 须诚实降级  
- 禁止把推断写成已坐实的舞弊结论
