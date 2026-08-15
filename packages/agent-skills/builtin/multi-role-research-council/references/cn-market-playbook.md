# A股工具对照（多角色研讨）

父/子 Agent 取数时优先下表；工具名须与系统已注册名称一致。

## 标的与行情

| 需求 | 工具 |
|------|------|
| 定位代码 | `search_instruments` |
| 综合快照 | `get_instrument_snapshot` |
| 最新价序列 | `get_instrument_quotes` |
| 图表结构 | `get_instrument_chart` |
| 筹码（A股） | `get_instrument_cyq` |

## 基本面

| 需求 | 工具 |
|------|------|
| 公司概况 | `get_instrument_profile` |
| 财务摘要 | `get_instrument_financials` |
| 利润表 | `get_instrument_income_statement` |
| 资产负债表 | `get_instrument_balance_sheet` |
| 现金流 | `get_instrument_cash_flow` |
| 财务指标 | `get_instrument_financial_indicators` |

## 资讯与公告（勿用虚构工具名）

| 需求 | 工具 |
|------|------|
| 资讯列表 | `list_news_articles` |
| 资讯正文 | `get_news_article` |
| 标的公告列表 | `get_instrument_notices` |
| 公告正文 | `get_notice_content` |

**禁止**调用不存在的 `get_instrument_news`。

## 资金与情绪

| 需求 | 工具 |
|------|------|
| 个股资金流向 | `get_instrument_money_flow` |
| 市场情绪摘要 | `get_market_sentiment` |
| 龙虎榜 | `get_dragon_tiger` |
| 涨跌停/热股等专题 | `get_cn_market_special` / `get_limit_updown`（按题选用） |

## 机构观点（可选）

| 需求 | 工具 |
|------|------|
| 机构评级 | `get_instrument_institution_rating` |
| 机构研报条目 | `get_instrument_institution_report` |

## 编排与交付

| 需求 | 工具 |
|------|------|
| 委派角色 | `run_subagent` |
| 查进度/取结果 | `list_subagents` / `get_subagent` |
| 回收 | `reclaim_subagent` |
| 取消 | `cancel_subagent` |
| 清单 | `update_research_checklist` |
| 网页报告 | `list_web_vendor` → `create_web`（`update_web` / `read_web`） |

## 明确避免

- 本技能主路径**不要**优先 `evaluate_instrument`（评分卡 ≠ 多角色研讨）  
- 不要用个人持仓工具替代市场资金工具，除非用户明确要求纳入组合上下文
