---
name: investment-research
description: 四大师综合深度研究。用户说「四大师研究」「深度投研」「巴菲特芒格段永平李录」「系统研究这家公司」「/investment-research」时使用。七模块：偏见评级→取数验算→生意/护城河/逆向/管理层/文明趋势/估值→强制结论与镜子测试。默认 create_web；署名 Opptrix · AI Berkshire 投研流程。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 四大师综合深度研究
  summary: 巴菲特/芒格/段永平/李录四视角系统研究，强制结论与镜子测试
  category: deep-research
  slash-rank: "50"
  default-deliverable: web
  required-packs: fundamentals market news workspace artifacts
allowed-tools: search_instruments ask_user get_current_time get_instrument_snapshot get_instrument_quotes get_instrument_profile get_instrument_financials get_instrument_income_statement get_instrument_balance_sheet get_instrument_cash_flow get_instrument_financial_indicators get_instrument_dividend get_instrument_shareholders list_news_articles get_news_article get_instrument_notices get_notice_content http_fetch browser_navigate workspace_write workspace_read opptrix_run create_web update_web read_web list_web_vendor
references:
  - scripts/financial_rigor.py
  - scripts/report_audit.py
  - scripts/run_rigor_json.py
  - scripts/scorecard.py
  - scripts/fixtures/sample_verify_market_cap.json
  - scripts/fixtures/sample_cross_validate_full.json
  - scripts/fixtures/sample_scorecard_full.json
  - scripts/fixtures/sample_scorecard_insufficient.json
---

# 四大师综合深度研究

对用户指定标的做系统化价值投资研究。署名交付：**Opptrix · AI Berkshire 投研流程**。

## 何时使用 / 非目标 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 单标的四大师框架深度研究 + 明确决策档位 | 多空辩论研讨团 → `@skill:multi-role-research-council` |
| 首次覆盖或重做完整尽调长文 | 通用尽调无四大师强制框架 → `@skill:equity-deep-dive`（勿合并） |
| 需要镜子测试与 A/B/C 信息丰富度 | 只要管理层纵深 → `@skill:management-deep-dive` |
| | 未上市 → `@skill:private-company-research` |
| | 并行四角色团队 → `@skill:investment-team` |

## 研究质量（硬性）

1. **四大师**：段永平（生意/本分）· 巴菲特（财务/安全边际）· 芒格（逆向/失败路径）· 李录（长期确定性/能力圈）——须显式覆盖或诚实声明某师因数据不足无法评分。
2. **强制结论**：须给出 **通过 / 有条件通过 / 不通过 / 灰色地带（数据不足）** 之一；区分「好生意」≠「好价格下的好投资」；可附激进/稳健/保守分层与价格或条件区间（无依据则写触发条件，禁止假精确）。
3. **镜子测试**：买入或「通过」前 ≤5 句说清：买什么生意、为何现在、什么会证伪。说不清 → **不通过**。
4. **信息丰富度 A/B/C**：报告开头标注；资料多≠确定性高；AI 置信度≠投资确定性。C 级用第一性原理，禁止拼凑假完整报告。
5. **快速否决**：诚信污点、能力圈外且说不清赚钱方式 → 一票否决，估值再便宜不打分对冲。
6. **时间**：研究前 `get_current_time`；报告头写数据截止日期。
7. **事实/观点分栏**；禁止「我认为/显然」；联网失败禁止用训练知识冒充已刷新数据，并降级 `data_mode`。

## Opptrix 取数（主路径）

**禁止**依赖 `（禁止依赖外部源仓路径）` 或脚本联网爬虫。主路径：

| 维度 | 工具 |
|------|------|
| 定位 | `search_instruments` / `ask_user` |
| 快照/行情 | `get_instrument_snapshot` / `get_instrument_quotes` |
| 画像 | `get_instrument_profile` |
| 财务 | `get_instrument_financials` / `get_instrument_income_statement` / `get_instrument_balance_sheet` / `get_instrument_cash_flow` / `get_instrument_financial_indicators` |
| 分红/股东 | `get_instrument_dividend` / `get_instrument_shareholders` |
| 资讯/公告 | `list_news_articles` / `get_news_article` / `get_instrument_notices` / `get_notice_content` |
| 补洞 | `http_fetch` / `browser_navigate`（第二源；写入 workspace 后再验算） |

交叉验证规范可激活 `@skill:financial-data`。取数后 `workspace_write` 证据 JSON/底稿。

## 脚本（本地计算，不联网）

```bash
python scripts/run_rigor_json.py --input data.json --output result.json
python scripts/financial_rigor.py verify-market-cap --price … --shares … --reported … --currency …
python scripts/financial_rigor.py verify-valuation --price … --eps … --bvps … --fcf-per-share …
python scripts/financial_rigor.py cross-validate --field revenue --values '{"源1":1,"源2":2}' --unit 亿
python scripts/financial_rigor.py three-scenario --price … --eps … --shares … --growth a b c --pe x y z
python scripts/report_audit.py extract --report draft.md
python scripts/report_audit.py verdict --results results.json --report draft.md
python scripts/scorecard.py --input evidence.json --output scorecard.json
```

`meta.data_mode`：`full` / `proxy` / `insufficient`；`degraded` 必须等于 `data_mode == "proxy"`。自检：`scripts/fixtures/sample_scorecard_*.json`、`sample_verify_market_cap.json`。

## 步骤

### 0 — 偏见自觉 + 时间

`get_current_time`。评定 A/B/C；C 级只答：客户是谁/复购驱动/百亿能否复制/管理层关键决策反映什么。

### 1 — 数据收集与验算

按上表取数 → `workspace_write` → 市值/交叉验证/估值/`three-scenario`（禁止心算）→ 附录保留脚本输出。

### 2–7 — 七模块分析

1. **生意本质**（段永平）：一句话定义、收入结构、模式画布、毛利率与经营杠杆。
2. **护城河**（巴菲特）：品牌/转换成本/网络/规模/技术，趋势变宽或变窄。
3. **逆向**（芒格）：失败路径表、历史类比、空方论点、偏误自查。
4. **管理层**（段+巴）：关键决策、资本配置、持股与激励；不足则建议 `@skill:management-deep-dive`。
5. **文明趋势**（李录）：范式转移、TAM、价值链位置、集中度。
6. **估值与安全边际**：反向 DCF、三情景（脚本）、历史/同业对比。
7. **综合备忘录**：四维评分表 + 决策档位 + 分层建议 + 四大师模拟点评（引用格式）。

### 8 — 抽检与交付

`report_audit` extract→取数填值→verdict；可选 `scorecard.py`。`list_web_vendor` → **`create_web`**。署名 **Opptrix · AI Berkshire 投研流程**；附免责声明（学习辅助，非投资建议）。

## 网页报告建议目录

1. 信息丰富度 A/B/C + 数据截止 + AI 置信度 vs 投资确定性  
2. 一句话结论与决策档位  
3. 镜子测试（≤5 句）  
4. 核心数据与交叉验证摘要  
5. 七模块分析（含各师追问）  
6. 多空与快速否决项  
7. 分层建议与价格/条件区间  
8. C 级：一手验证问题清单  
9. 免声明  

## 禁止

- 两面讨好无决策档位；跳过镜子测试给「通过」  
- 脚本联网；依赖源仓路径；训练知识冒充已取数  
- C 级假完整尽调；用户可见文案堆工具/脚本实现词  
- 无 web 交付就结束（除非用户只要口头要点）  
