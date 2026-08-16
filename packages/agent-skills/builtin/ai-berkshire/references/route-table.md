# AI Berkshire 场景路由表

> 供 `@skill:ai-berkshire` 与 `scripts/route_plan.py` 对齐。Agent 可用 `opptrix_run` 跑路由，勿无差别串行全部重研究 skill。

| 场景 intent（示例） | 激活顺序（摘要） | 并行 team |
|--------------------|------------------|-----------|
| `quick_screen` / 快速筛 / checklist / 去劣 | `financial-data` → `investment-checklist` → `quality-screen` →（audit 再经 financial-data） | 否 |
| `deep_research` / 深度研究 | `financial-data` → `investment-research` → `investment-memo-craft` → audit | 否 |
| `team_research` / 投资团队 | `financial-data` → `investment-team` → `investment-memo-craft` → audit | **是** `run_subagent` |
| `earnings` / 财报 | `financial-data` → `earnings-review` → audit | 否 |
| `earnings_team` / 财报团队 | `financial-data` → `earnings-team` → audit | **是** |
| `industry_funnel` / 行业漏斗 | `financial-data` → `industry-funnel` → `investment-checklist` → audit | 否 |
| `industry_research` / 产业链 | `financial-data` → `industry-research` → audit | 否 |
| `portfolio` / 持仓审视 | `financial-data` → `value-portfolio-review` → audit | 否 |
| `thesis` / 论文追踪 | `financial-data` → `value-thesis-tracker` → audit | 否 |
| `thesis_drift` / 漂移 | `financial-data` → `thesis-drift` → `value-thesis-tracker` → audit | 否 |
| `news_pulse` / 异动 | `financial-data` → `news-pulse` → audit | **是**（四侦察） |
| `management` / 管理层 | `financial-data` → `management-deep-dive` → audit | 否 |
| `private` / 未上市 | `financial-data` → `private-company-research` → audit | **是** |
| `series` / 看懂系列 | `financial-data` → `deep-company-series` → audit | 否 |
| `income` / 收益型 | `financial-data` → `income-investment` → audit | 否 |
| `bottleneck` / 瓶颈 | `financial-data` → `bottleneck-hunter` → audit | 否 |
| `wechat` / 公众号 | `wechat-article`（无标的时可跳过 financial-data） | **是** |
| `memo_craft` / 版式 | `investment-memo-craft`（有底稿） | 否 |
| `dyp` / 段永平问答 | `dyp-ask` | 否 |

## 与投资研讨团边界

| | `ai-berkshire` | `multi-role-research-council` |
|--|----------------|-------------------------------|
| 定位 | 价值投资（四大师）skill **总入口与路由** | 多空辩论 **研讨团** |
| 署名 | Opptrix · AI Berkshire 投研流程 | Opptrix投资研讨团流程 |
| 何时 | 用户要巴菲特式框架 / AB 工作流 | 用户要多空辩论链 / 「投资研讨团」 |
| 禁止 | 无差别跑完全部 21 个重 skill | 把报告品牌写成 TradingAgents |

## 最终 web 强制块

1. 强制结论表（通过 / 有条件通过 / 不通过 / 灰色地带等）  
2. 四视角摘要（不足则声明）  
3. 数据截止日期  
4. 免责声明 + 署名
