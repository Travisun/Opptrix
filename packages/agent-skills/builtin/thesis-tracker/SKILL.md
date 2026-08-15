---
name: thesis-tracker
description: 投资论点跟踪板。用户说「论点跟踪」「thesis tracker」「跟踪板」「论点看板」「/thesis-tracker」时使用。workspace 为 SSOT；vs watchlist-digest：本技能跟论点状态而非关注池行情摘要。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 论点跟踪板
  summary: 多标的论点状态与证伪进度看板
  category: decision
  slash-rank: "165"
  default-deliverable: web
  required-packs: portfolio news workspace artifacts
allowed-tools: get_watchlist get_instrument_news workspace_read workspace_write ask_user create_web update_web read_web list_web_vendor
---

# 论点跟踪板（Thesis Tracker）

## 何时使用

用户要维护 **多标的/多论点的状态跟踪板**（支柱状态、证伪进度、下次检查点），以 workspace 为单一事实源（SSOT）。边界：vs `@skill:watchlist-digest`——后者是关注池行情/资讯摘要；本技能跟 **论点生命周期**。单次修订用 `@skill:thesis-update`。

## 分析架构（投研方法）

- **问题/假设**：当前跟踪中的论点各自处于何状态？哪些接近证伪/验证？
- **证据清单**：workspace 跟踪表、关注列表（可选范围）、近期资讯
- **多维交叉验证**：看板条目 vs 最新资讯；避免把价格涨跌直接等同论点验证
- **结论与不确定**：状态标签为工作分类；变更须引用证据
- **风险与缺口**：workspace 空、关注列表与看板不一致
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 跟踪 SSOT | `workspace_read` | 初始化模板并 `ask_user` 录入首批论点 |
| 范围辅助 | `get_watchlist` | 仅跟踪 workspace 已有条目 |
| 资讯刷新 | `get_instrument_news` | 状态章仅基于旧记录并标注陈旧 |
| 写回 | `workspace_write` | 至少网页交付；提醒 SSOT 未更新 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **读取 workspace 跟踪板**；无则创建最小 schema（标的、论点一句、状态、证伪条件、下次检查）。
2. **按条目刷新相关资讯**（可限关注列表交集）。
3. **更新状态**：验证中/削弱/证伪/搁置——每条附证据与时间。
4. **`workspace_write` 写回 SSOT**（默认应做）。
5. **交付网页（默认）**：`list_web_vendor` → `create_web` 看板页；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 跟踪板元信息与时效  
2. 看板总表（标的 / 状态 / 下次检查）  
3. 条目详情：论点、支柱、证伪进度  
4. 本期变更日志  
5. 事实 | 假设 | 推断分栏  
6. 与关注列表差异说明（若有）  
7. 风险与缺口  
8. 免责声明（无买卖建议）

## 禁止

- 把关注列表涨跌摘要冒充论点跟踪（应转 watchlist-digest）  
- 荐股；无证据改状态  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 跳过 workspace SSOT 却声称「已跟踪」  
- assumption / not-feasible 须诚实降级
