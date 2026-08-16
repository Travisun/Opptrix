---
name: signal-vmacd-mtm
description: VMACD_MTM 信号模块。用户说「VMACD」「成交量MACD动量」「/signal-vmacd-mtm」时使用。输出 VMACD_MTM 信号序列。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: VMACD_MTM信号模块
  summary: 成交量MACD动量信号序列
  category: quant
  slash-rank: "581"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/signal_vmacd_mtm.py
  - scripts/fixtures/sample_input.json
---

# signal-vmacd-mtm

SignalMaker 成交量 MACD 动量。策略技能见 `vmacd-mtm-timing`。`signal-utils-shared` 已并入。

## 运行

```bash
python scripts/signal_vmacd_mtm.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。
