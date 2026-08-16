---
name: microstructure-w-factor
description: 反转微观 W 因子。用户说「W因子」「反转微观」「开源证券反转」「/microstructure-w-factor」时使用。日频规则：隔夜与日间收益分解构造 W。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 反转微观W因子
  summary: 日频W因子规则版
  category: quant
  slash-rank: "533"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/microstructure_w_factor.py
  - scripts/fixtures/sample_input.json
---

# 反转微观 W 因子（日频规则版）

方法溯源开源证券「A股反转之力的微观来源」。完整高频路径降级为日频：

`overnight = open_t / close_{t-1} − 1`，`day = close_t / open_t − 1`，  
`W ≈ mean(overnight − day)` 窗口版（隔夜相对日间的反转结构代理）。

## 运行

```bash
python scripts/microstructure_w_factor.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。

