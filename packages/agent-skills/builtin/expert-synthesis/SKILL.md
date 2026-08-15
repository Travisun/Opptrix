---
name: expert-synthesis
description: 机构观点综合。用户说「机构观点」「卖方评级」「研报综合」「一致预期」「institution rating」「/expert-synthesis」时使用。institution_rating/report；无共识不编造。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 机构观点综合
  summary: 公开机构评级与研报要点对照
  category: equity
  slash-rank: "195"
  default-deliverable: web
  required-packs: instrument_analytics news artifacts
allowed-tools: search_instruments get_institution_rating get_institution_report get_instrument_news ask_user create_web update_web read_web list_web_vendor
---

# 机构观点综合

## 何时使用

用户要 **汇总公开机构评级/研报要点并对照异同**，而非自己写 thesis 或做尽调结论。边界：自身投资论点用 `@skill:thesis-memo`；资讯标题流用 `@skill:news-digest`。**无共识数据时不得编造一致预期**。

## 分析架构（投研方法）

- **问题/假设**：公开机构观点分布如何？分歧点在哪？
- **证据清单**：机构评级、研报摘要/条目、相关资讯
- **多维交叉验证**：评级方向 vs 报告论点；时间戳新旧是否可比
- **结论与不确定**：机构表述为转述事实；「市场已定价」为推断
- **风险与缺口**：无评级返回、样本过少、时效参差
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 机构评级 | `get_institution_rating` | 标明无评级；不编造共识 |
| 机构研报 | `get_institution_report` | 仅用评级表或省略 |
| 资讯辅助 | `get_instrument_news` | 可跳过 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的与时间窗**。
2. **`get_institution_rating` / `get_institution_report`**；记录来源与日期。
3. **综合**：共识（仅当数据支持）、分歧、关键假设转述。
4. **无共识则明确写「无可用共识」**，禁止填假。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 标的、样本范围与时效  
2. 评级分布表  
3. 研报要点对照  
4. 共识与分歧（有则写；无则声明）  
5. 事实 | 假设 | 推断分栏  
6. 使用局限（滞后、覆盖不全）  
7. 免责声明（非投资建议；非完整研报替代）

## 禁止

- 荐股；**编造一致预期/目标价共识**  
- 伪造机构名称或评级  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- assumption / not-feasible 须诚实降级  
- 禁止把单家观点写成「市场共识」
