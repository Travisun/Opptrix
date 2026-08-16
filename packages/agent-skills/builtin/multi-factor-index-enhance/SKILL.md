---
name: multi-factor-index-enhance
description: 多因子指数增强（核心加权规则版）。用户说「指数增强」「多因子加权」「指数增强组合」「/multi-factor-index-enhance」时使用。动量+逆波动或 panels.factors 合成加权；无完整风险模型时 meta.degraded。默认 create_web。禁止脚本联网。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 多因子指数增强
  summary: 规则加权指数增强（无完整风险模型）
  category: quant
  slash-rank: "515"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/multi_factor_index_enhance.py
  - scripts/fixtures/sample_input.json
---

# 多因子指数增强（规则加权）

方法溯源 QuantsPlaybook「多因子指数增强」。核心加权：截面 zscore 合成 → TopN → 截断归一。有 `panels.risk_model`/`cov` → full；否则 proxy。

## 何时使用

要对成分/股票池做**多因子合成加权示意**。默认网页交付。

边界：完整均值方差用 `@skill:lean-mean-variance`；行业约束用 `@skill:lean-sector-weighting`。不与 `lean-*` 合并。

## 取数与运行

1. `get_index_constituents` + 批量日 K，或写入 `panels.factors`。
2. `workspace_write` →：

```bash
python scripts/multi_factor_index_enhance.py --input data.json --output result.json
```

### 输入

- `bars[]`：多标的 close（无 panels.factors 时）
- `panels.factors`：可选 `[{symbol, date, factors:{name:val}}]`
- `params`：`mom_window`/`vol_window`/`top_n`/`max_weight`

### 输出

- `signal`：选中标的 `value`（合成分）+ `weight`
- `meta.data_mode`：按是否具备风险模型面板自适应（禁止无条件写死 degraded）

## 依赖

仅标准库。

## 禁止

- 假装有完整风险归因/约束优化
- 荐股或实盘仓位指令
