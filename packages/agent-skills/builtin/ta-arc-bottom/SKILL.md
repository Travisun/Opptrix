---
name: ta-arc-bottom
description: 圆弧底形态识别。用户说「圆弧底」「圆底」「V底形态」「/ta-arc-bottom」时使用。用平滑价局部高低点规则判定圆弧底与提示区。默认 create_web。禁止联网取数。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 圆弧底形态
  summary: 圆弧底/V底规则识别
  category: quant
  slash-rank: "562"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/ta_arc_bottom.py
  - scripts/fixtures/sample_input.json
---

# 圆弧底形态识别

方法溯源技术分析框架中的圆弧底规则：左半弧下跌占比、右半弧上涨占比、半弦长度与缓坡条件。

## 运行

```bash
python scripts/ta_arc_bottom.py --input data.json --output result.json
```

`signal.value`：1=形态且提示区；0.5=仅形态；0=未识别。默认 `create_web`。仅标准库（无 scipy/talib）。

