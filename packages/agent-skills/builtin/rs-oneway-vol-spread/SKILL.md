---
name: rs-oneway-vol-spread
description: 相对强弱单向波动差择时。用户说「单向波动」「波动剪刀差」「RPS 波动差」「/rs-oneway-vol-spread」时使用。用日 OHLC 计算上行/下行波动差并平滑为状态；可选 RPS 加权。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 相对强弱单向波动差
  summary: 振幅剪刀差与可选 RPS 加权择时状态
  category: quant
  slash-rank: "515"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/rs_oneway_vol_spread.py
  - scripts/fixtures/sample_input.json
---

# 相对强弱单向波动差

方法溯源 **国信证券市场波动率研究**：上行波动 − 下行波动的「剪刀差」，移动平均为正偏多。算法按 QP 目录公式纯 Python 重写，**不依赖**原 notebook 运行时。

## 何时使用

用户要对指数/个股做**单向波动差**状态判断。默认网页。

## 取数与运行

1. 取主标的（或指数）日 K OHLC → `workspace_write`。
2. 运行：

```bash
python scripts/rs_oneway_vol_spread.py --input data.json --output result.json
```

3. `create_web`。

### 定义

- 上行 = `high/open - 1`  
- 下行 = `1 - low/open`  
- 差 = 上行 − 下行；对差做 SMA，`>0` → 状态 1  

可选 `params.use_rps=true`：用 RPS 符号加权差（研报进阶路径）。

### 参数

- `params.ma`：差的均线（默认 60）  
- `params.symbol`：多标的输入时指定主序列  
- `params.use_rps` / `params.rps_ma` / `params.rps_lookback`

### 输出

- `signal`：状态序列  
- `series`：up/down/diff/diff_ma/rps 等

## 依赖

仅标准库。

## 禁止

- 荐股；编造未计算序列；无 web 结束
