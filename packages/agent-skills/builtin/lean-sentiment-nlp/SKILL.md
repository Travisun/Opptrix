---
name: lean-sentiment-nlp
description: LEAN 启发的情绪文本（NLP）工作流。用户说「情绪 NLP」「文本情绪」「sentiment」「/lean-sentiment-nlp」时使用。对可得资讯/公告做启发式情绪标注；禁止假装机构情绪库。默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN情绪文本
  summary: A股公告/资讯文本情绪标注假设框架
  category: event
  slash-rank: "525"
  default-deliverable: web
  required-packs: news workspace artifacts
allowed-tools: search_instruments list_news_articles get_news_article get_instrument_notices ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 情绪文本

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

> **能力声明（assumption-only）**：本地**无机构情绪数据库/商用 NLP 情绪指数**。标注为模型启发式或规则打分，须标 **assumption-only**。禁止假装已接入卖方情绪库、社交媒体情绪终端或 LEAN 情绪数据源。

## 何时使用

用户要对 **A股可得新闻/公告文本**做启发式情绪/主题标注与时间线（LEAN 方法溯源，非美股原版照搬）。默认交付可预览网页。

边界：资讯摘要用 `@skill:news-digest`；公告精读用 `@skill:announcement-deepread`。本技能强调**文本情绪假设框架**。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认语料：**中文公告 / 资讯**（平台可得新闻与公告工具）；美股英文 10-K/Twitter 类语料仅用户点名。
- 情绪≠交易信号；涨跌停日情绪与可交易性脱节须注明。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：样本文本的正/负/中性分布与主题如何？
- **证据清单**：新闻/公告原文要点、标注表、时间线
- **多维交叉验证**：多来源是否同向；标题 vs 正文
- **结论与不确定**：启发式标注≠机构情绪指数
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 可做主题不绑标的 |
| 文本 | `list_news_articles` / `get_news_article` / `get_instrument_notices` | 无文本则 not-feasible |
| 标注 | 模型启发式 + 可选 `opptrix_run` 计数 | 人工抽样并标假设 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股中文语料 | 中文公告/资讯文本 | 无文本 → not-feasible / ask_user |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **能力横幅**：无机构情绪库
3. **拉取文本并抽样**：时效与来源
4. **启发式标注与统计**：主题时间线
5. **分栏结论**：禁止因情绪荐股
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源；非机构情绪库
2. LEAN 溯源与「非引擎」声明
3. 样本与来源时效
4. 情绪/主题标注表
5. 时间线与分布
6. 事实 / 假设 / 推断分栏
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（无买卖建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 假装机构情绪库、社交媒体情绪终端或官方情绪指数
- 把启发式分数写成「市场情绪金标准」
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
