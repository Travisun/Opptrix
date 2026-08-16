---
name: csvc-bull-bear
description: CSVC 波动/换手牛熊指标。用户说「牛熊指标」「CSVC」「波动换手择时」「kernel 牛熊」「/csvc-bull-bear」时使用。用滚动波动率与换手率之比刻画牛熊状态。默认 create_web。禁止脚本联网取数。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: CSVC牛熊指标
  summary: 波动率/换手率核指标择时
  category: quant
  slash-rank: "560"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/csvc_bull_bear.py
  - scripts/fixtures/sample_input.json
---

# CSVC 牛熊指标

方法溯源波动率与换手率构建的**牛熊核指标**：`kernel = std(收益, N) / mean(换手, N)`。脚本只读 workspace JSON。

## 何时使用

要对指数/ETF 判断**波动相对换手**的牛熊状态。默认网页交付。

非目标：完整 CSCV 过拟合框架；荐股。

## 取数与运行

1. 取日 K（含 close；换手优先 `turnover`，否则 volume 代理并声明）。
2. `workspace_write` → `opptrix_run`：

```bash
python scripts/csvc_bull_bear.py --input data.json --output result.json
```

3. `create_web` 交付。

### 参数

- `params.period` 默认 60（示意；研报常用 200/250）
- `params.method`：`MA`（默认）| `BBANDS`

## 依赖

仅标准库。禁止 jqdata。
