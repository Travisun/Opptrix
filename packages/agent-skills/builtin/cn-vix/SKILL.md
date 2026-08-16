---
name: cn-vix
description: 中国版 VIX 编制。用户说「CVIX」「中国版VIX」「波动指数」「/cn-vix」时使用。无期权链则用已实现波动代理并 meta.degraded。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 中国版VIX编制
  summary: 已实现波动代理CVIX诚实降级
  category: quant
  slash-rank: "575"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/cn_vix.py
  - scripts/fixtures/sample_input.json
---

# 中国版 VIX（诚实降级）

完整 C-VIX 需要期权链方差互换合成。本技能：

- **有 `panels.options` / `option_chain` / `iv`**：隐含波动合成 CVIX，`data_mode=full`
- **仅有日 K**：已实现波动年化×100 作代理，`data_mode=proxy`（检测降级，非写死）
- **缺数据**：`ok=false`
- 勿与 `lean-vix-dual-thrust` 合并

## 运行

```bash
python scripts/cn_vix.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。
