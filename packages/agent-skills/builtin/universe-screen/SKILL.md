---
name: universe-screen
description: 股票池筛选工作流。用户说「选股」「股票池」「成分股筛选」「板块筛选」「universe」「/universe-screen」时使用。基于板块/指数成分 + 批量快照做条件筛选事实表；非荐股池。默认 create_web 交付。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 股票池筛选
  summary: 成分股/板块池条件筛选事实表
  category: quant
  slash-rank: "280"
  default-deliverable: web
  required-packs: industry fundamentals market artifacts
allowed-tools: get_sector_list get_sector_constituents get_index_constituents batch_instrument_snapshots search_instruments get_instrument_financials ask_user create_web update_web read_web list_web_vendor
---

# 股票池筛选

## 何时使用

用户要在**已知成分（指数/板块）或自建池**上按条件筛选，得到可复核的候选表。边界：这是**筛选事实表**，不是荐股池、回测结果或「明日必涨名单」。单票信号诊断用 `@skill:instrument-signals`；本技能只输出**条件命中表**，入选≠看好。

## 分析架构（投研方法）

- **问题/假设**：在给定宇宙与硬性约束下，哪些标的满足条件？
- **证据清单**：成分列表、批量快照、可选财务字段
- **多维交叉验证**：条件计数 vs 表行数；缺失字段不得当通过
- **结论与不确定**：入选≠看好；条件可被操纵
- **事实 | 假设 | 推断** 分栏：筛选项为假设/规则；表内行情为事实

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 宇宙 | `get_index_constituents` / `get_sector_constituents` / `get_sector_list` | 用户给代码清单 |
| 筛选条件 | `ask_user` | 先确认硬性条件 |
| 批量行情 | `batch_instrument_snapshots` | 降级逐个或缩小池 |
| 财务过滤 | `get_instrument_financials`（抽样或必要字段） | 跳过该条件并标明 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认宇宙与条件**（硬性/软性分开）。
2. **拉取成分** → **批量快照**。
3. **应用过滤**：缺字段记「未知」而非通过。
4. **输出候选表** + 条件命中统计；明确「非荐股」。
5. **交付网页（默认）**：可筛选表格；见 `@skill:create-web`。

## 网页报告建议目录

1. 宇宙、条件与时效
2. 成分来源说明
3. 筛选结果表
4. 条件命中统计与数据缺口
5. 事实 / 推断分栏（禁止写成推荐清单）
6. 免责声明（非荐股池）

## 禁止

- 把筛选结果包装成荐股池、目标价或仓位建议
- 编造成分或快照字段
- **禁止无交付就结束**
