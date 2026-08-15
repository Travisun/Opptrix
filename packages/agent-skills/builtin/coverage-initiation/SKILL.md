---
name: coverage-initiation
description: 覆盖启动 / Initiation of Coverage 结构报告。用户说「覆盖启动」「initiation」「首次覆盖」「建覆盖」「/coverage-initiation」时使用。相对 equity-deep-dive：覆盖报告结构 + 风险专章。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 覆盖启动
  summary: 首次覆盖结构报告与风险专章
  category: decision
  slash-rank: "155"
  default-deliverable: web
  required-packs: fundamentals market news industry instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_snapshot get_instrument_news get_sector_list get_sector_constituents evaluate_instrument ask_user create_web update_web read_web list_web_vendor
---

# 覆盖启动（Coverage Initiation）

## 何时使用

用户要对某标的做 **首次覆盖 / Initiation** 结构报告（业务、行业定位、财务、估值框架入口、风险专章），而非日常尽调问答或短 thesis。边界：vs `@skill:equity-deep-dive`——本技能强调 **卖方/买方覆盖报告目录结构 + 独立风险专章**；深度证据交叉仍可借鉴尽调方法，但交付形态按覆盖启动组织。

## 分析架构（投研方法）

- **问题/假设**：该公司如何赚钱？在行业中的位置？覆盖期内关键不确定性？
- **证据清单**：概况、财务、行情、资讯、行业成分、（可选）评估
- **多维交叉验证**：业务叙事 vs 财务；行业对照 vs 个股特征；风险清单是否可监测
- **结论与不确定**：覆盖框架为工作假设；**不给出正式评级/目标价**
- **风险与缺口**：行业数据不足、跨市场披露差异
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 概况 | `get_instrument_profile` | 业务章降级 |
| 财务 | `get_instrument_financials` | 财务章标明缺口 |
| 行情 | `get_instrument_snapshot` | 省略估值入口数字 |
| 资讯 | `get_instrument_news` | 省略近期事件 |
| 行业定位 | `get_sector_list` / `get_sector_constituents` | 仅定性行业描述 |
| 评估（可选） | `evaluate_instrument` | 跳过 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与覆盖范围**（业务 dig、行业 dig、估值框架入口是否需要）。
2. **按覆盖目录取数**：概况/财务/行业/资讯/快照。
3. **撰写覆盖结构**：公司概览 → 行业与竞争定位 → 财务历史 → 投资框架（假设）→ **风险专章**。
4. **事实 | 假设 | 推断** 分栏；无评级、无 PT。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 覆盖声明、标的卡片与时效  
2. 公司与商业模式  
3. 行业与竞争定位  
4. 财务历史与关键驱动  
5. 投资框架与观察指标（假设）  
6. **风险专章**（分类、机制、监测信号）  
7. 事实 | 假设 | 推断分栏结论  
8. 免责声明（无评级/目标价/买卖建议）

## 禁止

- 伪造卖方评级、目标价、首次覆盖「买入」结论  
- 编造行业份额或未返回财务  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 缺少风险专章却声称覆盖完成  
- assumption / not-feasible 须诚实降级
