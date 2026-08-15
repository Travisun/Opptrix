---
name: announcement-deepread
description: 公告精读工作流。用户说「公告精读」「读公告」「深读公告」「条款解读」「重大事项公告」「/announcement-deepread」时使用。full；get_instrument_notices get_notice_content；条款回指原文。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 公告精读
  summary: 关键条款回指原文的公告深读
  category: equity
  slash-rank: "190"
  default-deliverable: web
  required-packs: news artifacts
allowed-tools: search_instruments get_instrument_notices get_notice_content ask_user create_web update_web read_web list_web_vendor
---

# 公告精读

## 何时使用

用户要**精读某一则或一组公司公告**（交易、再融资、股权变动、风险提示等），提取关键条款并**回指原文**，而非资讯标题摘要。边界：资讯聚合用 `@skill:news-digest`；股东名册用 `@skill:shareholder-structure`。完整度按 **full** 路径：列表 → 正文 → 条款结构化。

## 分析架构（投研方法）

- **问题/假设**：公告实际变更了哪些权利义务/财务边界？对投资论点的直接含义是什么？
- **证据清单**：公告列表、公告正文、条款摘录
- **多维交叉验证**：标题 vs 正文；数字/日期/条件句是否完整摘录
- **结论与不确定**：条款为事实；影响评估为推断
- **风险与缺口**：正文拉取失败、扫描件/表格难解析、多份公告冲突
- **事实 | 假设 | 推断** 分栏强制；条款必须可回指

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 公告列表 | `get_instrument_notices` | 无法精读则中止并说明 |
| 公告正文 | `get_notice_content` | 仅列标题并标 not-feasible |
| 用户指定公告 | `ask_user` 选标题/日期 | 多候选时必须确认 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与目标公告**（日期/标题关键词）。
2. **`get_instrument_notices` 定位** → **`get_notice_content` 拉取正文**。
3. **条款提取**：主体、金额、条件、生效日、风险提示；每条附原文摘录或段落定位。
4. **影响推断**单独成栏，禁止与条款事实混写。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 标的、公告标题、披露时间  
2. 一句话事实摘要  
3. 关键条款表（条款 | 原文摘录 | 定位）  
4. 数字与日期清单  
5. 影响评估（推断分栏）  
6. 待核实问题  
7. 风险与解析缺口  
8. 免责声明（无买卖建议；以交易所披露为准）

## 禁止

- 荐股；编造未出现在正文中的条款  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 无正文却做「精读」结论  
- 条款不回指原文  
- assumption / not-feasible 须诚实降级
