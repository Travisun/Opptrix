---
name: ht-ffscore
description: 华泰 FFScore / 比乔斯基风格财务多维打分。用户说「FFScore」「F-Score」「比乔斯基」「财务打分」「华泰价值选股」「/ht-ffscore」时使用。Agent 写入 panels.financials 后脚本打分排序；无财务则失败说明。默认 create_web。禁止联网拉财务。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 华泰FFScore打分
  summary: 财务多维打分截面排序（FFScore/F-Score）
  category: quant
  slash-rank: "510"
  default-deliverable: web
  required-packs: fundamentals market artifacts
allowed-tools: get_instrument_financials search_instruments get_index_constituents get_sector_constituents batch_instrument_snapshots ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/ht_ffscore.py
  - scripts/fixtures/sample_input.json
---

# 华泰 FFScore 财务打分

方法溯源 **华泰价值选股 FFScore** / 比乔斯基 F-Score；本技能由 Agent 取财务写入工作区后，用自包含脚本打分排序。**脚本不联网取数**。

## 何时使用

用户要对一组 A 股做**财务质量/改善多维打分排序**（FFScore 5 维或 F-Score 9 维）。默认交付网页。

边界：神奇公式双因子用 `@skill:lean-magic-formula`；一般条件筛选另议。本技能**不**承诺与研报回测可复现。

## 非目标

- 不荐股、不给目标价/仓位
- 不调用聚宽/外部行情 SDK
- 不与 `lean-magic-formula` / `lean-qc500-style-screen` 合并

## 取数与运行

1. 确认宇宙（成分 / 用户清单 / `ask_user`）。
2. 用 `get_instrument_financials`（及可得资产负债字段）整理为 `panels.financials`。
3. `workspace_write` 输入 JSON → `opptrix_run`：

```bash
python scripts/ht_ffscore.py --input data.json --output result.json
```

4. 解读 `signal` 排名表 → `list_web_vendor` → `create_web`。

### 输入 schema（要点）

```json
{
  "meta": { "skill": "ht-ffscore", "asof": "2026-08-16" },
  "panels": {
    "financials": [
      {
        "symbol": "600519.SH",
        "report_date": "2024-12-31",
        "roe": 0.25,
        "roe_prev": 0.22,
        "roa": 12.0,
        "operating_revenue": 1e10,
        "total_assets": 2e11,
        "net_operate_cash_flow": 5e9
      }
    ]
  },
  "params": { "mode": "ffscore" }
}
```

`params.mode`：`ffscore`（默认，5 维）| `fscore`（9 维）| `both`。

缺字段的分项跳过；**整表无财务** → `ok:false` + 说明。

### 输出解读

- `signal`：按得分降序的 ranking（含分项 components）
- `metrics`：样本数、均分等
- `assumptions`：口径与缺项声明

## 依赖

仅 Python 标准库。

## 网页报告建议目录

1. 宇宙与报告期  
2. 打分规则与字段映射假设  
3. 排名表（事实）  
4. 缺项与完整度  
5. 事实 / 假设 / 推断  
6. 免责声明（非荐股）

## 禁止

- 编造财务数字；无 `panels.financials` 仍输出假排名  
- 把高分写成「必买」  
- 无交付就结束（默认 web）
