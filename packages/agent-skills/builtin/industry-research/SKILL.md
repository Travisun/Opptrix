---
name: industry-research
description: 产业链全景投资研究。用户说「产业链研究」「行业全景」「哪个环节最好」「/industry-research」时使用。逻辑链验证 + 环节切片 + 头部公司四大师框架 + 组合建议。易混 industry-chain（知识库透视）。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 产业链全景投资研究
  summary: 验证逻辑链，扫描全球环节头部，给出配置建议
  category: industry
  slash-rank: "110"
  default-deliverable: web
  required-packs: fundamentals market research artifacts workspace
allowed-tools: search_instruments get_sector_list get_sector_constituents batch_instrument_snapshots get_instrument_financials get_instrument_financial_indicators get_instrument_quotes get_instrument_snapshot get_macro_series list_news_articles get_news_article http_fetch browser_navigate get_current_time ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor run_subagent list_subagents reclaim_subagent
references:
  - scripts/financial_rigor.py
  - scripts/report_audit.py
---

# 产业链全景投资研究

从一个投资主题出发：验证逻辑链 → 绘制产业链 → 全球上市扫描 → 各环节头部四大师分析 → 组合配置建议。

## 何时使用 / 非目标

| 使用 | 不要用 |
|------|--------|
| 要看清「趋势→瓶颈→环节→标的」全景 | 只要漏斗筛到 3 家 → `@skill:industry-funnel` |
| 各环节头部对比与仓位结构 | 知识库式产业链科普 → `@skill:industry-chain` |
| | 单只个股尽调 → `@skill:equity-deep-dive` / `@skill:investment-research` |

## 研究质量（硬性）

- 四大师：段（生意）/ 巴（财务与护城河）/ 芒（失败路径）/ 李（长期确定性）
- 强制结论与分层仓位；镜子测试；A/B/C（行业研究警惕「资料多的成熟行业看起来更确定」）
- 反偏见：冷门优质、未上市关键玩家、中文市场不可因英文资料少而漏
- `get_current_time`；署名 **Opptrix · AI Berkshire 分析**

## Opptrix 取数

| 维度 | 工具 |
|------|------|
| 板块/成分 | `get_sector_list` / `get_sector_constituents` |
| 批量快照 | `batch_instrument_snapshots` / `search_instruments` |
| 财务 | `get_instrument_financials` / `get_instrument_financial_indicators` |
| 宏观 | `get_macro_series` |
| 资讯与补洞 | `list_news_articles` / `http_fetch` / `browser_navigate` |

脚本不联网。关键数字：

```bash
python scripts/financial_rigor.py verify-valuation ...
python scripts/report_audit.py extract --report draft.md
python scripts/report_audit.py verdict --results results.json --report draft.md
```

## 步骤

1. **逻辑链**：趋势→需求→瓶颈→受益环节；逐箭头找**已发生**验证事件  
2. **全景图**：上中下游+辅助；生意特征表；标记卡脖子环节  
3. **全球扫描**：A/港/美/国际 + ETF + 未上市候选；Tier 1–4  
4. **头部四大师**（Tier1/2 深做，3/4 点评）；并行可用 `run_subagent`，结束须 `reclaim_subagent`  
5. **终局与组合**：核心/卫星/期权/ETF；买卖信号与主题仓位上限  
6. **抽检**（发布级）→ `create_web`

## data_mode

一手财务+可验证事件充分 → `full`；依赖二手汇总 → `proxy`；逻辑链无法验证 → `insufficient`（禁止拼「看起来完整」的全景报告）。

## 网页目录建议

1. 投资逻辑链与验证  
2. 产业链全景与卡脖子  
3. 全球标的扫描（按环节）  
4. 头部公司四大师摘要  
5. 组合配置与信号  
6. 总评与免责声明  

## 禁止

- 半成品：只画图不验证箭头、或不给强制结论  
- 原仓库路径 / 脚本联网取数  
- 用户可见文案堆技术实现细节  
