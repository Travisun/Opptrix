---
name: financial-data
description: 财务数据获取与交叉验证。用户说「交叉验证财务」「市值验算」「财务严谨性」「数据抽检」「核对营收」「PE怎么算」「双源核对」「/financial-data」时使用。主路径用 Opptrix 财务工具取数，脚本做精确验算与抽检；禁止裸问模型编造 PE；禁止把外网爬虫当主路径。默认 create_web 交付「数据交叉验证表」。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 财务数据交叉验证
  summary: 双源核对关键财务数字，精确验算后交付交叉验证表
  category: fundamentals
  slash-rank: "105"
  default-deliverable: web
  required-packs: fundamentals market artifacts workspace
allowed-tools: search_instruments get_instrument_financials get_instrument_balance_sheet get_instrument_cash_flow get_instrument_income_statement get_instrument_financial_indicators get_instrument_snapshot get_instrument_chart get_instrument_quotes get_instrument_notices get_notice_content get_instrument_institution_report ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/financial_rigor.py
  - scripts/report_audit.py
  - scripts/run_rigor_json.py
  - scripts/fixtures/sample_verify_market_cap.json
  - scripts/fixtures/sample_cross_validate_full.json
---

# 财务数据获取与交叉验证

本技能规范：**每个关键财务数字须可核验**；有第二源时交叉验证；估值倍数用精确十进制脚本算，**禁止**让模型凭印象口算 PE/PB。

## 何时使用 / 非目标

| 使用 | 不要用本技能 |
|------|----------------|
| 核对营收/净利/市值、双源差异、市值=股价×股本验算 | 只要口头「大概多少 PE」且拒绝取数 |
| 报告定稿前 15% 数据抽检准出/打回 | 完整三表预测模型 → `@skill:financial-model` |
| 交付「数据交叉验证表」网页 | 盈利质量深挖 → `@skill:earnings-quality`；可比倍数样本 → `@skill:comps-analysis` |

**与「裸问模型算 PE」的边界（硬性）**

- ❌ 用户问 PE/PB/市值时，禁止直接用训练记忆或口头估算输出「权威」数字。
- ✅ 先 `get_instrument_quotes` / `snapshot` + `get_instrument_financials`（或 indicators）取数，再 `opptrix_run` 跑 `verify-valuation` / `calc` / `verify-market-cap`。
- 缺数据时诚实写「暂无该期 EPS」，可给**带假设标注**的示意公式，但不得伪装成已核验行情。

## Opptrix 取数（主路径）

**禁止**教 Agent 以 scrapy/爬 macrotrends 等外网页面作为**主路径**。外网公开年报/披露站仅可作**补充说明**；主路径一律 Opptrix 工具。

| 维度 | 工具 | 用途 |
|------|------|------|
| 财务摘要 | `get_instrument_financials` | 营收/利润/ROE/同比多期 |
| 资产负债表 | `get_instrument_balance_sheet` | 资产/负债/权益明细 |
| 现金流量表 | `get_instrument_cash_flow` | 经营/投资/筹资现金流 |
| 利润表 | `get_instrument_income_statement` | 营收/成本/费用明细 |
| 财务指标 | `get_instrument_financial_indicators` | 指标树（如报告期必填） |
| 快照 | `get_instrument_snapshot` | 聚合概况与关键字段 |
| K 线 | `get_instrument_chart` | 历史价（前复权口径用于历史序列） |
| 报价 | `get_instrument_quotes` | 最新价、涨跌幅（市值验算用现价） |
| 第二源 | `get_instrument_notices` / `get_notice_content`、`get_instrument_institution_report`，或用户提供的 `panels` 双源 | 交叉验证副来源 |

取数后写入 workspace，再跑脚本（脚本**不联网**）。

## 交叉验证规则（精髓）

```
误差率 = |来源1 − 来源2| / |来源1| × 100%
```

| 误差 | 处理 |
|------|------|
| ≤ 1% | 一致：取主源，标注双源 |
| 1% ~ 5% | 标记差异，注明两值与可能原因（GAAP/汇率/财年） |
| > 5% | 重大差异：须查公告/原始财报核实，不得直接采用 |

呈现示例：

```
收入：1,239 亿元 ✅
  - Opptrix financials: 1,241
  - notices / 用户 panel: 1,237
  - 误差: 0.3%
```

常见差异原因：GAAP vs Non-GAAP、汇率时点、财年定义、合并口径、更新滞后。未上市公司仅一手来源时标记 `[估计]`，不强制交叉验证。原始财报/公告与工具冲突时，以披露原文为准并说明工具缺口。

**股价与复权**：历史涨幅/历史估值分位用前复权且同分析内不混用；当前市值/当前 PE 用现价 × 最新总股本（与复权无关）。增发回购后用 `verify-market-cap`（偏差 >5% 须核对股本/币种）。

## 脚本

| 脚本 | 作用 |
|------|------|
| `scripts/financial_rigor.py` | CLI：`verify-market-cap` / `verify-valuation` / `cross-validate` / `benford` / `calc` / `three-scenario` |
| `scripts/report_audit.py` | CLI：`extract`（抽检清单）/ `verdict`（准出/打回） |
| `scripts/run_rigor_json.py` | Agent 统一 JSON in/out（推荐） |

```bash
# Agent 推荐
python scripts/run_rigor_json.py --input data.json --output result.json

# 原 CLI 仍可用
python scripts/financial_rigor.py verify-market-cap --price 510 --shares 9.11e9 --reported 4.65e12 --currency HKD
python scripts/report_audit.py extract --report report.md --seed 42
```

### JSON 输入（`run_rigor_json.py`）

```json
{
  "meta": { "skill": "financial-data" },
  "command": "verify-market-cap",
  "params": { "price": 510, "shares": 9.11e9, "reported": 4.65e12, "currency": "HKD" },
  "panels": {}
}
```

`command` 另支持：`verify-valuation`、`cross-validate`（`params.values` 为 `{来源:数值}`）、`benford`、`calc`、`three-scenario`、`extract`（`report_text` 或 `report`）、`verdict`（`params.results`）。

### 数据自适应 `meta.data_mode`

| 条件 | `data_mode` | `degraded` |
|------|-------------|------------|
| `panels` 含双源（`primary`+`secondary`、`sources`≥2、`opptrix`+`notices|institution_report|alt` 等），或 `cross-validate` ≥2 来源，或 verdict 含 `fetched_value2` | `full` | `false` |
| 仅单源 params / 单源 panels | `proxy` | `true` |
| 无法计算 / Benford 样本不足 | `insufficient` | 配合 `ok: false` |

禁止写死 `degraded: true`；须按输入探测。

## 步骤

1. **确认标的与报告期**（`search_instruments` / `ask_user`）。
2. **主路径取数**：financials / 三表 / indicators / snapshot / quotes（按需 chart）。
3. **第二源**：notices / institution_report，或用户 `panels` 双源写入 workspace。
4. **验算**：`workspace_write` → `opptrix_run` `run_rigor_json.py`（市值、估值、cross-validate）。
5. **（可选）报告抽检**：`extract` → 填核验值 → `verdict`。
6. **交付网页（默认）**：`list_web_vendor` → `create_web`，核心产物为**数据交叉验证表**（字段、主源、副源、误差、结论、时效）。已有则 `update_web`。

## 网页报告建议目录

1. 标的、报告期与数据截止  
2. **数据交叉验证表**（主交付）  
3. 市值 / 估值精确验算摘要  
4. 差异原因与待核实项  
5. 事实 | 假设 | 推断分栏  
6. 数据缺口与 `data_mode` 说明  
7. 免责声明（无买卖建议；非审计结论）

## 禁止

- 荐股、目标价伪装成事实  
- 编造未返回的财务数字；裸模型口算 PE 当结论  
- **禁止**把 scrapy / 爬 macrotrends 等当作主取数路径  
- **禁止无交付就结束**（默认须有 web 交叉验证表，除非用户明确只要口头要点）  
- 脚本内联网取数；引入非 stdlib 依赖  
