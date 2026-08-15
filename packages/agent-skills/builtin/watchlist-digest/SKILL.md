---
name: watchlist-digest
description: 关注列表摘要。用户说「关注列表摘要」「自选摘要」「watchlist digest」「我的自选怎么样」「/watchlist-digest」时使用。只覆盖关注池；非 morning-market-brief 全市场早报。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 关注列表摘要
  summary: 自选池行情与资讯要点速览
  category: portfolio
  slash-rank: "245"
  default-deliverable: web
  required-packs: portfolio market news artifacts
allowed-tools: get_watchlist batch_instrument_snapshots get_instrument_news ask_user create_web update_web read_web list_web_vendor
---

# 关注列表摘要

## 何时使用

用户要对自己的 **关注/自选池** 做行情与资讯要点摘要，而非全市场早报或论点跟踪板。边界：vs `@skill:morning-market-brief`——早报面向大盘与板块；本技能 **只覆盖关注池**。vs `@skill:thesis-tracker`——跟踪论点状态而非池内涨跌摘要。vs `@skill:portfolio-review`——复盘可含持仓结构诊断；本技能偏 **池内速览**。

## 分析架构（投研方法）

- **问题/假设**：关注池今日/本期哪些变动值得注意？资讯是否触及池内标的？
- **证据清单**：关注列表、批量快照、逐只或抽样资讯
- **多维交叉验证**：涨跌幅极值 vs 资讯催化；空池与拉取失败分开处理
- **结论与不确定**：行情为事实；「值得关注」排序为推断
- **风险与缺口**：空列表、快照部分失败
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 关注列表 | `get_watchlist` | 空态说明如何添加自选 |
| 行情 | `batch_instrument_snapshots` | 标明失败代码 |
| 资讯 | `get_instrument_news`（抽样/按异动优先） | 仅行情表 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **`get_watchlist`**；空则交付空态页并结束主分析。
2. **批量快照**；排序涨跌与异动。
3. **对异动/用户点名标的补资讯**。
4. **事实 | 假设 | 推断** 分栏写要点。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`。

## 网页报告建议目录

1. 关注池范围与时效  
2. 行情速览表  
3. 异动与资讯要点  
4. 事实 | 假设 | 推断分栏  
5. 数据缺口（失败代码）  
6. 免责声明（无买卖建议；非全市场早报）

## 禁止

- 扩展成全市场早报（应转 morning-market-brief）  
- 荐股；编造关注池外标的冒充自选  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- assumption / not-feasible 须诚实降级  
- 禁止把论点看板需求做成纯涨跌表（应转 thesis-tracker）
