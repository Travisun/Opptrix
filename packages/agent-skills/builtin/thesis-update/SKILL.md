---
name: thesis-update
description: 投资论点更新工作流。用户说「更新论点」「thesis update」「论点变了吗」「相对上次论点」「/thesis-update」时使用。必须相对旧论点；须 workspace_read。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 论点更新
  summary: 相对旧论点的证据增量与修订
  category: decision
  slash-rank: "160"
  default-deliverable: web
  required-packs: fundamentals news workspace artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_news workspace_read workspace_write ask_user create_web update_web read_web list_web_vendor
---

# 论点更新（Thesis Update）

## 何时使用

用户要在**已有投资论点**之上做增量更新（新证据、修订、证伪状态变化），而非从零写 thesis。边界：首次论点用 `@skill:thesis-memo`；持续看板用 `@skill:thesis-tracker`。**必须相对旧论点**；须先 `workspace_read`（或用户粘贴旧稿）。

## 分析架构（投研方法）

- **问题/假设**：旧论点哪些支柱仍成立？哪些被新证据削弱/强化？
- **证据清单**：workspace 旧论点、新财务/资讯、用户补充
- **多维交叉验证**：新旧对照表；变化归因标为推断
- **结论与不确定**：修订建议为工作假设；保留「未变」条目避免伪更新
- **风险与缺口**：无旧论点可对照、资讯噪音
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 旧论点 | `workspace_read` / 用户粘贴 | `ask_user` 索要；无则建议改走 thesis-memo |
| 标的 | `search_instruments` | 与旧稿不一致时确认 |
| 财务增量 | `get_instrument_financials` | 仅用资讯更新并降级 |
| 资讯增量 | `get_instrument_news` | 标明无新公开事件 |
| 概况 | `get_instrument_profile` | 可跳过 |
| 落盘修订 | `workspace_write`（可选） | 仅网页交付亦可 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **读取旧论点**：`workspace_read`；没有则 `ask_user`，禁止虚构「上次结论」。
2. **拉取增量证据**：财务/资讯等与旧支柱相关的部分。
3. **对照表**：每条旧支柱 → 状态（强化/削弱/不变/证伪）→ 依据。
4. **输出修订版论点摘要** + 未决观察项。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；可选 `workspace_write` 更新 SSOT。
6. 无旧论点可对照时标 **not-feasible** 并引导首次备忘。

## 网页报告建议目录

1. 标的、更新时点与旧论点来源  
2. 旧论点摘要（事实引用）  
3. 增量证据时间线  
4. 支柱对照表（强化/削弱/不变/证伪）  
5. 修订后论点（假设）  
6. 事实 | 假设 | 推断分栏  
7. 风险与缺口  
8. 免责声明（无买卖建议）

## 禁止

- 在无旧论点时假装「相对上次」  
- 荐股；编造增量事件  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 跳过 `workspace_read`（有 workspace 时）  
- assumption / not-feasible 须诚实降级
