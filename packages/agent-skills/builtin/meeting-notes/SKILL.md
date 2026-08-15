---
name: meeting-notes
description: 投研会议纪要整理。用户说「会议纪要」「纪要」「meeting notes」「整理会议」「访谈纪要」「/meeting-notes」时使用。输入源为用户提供；workspace_write 落盘。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 会议纪要
  summary: 用户素材结构化的投研会议纪要
  category: portfolio
  slash-rank: "255"
  default-deliverable: web
  required-packs: workspace artifacts
allowed-tools: ask_user workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 会议纪要

## 何时使用

用户提供 **会议/访谈/内部讨论素材**（粘贴文本、要点、录音转写），需要结构化纪要与待办。边界：公告精读用 `@skill:announcement-deepread`；IC 上会材料用 `@skill:ic-memo`。本技能 **不从行情工具编造会议内容**——输入源必须是用户（或 workspace 既有草稿）。

## 分析架构（投研方法）

- **问题/假设**：会议达成了哪些共识？未决问题与跟进项是什么？
- **证据清单**：用户原文、（可选）workspace 旧纪要
- **多维交叉验证**：决议 vs 待办；发言归属于推断时须标注
- **结论与不确定**：原文摘录为事实；「言外之意」为推断
- **风险与缺口**：素材残缺、说话人不明、敏感信息
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 会议素材 | 用户粘贴 / `ask_user` | 无法生成纪要 → not-feasible |
| 旧稿 | `workspace_read` | 新建纪要 |
| 落盘 | `workspace_write` | 至少网页交付并提醒未落盘 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **收集素材**：时间、参与者、主题、原文；缺则 `ask_user`。
2. **结构化**：议程 → 讨论要点 → 决议 → 待办（负责人/期限若有）→ 开放问题。
3. **事实 | 假设 | 推断** 分栏；禁止添加未出现的「公司指引」。
4. **`workspace_write` 落盘**（默认应做，便于后续 thesis-update）。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 会议元信息（时间/参与者/主题）  
2. 议程与讨论要点  
3. 决议与共识（事实摘录）  
4. 待办清单  
5. 开放问题  
6. 事实 | 假设 | 推断分栏  
7. 素材缺口说明  
8. 免责声明（内部整理；非投资建议）

## 禁止

- 编造未提供的发言、决议或数据  
- 荐股  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 无用户素材却生成「会议纪要」  
- assumption / not-feasible 须诚实降级  
- 日志/纪要中写入用户敏感密钥
