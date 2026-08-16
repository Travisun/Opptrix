---
name: pure-idio-vol
description: 纯真特质波动率因子。用户说「特质波动」「纯真波动率」「idio vol」「/pure-idio-vol」时使用。对市场回归取残差波动并做截面纯化。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 纯真特质波动
  summary: CAPM残差波动去相关
  category: quant
  slash-rank: "566"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/pure_idio_vol.py
  - scripts/fixtures/sample_input.json
---

# 纯真特质波动率

特质波动 = CAPM 残差标准差；完整「剔除跨期截面相关」需长面板，本脚本在短样本下降级为截面去均值并声明。

## 运行

```bash
python scripts/pure_idio_vol.py --input data.json --output result.json
```

`signal` 按 pure_idio_vol 升序（低波动靠前）。默认 `create_web`。

