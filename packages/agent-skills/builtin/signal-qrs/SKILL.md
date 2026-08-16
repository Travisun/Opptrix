---
name: signal-qrs
description: QRS 信号生成器。用户说「QRS信号」「/signal-qrs」时使用。高低价相关、β、zscore 信号序列。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: QRS信号生成器
  summary: 高低价相关β zscore信号
  category: quant
  slash-rank: "580"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/signal_qrs.py
  - scripts/fixtures/sample_input.json
---

# signal-qrs

SignalMaker `QRSCreator`。策略技能见 `qrs-timing`。`signal-utils-shared` 已并入。

## 运行

```bash
python scripts/signal_qrs.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。
