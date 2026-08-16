---
name: earnings-review
description: 财报精读（一手资料）。用户说「精读财报」「读年报」「电话会纪要」「一手财报」「像巴菲特读年报」「/earnings-review」时使用。只读原始财报/纪要；非原始须标注。默认 create_web；署名 Opptrix · AI Berkshire 分析。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 财报精读
  summary: 一手财报与纪要精读，强制超/符/低预期结论
  category: earnings
  slash-rank: "53"
  default-deliverable: web
  required-packs: fundamentals market news workspace artifacts
allowed-tools: search_instruments ask_user get_current_time get_instrument_notices get_notice_content get_instrument_income_statement get_instrument_balance_sheet get_instrument_cash_flow get_instrument_financials get_instrument_financial_indicators get_instrument_quotes get_instrument_snapshot http_fetch browser_navigate read_document workspace_write workspace_read opptrix_run create_web update_web read_web list_web_vendor
references:
  - scripts/financial_rigor.py
  - scripts/report_audit.py
  - scripts/run_rigor_json.py
  - scripts/scorecard.py
  - scripts/fixtures/sample_scorecard_full.json
  - scripts/fixtures/sample_verify_market_cap.json
  - scripts/fixtures/sample_cross_validate_full.json
---

# 财报精读（一手资料）

输入：`公司名 季度`（如 `腾讯 2025Q4`、`美团 最新`）。署名：**Opptrix · AI Berkshire 分析**。

> 「我从不看卖方研报，只读原始财报。」—— 李录

## 何时使用 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 单人精读一期年报/季报/纪要，形成判断 | 速读摘要 → `@skill:earnings-quick-read`（勿合并） |
| 强调 MD&A 语气、附注、承诺追踪 | 团队+成稿发布 → `@skill:earnings-team` |
| | 完整公司研究 → `@skill:investment-research` |

## 研究质量（硬性）

- **资料可得性 A/B/C**：A 完整原文；B 部分原文/汇总（标非原始）；C 仅新闻摘要（跳过附注深挖，标不足）。  
- 强制回答：超预期 / 符合预期 / 低于预期（禁止「基本符合」两面话）。  
- 对投资论文：强化 / 无影响 / 削弱 / 破裂。  
- 关键数字走 `financial_rigor`；发布前 `report_audit`。  
- `get_current_time`；事实/观点分栏。

## 取数

| 优先级 | 工具 |
|--------|------|
| 公告原文 | `get_instrument_notices` → `get_notice_content` |
| 三表 | `get_instrument_income_statement` / `get_instrument_balance_sheet` / `get_instrument_cash_flow` / `get_instrument_financials` |
| 用户上传 | `read_document` |
| 补洞 | `http_fetch` / `browser_navigate`（IR/交易所披露页） |
| 市值验算 | `get_instrument_quotes` + 脚本 |

无法取得原文时按 `@skill:financial-data` 拼凑，**必须**标注「非原始财报，来自汇总」，双源误差 >1% 须标记。

```bash
python scripts/run_rigor_json.py --input data.json --output result.json
python scripts/report_audit.py extract --report draft.md
python scripts/scorecard.py --input evidence.json --output scorecard.json
```

## 步骤

1. **评级资料可得性** A/B/C，写入报告头。  
2. **并行收集**：财报原文、电话会纪要、股东信、投资者日材料（能拿到多少算多少）。  
3. **核心数据**：利润表 / 现金流（经营现金流 vs 净利）/ 资产负债表健康度 → rigor 验算。  
4. **MD&A 精读**：坦诚/清晰 vs 模糊/转移/归因外部；上期承诺兑现表；Q&A 尖锐问题评分。  
5. **附注清单**：关联交易、股权激励稀释、或有负债、会计政策变更、分部、集中度；异常信号勾选。  
6. **历史对比**：≥4 季或 3 年趋势；vs 指引。  
7. **结论四问** + `create_web` + 抽检准出。

## 报告结构

1. 核心数据速览  
2. 本期最重要的 3 个变化（≤500 字）  
3. 管理层语气与承诺追踪  
4. 附注隐藏信息  
5. 电话会 Q&A 精选  
6. 与投资论文关系  
7. 结论：这份财报改变了什么？  
8. 免责声明  

## 禁止

- 只读二手摘要却假装精读原文  
- 「基本符合预期」式太极  
- 脚本联网；无结论交付；与 quick-read 混淆  
