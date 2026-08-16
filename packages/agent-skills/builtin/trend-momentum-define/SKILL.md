---
name: trend-momentum-define
description: 趋与势量化定义。用户说「趋与势」「趋势标准化」「势的定义」「/trend-momentum-define」时使用。融合均线与单调性定义趋/势。默认 create_web。禁止荐股。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 趋与势量化定义
  summary: 趋与势可计算定义与规则状态
  category: quant
  slash-rank: "572"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/trend_momentum_define.py
  - scripts/fixtures/sample_input.json
---

# 趋与势量化定义

对价格走势给出可计算的「趋」（方向位移）与「势」（波段持续性）定义，并输出规则状态序列。

## 何时使用

- 用户要量化「趋 / 势」、标准化结构图、波段强弱
- 需要可复现 JSON `signal` / `series.qu` / `series.shi`

非目标：荐股；与 `lean-*` 合并。

## 算法要点

1. 用 N 日均线 + 收盘价单调性融合得到状态 ∈ {-1,0,1}
2. 位移累加；在 lookback 内按拐点切波段
3. `(趋,势)=(Σd_i, Σd_i²)`；势过低视为震荡

## 运行

```bash
python scripts/trend_momentum_define.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。禁止脚本联网取数。
