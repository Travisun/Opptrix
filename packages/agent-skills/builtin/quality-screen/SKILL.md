---
name: quality-screen
description: 价值投资去劣筛选（7 条硬指标）。用户说「去劣筛选」「质量筛」「排除烂公司」「7 条硬指标」「/quality-screen」或给出行业/指数/主题要批量去劣时使用。宁可漏网不可误杀；通过≠一流。默认 create_web 交付筛选结果表。易混 universe-screen / lean 量化筛——本技能是价值投资去劣，非因子排序。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 去劣筛选
  summary: 7 硬指标 + 豁免规则，批量排除确定非一流公司
  category: industry
  slash-rank: "112"
  default-deliverable: web
  required-packs: fundamentals market artifacts workspace
allowed-tools: search_instruments get_sector_list get_sector_constituents get_index_constituents batch_instrument_snapshots get_instrument_financial_indicators get_instrument_financials get_instrument_cash_flow get_instrument_income_statement get_instrument_balance_sheet get_instrument_snapshot get_current_time ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor run_subagent list_subagents reclaim_subagent
references:
  - scripts/quality_screen.py
  - scripts/fixtures/sample_full.json
  - scripts/fixtures/sample_proxy.json
---

# 去劣筛选（7 条硬指标）

**目标**：不错杀一流好公司，但排除**确定**的非一流公司。通过筛选 ≠ 确定好——仍须商业模式、管理层与估值研究。

## 何时使用 / 非目标

| 使用 | 不要用 |
|------|--------|
| 个股/行业/指数/主题批量去劣 | 要找「动量最强 / 因子 Top」→ `@skill:universe-screen` 等量化筛 |
| 宁可漏网不可误杀的硬门槛 | 完整四大师深度研究 → `@skill:investment-research` |
| 交付去劣结果网页 | 行业漏斗终选 3 家 → `@skill:industry-funnel` |

## 研究质量（硬性）

- 报告头：`get_current_time` + **数据截止日期**；信息丰富度 **A/B/C**
- 强制结论：每家 **通过 / 豁免通过 / 排除 / 数据不足（灰色）**——禁止打太极
- 资料多 ≠ 确定性高；本产品为学习辅助，**不是**投资建议
- 署名：**Opptrix · AI Berkshire 分析**

## 7 条去劣指标

| # | 指标 | 排除条件 |
|---|------|----------|
| 1 | 10 年平均 ROE | < 8% |
| 2 | 5 年累计自由现金流 | 为负 |
| 3 | 利息覆盖（EBIT/利息） | < 2×（银行/保险跳过） |
| 4 | 长期毛利率 | < 15% |
| 5 | 经营现金流/净利润（5 年均值） | < 0.7 |
| 6 | 长期净利率 | < 5% |
| 7 | 5 年总股本膨胀 | > 20%（非并购） |

### 豁免

- **A（战略投入期→第 1 条）**：上市 <10 年 + 毛利率 >30% + 近 2 年经营现金流为正
- **B（主动低利润→第 6 条）**：毛利率 >30% + 近 2 年净利率 ≥5% 或明确回升
- **C（高周转薄利→第 4/6 条）**：ROE >20% + OCF/NI >1.0 + 会员/平台/高周转模式（须在输入标注 `business_model`）

## Opptrix 取数

| 宇宙 | 工具 |
|------|------|
| 个股 | `search_instruments` |
| 行业 | `get_sector_list` / `get_sector_constituents` |
| 指数 | `get_index_constituents` |
| 主题 | `search_instruments` + 资讯补洞后列清单 |
| 财务 | `get_instrument_financial_indicators` / `get_instrument_financials` / `get_instrument_cash_flow`；批量 `batch_instrument_snapshots` |

取数后 `workspace_write` 为 `panels.financials` 或 `instruments[].metrics`（**禁止**脚本联网；**禁止**原仓库路径）。

## 脚本

```bash
python scripts/quality_screen.py --input data.json --output result.json
```

`meta.data_mode`：七项齐全 → `full`；部分字段 → `proxy`（`degraded: true`）；无法打分 → `insufficient`。禁止写死降级。

## 步骤

1. 解析输入模式（个股 / 行业 / 指数 / 主题）；大宇宙可 `run_subagent` 并行取数，结束后 `reclaim_subagent`
2. 写证据 JSON → `opptrix_run` `quality_screen.py`
3. 汇总表：通过 / 排除 / 豁免通过 / 边界争议；行业模式加通过率与选股结论
4. `list_web_vendor` → `create_web` 交付（署名 + 免责声明）

## 网页目录建议

1. 筛选日期与宇宙说明  
2. 汇总表（7 列 + 结果）  
3. 排除/豁免明细  
4. 板块总结（若批量）  
5. 局限：去劣是第一步  
6. 免责声明  

## 禁止

- 用训练记忆填「完整 10 年 ROE」冒充已取数  
- 数据不足却标「通过」  
- 用户可见文案堆工具名/脚本路径  
- 无 web 交付就结束（除非用户只要口头要点）
