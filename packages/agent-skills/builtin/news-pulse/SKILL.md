---
name: news-pulse
description: 股价异动快速归因。用户说「异动归因」「为什么涨跌」「新闻脉搏」「要不要重审论文」「10分钟归因」「/news-pulse」时使用。四侦察并行（公司/监管/对手/情绪）→ 事件时间线 + 主因判断 + 是否触发论文重审。非深度投研。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 异动新闻脉搏
  summary: 四维度侦察，10 分钟判断异动主因与是否重审论文
  category: event
  slash-rank: "95"
  default-deliverable: web
  required-packs: market news fundamentals artifacts
allowed-tools: search_instruments get_instrument_quotes get_instrument_chart get_instrument_snapshot list_news_articles get_news_article get_instrument_notices get_notice_content http_fetch browser_navigate ask_user run_subagent list_subagents get_subagent reclaim_subagent cancel_subagent update_research_checklist workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 公司新闻脉搏：股价异动快速归因

> 署名：**Opptrix · AI Berkshire 分析**  
> 目标：约 10–15 分钟内回答「发生了什么？主因是什么？要不要重审论文？」——**不是**深度投研。

## 何时使用 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 单日约 ±5% / 一周约 ±10% 等异动要归因 | 完整四大师研究 → `@skill:investment-research` / `@skill:investment-team` |
| 财报后快速搞清市场在反应什么 | 财报一手精读 → `@skill:earnings-review` |
| 判断是否触发论文重审 | 资讯摘要 → `@skill:news-digest`；涨跌停专题 → `@skill:limit-move-attribution` |

## 研究质量硬性规则（摘要）

强制结论须勾选其一：**价值事件 / 情绪或技术波动 / 真因不明 / 混合**。禁止用持仓立场预设立场。找不到主因时诚实写「真因不明」。A/B/C 按媒体覆盖度；C 级「查不到新闻」本身有信息量。数据截止日 + 免责声明。**禁止**移植雪球爬虫凭据；情绪侧用新闻/公告工具或用户粘贴。

## 澄清参数（未提供则 `ask_user`）

| 参数 | 默认 |
|------|------|
| 公司/代码 | 必填 |
| 时间窗口 | 14 天（财报季可 7 天） |
| 异动描述 | 选填，如「跌 12%/3 天」 |
| 侧重 | 四方平均 |

## 取数

| 维度 | 工具 |
|------|------|
| 行情 | `get_instrument_quotes` / `get_instrument_chart` / `get_instrument_snapshot` |
| 资讯公告 | `list_news_articles` / `get_news_article` / `get_instrument_notices` / `get_notice_content` |
| 补洞 | `http_fetch` / `browser_navigate`（失败须标注，禁止用记忆冒充） |
| 并行 | `run_subagent` ×4 → `reclaim_subagent` |

## 四侦察（必须并行 `run_subagent`）

同一轮发起 4 个子任务，各自独立成稿后父 Agent 综合：

1. **公司事件**：公告、业绩指引、增减持/回购、并购订单、诉讼合规；时间线表。  
2. **监管政策**：行业新规、跨境/反垄断、税收、汇率相关；直接影响程度。  
3. **行业对手**：3–5 竞对动态、上下游、行业 beta vs 个股；是否同步波动。  
4. **情绪资金**：机构评级/持仓线索、传言标注未证实、技术位/大宗异常；**禁止**假装雪球全量。

每份输出：核心发现 3–5 条 | 时间线 | 本维能否解释异动 | 数据缺口。

## 综合归因（父 Agent）

1. **一句话归因**（30–60 字）  
2. **合并时间线**（维度 + 归因权重：高/中/低）  
3. **候选解释表**：证据 | 反证 | 置信度 | 持续性  
4. **性质判断**（强制勾选）  
5. **行动建议表**：是否触发 `@skill:value-thesis-tracker` / `@skill:earnings-review` / `@skill:management-deep-dive`；调仓仅提示  
6. **7–30 天跟踪清单** + 信息缺口  

`workspace_write` 底稿 → `create_web`。

## 网页目录

1. 标的、异动背景、数据截止、A/B/C  
2. 一句话归因 + 性质判断  
3. 事件时间线与归因表  
4. 四维摘要  
5. 行动建议与跟踪清单  
6. 事实 | 推测 | 缺口 + 免责声明

## `data_mode`

- 多源事件可交叉且与波幅匹配 → `full`  
- 单源为主或覆盖不足 → `proxy`  
- 完全无事件可解释且工具失败 → 仍可交付「真因不明」，`data_mode=proxy` 或标注缺口；勿伪造事件

## 禁止

- 陷入深度估值替代其他 skill  
- 标题党当事实；无独立信源的传言当已证实  
- 无交付结束；用户文案堆技术实现词
