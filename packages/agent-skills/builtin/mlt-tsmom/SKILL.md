---
name: mlt-tsmom
description: 多任务时序动量组合（规则版 MLT_TSMOM）。用户说「MLT_TSMOM」「多周期时序动量」「/mlt-tsmom」时使用。多 horizon 波动缩放动量平均；无深度学习。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: MLT时序动量
  summary: 规则版多周期 TSMOM 组合
  category: quant
  slash-rank: "523"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/mlt_tsmom.py
  - scripts/fixtures/sample_input.json
---

# MLT_TSMOM（规则降级）

多 horizon 收益/波动 平均；`meta.degraded`。勿与 lean-returns-momentum / lean-risk-parity 合并。

```bash
python scripts/mlt_tsmom.py --input data.json --output result.json
```
