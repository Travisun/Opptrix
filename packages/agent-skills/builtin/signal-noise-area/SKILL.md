---
name: signal-noise-area
description: 日内噪声区域信号。用户说「噪声区域」「NoiseArea」「/signal-noise-area」时使用。需分钟 bars；缺分钟 ok:false 或 allow_daily_degraded。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 日内噪声区域信号
  summary: 分钟NoiseArea上下界突破
  category: quant
  slash-rank: "579"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/signal_noise_area.py
  - scripts/fixtures/sample_input.json
---

# signal-noise-area

定义买卖力量平衡的噪声区域。**优先分钟 OHLCV**；缺分钟默认 `ok=false`，或 `params.allow_daily_degraded=true` 日频降级。

## 运行

```bash
python scripts/signal_noise_area.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。`signal-utils-shared` 已并入。
