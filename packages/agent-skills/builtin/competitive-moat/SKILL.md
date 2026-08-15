---
name: competitive-moat
description: 竞争壁垒 / Moat 评估。用户说「护城河」「竞争壁垒」「moat」「竞争优势」「行业地位」「/competitive-moat」时使用。assumption-only；禁止无依据份额假图。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 竞争壁垒
  summary: 护城河类型与可持续性的结构化评估
  category: equity
  slash-rank: "180"
  default-deliverable: web
  required-packs: fundamentals industry news artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_sector_list get_sector_constituents get_instrument_news ask_user create_web update_web read_web list_web_vendor
---

# 竞争壁垒（Competitive Moat）

## 何时使用

用户要评估标的 **护城河类型与可持续性**（转换成本、网络效应、成本优势、无形资产、规模等框架），而非只要同业估值或产业链图谱。边界：产业链结构用 `@skill:industry-chain`；同业倍数用 `@skill:comps-analysis`。完整度 **assumption-only**：**禁止无依据的市场份额假图**。

## 分析架构（投研方法）

- **问题/假设**：公司是否具备可识别的壁垒类型？财务特征是否与该类型一致？
- **证据清单**：概况、财务利润率/回报、行业成分对照、相关资讯
- **多维交叉验证**：叙事壁垒 vs 利润率稳定性；同业成分 vs 差异化描述
- **结论与不确定**：壁垒评级为工作假设；份额数字仅在工具/用户提供时使用
- **风险与缺口**：无份额数据、行业定义过宽
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 业务概况 | `get_instrument_profile` | 壁垒分析高度定性 |
| 财务特征 | `get_instrument_financials` | 省略回报稳定性章 |
| 同业参照 | `get_sector_list` / `get_sector_constituents` | 不做伪份额对比 |
| 资讯 | `get_instrument_news` | 省略事件冲击 |
| 份额等外部数 | 仅用户提供或可信摘录 | **禁止画假份额图** |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与行业定义**。
2. **取概况/财务/同业名单/资讯**。
3. **按壁垒框架打分表**（每类：证据强度高/中/低/无）；份额行无数据则写 N/A。
4. **可持续性与瓦解风险**（推断分栏）。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；标注 **assumption-only**。

## 网页报告建议目录

1. 标的、行业界定与时效  
2. 商业模式要点（事实）  
3. 壁垒类型评估表  
4. 财务一致性检验  
5. 同业对照（非份额假图）  
6. 事实 | 假设 | 推断分栏  
7. 瓦解风险与观察指标  
8. 免责声明（无买卖建议）

## 禁止

- 荐股；**绘制或编造无来源的市场份额图**  
- 编造「全球第一」等未返回表述  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- assumption / not-feasible 须诚实降级  
- 禁止把品牌形容词当成已验证壁垒
