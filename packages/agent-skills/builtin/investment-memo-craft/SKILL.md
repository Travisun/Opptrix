---
name: investment-memo-craft
description: 投研报告写作与版式叠加。用户说「研究报告版式」「写成决策可读」「护城河可证伪」「估值到行动」「investment memo craft」「/investment-memo-craft」时使用。叠加在已有研究底稿上：生意机制、逆向、估值→行动、冷静排版；不替代取数与审计。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 投研报告写作叠加
  summary: 把研究底稿改成决策可读的研究报告版式
  category: decision
  slash-rank: "170"
  default-deliverable: web
  required-packs: fundamentals artifacts workspace
allowed-tools: workspace_read workspace_write read_document search_library ask_user activate_agent_skill get_agent_skill get_instrument_quotes get_instrument_financials opptrix_run create_web update_web read_web list_web_vendor
---

# 投研报告写作与版式叠加

> 署名：**Opptrix · AI Berkshire 分析**  
> 源：Codex-only `investment-memo-craft`；**写作/判断叠加**，不替代 `financial-data` / 研究 skill / `report_audit`。

## 何时使用 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 已有 research/team/earnings 底稿，要决策可读长文版式 | 无底稿的空转「写作」——先跑 `@skill:investment-research` 等 |
| 强调生意机制、可证伪护城河、逆向、估值→行动表 | 短论点备忘 → `@skill:thesis-memo`；IC 一页纸 → `@skill:ic-memo` |
| 用户点名「研究报告」排版 | 默认标题用「公司名（代码）研究报告」；仅用户点名才用「投资备忘录」字样 |

## 研究质量硬性规则（摘要）

保留上游数据纪律；强制结论表放在证据之后（长文默认不在首页堆完整买卖表，除非用户要 executive memo）。区分**好生意 ≠ 好价格下的好投资**。镜子测试；A/B/C；AI 分析置信度 ≠ 投资确定性。定稿前建议 `financial-data` 的 `report_audit` 抽检。免责声明。

## 步骤

1. `workspace_read` / `read_document` 加载底稿；缺失则 `ask_user` 或先激活研究 skill。  
2. 按需补少量 `get_instrument_*`（不得用记忆填现价）。  
3. 按默认报告形状重写（见下）→ `workspace_write`。  
4. 建议 `activate_agent_skill financial-data` → `report_audit` extract/verdict。  
5. `create_web`。

## 默认报告形状（顺序）

1. **AI 研究偏见自觉**：信息丰富度、共识陷阱、偏见清单、AI 局限  
2. **第一步：核心数据总览**  
3. **第二步：生意本质分析**（一句机制：谁付钱、为何付、何稀缺、何重复）  
4. **第三步：护城河评估**（可证伪；可变宽/变窄）  
5. **第四步：逆向与风险清单**（空头会怎么说）  
6. **第五步：管理层（资本配置）**  
7. **第六步：行业与价值捕获**  
8. **第七步：估值与安全边际**（情景与价格/条件带）  
9. **第八步：最终决策与行动清单**（空仓者 vs 持有者；强制结论表）  
10. **AI 分析置信度 vs 投资确定性**  
11. **数据来源与审计摘要**（勿暴露命令行，除非用户要可复现）  
12. **免责声明**

## 版式

- 标题简洁，勿默认追加「四大师综合」「投资备忘录」。  
- 元信息块：研究日、价格、市值、关键倍数、一句论文。  
- 多用表减轻认知负荷；克制加粗；涨跌用显式 +/-。  
- 禁止「再看看」却不给价格或事件触发条件。

## 质量自检（交付前）

- [ ] 卖什么、卖给谁、钱如何重复？  
- [ ] 驱动利润的 2–3 个变量？  
- [ ] 聪明人为什么不买？  
- [ ] 价格已反映什么？  
- [ ] 空仓/持有者分别怎么做？  
- [ ] 什么证据证伪？

## 禁止

- 单独使用却伪造研究数字  
- 用修辞压过证据  
- 覆盖 `thesis-memo` / `ic-memo` 短备忘场景而不说明  
- 无交付结束
