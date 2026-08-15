---
name: style-rotation
description: 风格轮动工作流。用户说「风格轮动」「大小盘」「价值成长」「板块轮动」「/style-rotation」时使用。assumption-only：用板块/指数代理风格；无官方风格指数。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 风格轮动
  summary: 板块代理风格的相对强弱对照
  category: macro
  slash-rank: "295"
  default-deliverable: web
  required-packs: market industry artifacts
allowed-tools: get_sector_list get_sector_constituents get_market_dynamics get_market_regime batch_instrument_snapshots get_instrument_chart ask_user create_web update_web read_web list_web_vendor
---

# 风格轮动

## 何时使用

用户要看**成长/价值、大盘/小盘等风格相对强弱**，常用板块或宽基代理。边界：vs `@skill:factor-exposure`——后者看**持仓/关注池当下暴露结构**；本技能看**市场风格相对强弱**。vs `@skill:macro-brief`——宏观体制简报；本技能聚焦风格/板块轮动代理对照。

**完整度**：`assumption-only`。本地**无官方风格指数**；须声明所用代理（如某行业板块、宽基）及其局限。

## 分析架构（投研方法）

- **问题/假设**：近期哪类风格相对占优？是否与体制/资金一致？
- **证据清单**：板块列表/成分、市场动态、代理标的快照与图表
- **多维交叉验证**：代理收益差 vs 市场广度；短窗 vs 中窗
- **结论与不确定**：代理≠官方风格指数
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 风格定义 | `ask_user`（代理标的/板块） | 给出默认代理并标假设 |
| 板块 | `get_sector_list` / `get_sector_constituents` | 改用宽基对照 |
| 市场背景 | `get_market_dynamics` / `get_market_regime` | 省略背景章 |
| 代理行情 | `batch_instrument_snapshots` / `get_instrument_chart` | 标明缺失 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **声明代理映射表**（风格 → 板块/指数/ETF 代理）。
2. **取市场背景**与代理行情。
3. **相对强弱表** + 事实/推断分栏；写明无官方风格指数。
4. **交付网页（默认）**。

## 网页报告建议目录

1. 风格代理假设与能力声明
2. 市场体制/动态背景
3. 代理相对强弱表与图
4. 交叉验证结论
5. 风险与缺口
6. 免责声明

## 禁止

- 假装引用官方 Barra/中证风格指数而未取到
- 荐股或「切换到XX风格」操作指令
- **禁止无交付就结束**
