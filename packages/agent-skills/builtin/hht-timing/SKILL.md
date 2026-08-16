---
name: hht-timing
description: 改进 HHT 择时（相位代理）。用户说「HHT」「希尔伯特」「EMD择时」「/hht-timing」时使用。无 EMD 库时用包络/相位近似并 meta.degraded。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: HHT择时
  summary: 希尔伯特相位代理择时（无EMD降级）
  category: quant
  slash-rank: "524"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/hht_timing.py
  - scripts/fixtures/sample_input.json
---

# HHT 择时（降级）

有 `panels.emd` / `imf` 时走完整相位路径（`data_mode=full`）；否则平滑中轴残差 + 差分正交分量 → `atan2` 相位代理（`data_mode=proxy`）。信号模块见 `@skill:signal-hht`。

```bash
python scripts/hht_timing.py --input data.json --output result.json
```
