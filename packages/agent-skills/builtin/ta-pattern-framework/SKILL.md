---
name: ta-pattern-framework
description: 技术形态识别框架（核心规则）。用户说「形态识别」「锤子线」「吞没」「十字星」「/ta-pattern-framework」时使用。若干核心形态规则，非完整 TA-Lib。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 技术形态框架
  summary: 核心K线形态规则识别
  category: quant
  slash-rank: "536"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/ta_pattern_framework.py
  - scripts/fixtures/sample_input.json
---

# 技术形态识别框架（核心规则）

方法溯源「技术分析算法框架与实战」。本技能实现**有限核心形态**（非完整 TA-Lib / 非全库形态）：

| 形态 | 规则摘要 |
|------|----------|
| doji | |open−close| / (high−low) 很小 |
| hammer | 下影长、实体小、上影短 |
| bullish_engulfing | 前阴后阳且实体吞没 |
| bearish_engulfing | 前阳后阴且实体吞没 |

圆弧底等见 `@skill:ta-arc-bottom`。

## 运行

```bash
python scripts/ta_pattern_framework.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。

