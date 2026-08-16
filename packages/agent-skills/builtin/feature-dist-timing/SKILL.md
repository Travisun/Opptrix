---
name: feature-dist-timing
description: 特征分布建模择时（系列一）。用户说「特征分布择时」「分位数择时」「特征阈值」「/feature-dist-timing」时使用。对 panels.features 做分布阈值开关。默认 create_web。与系列二见 feature-dist-timing-2。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 特征分布择时
  summary: 特征分位数阈值择时
  category: quant
  slash-rank: "537"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/feature_dist_timing.py
  - scripts/fixtures/sample_input.json
---

# 特征分布建模择时（系列一）

对 Agent 写入的 **特征时间序列** 估计滚动分位，越上/下阈触发多空开关。

## 与系列二差异

| | 系列一（本技能） | 系列二 `@skill:feature-dist-timing-2` |
|--|--|--|
| 焦点 | 通用特征分位阈值 | **成交量类特征** 极端反转/做空开关 |
| 输入 | `panels.features` 任意 `name` | 优先 `volume` / `feature_volume` |
| 信号 | 上穿高分位做多、下穿低分位做空（可配） | 物极必反：极端高量后偏空开关 |

## 输入

`panels.features[]`：`date, name, value`

## 运行

```bash
python scripts/feature_dist_timing.py --input data.json --output result.json
```

默认 `create_web`。仅标准库；禁止脚本内 tushare。

