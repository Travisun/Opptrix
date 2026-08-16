---
name: feature-dist-timing-2
description: 特征分布建模择时系列之二。用户说「特征成交量」「物极必反」「特征分布系列二」「/feature-dist-timing-2」时使用。聚焦成交量类特征极端后的反转/做空开关。与系列一差异见 SKILL。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 特征分布择时之二
  summary: 成交量极端反转择时
  category: quant
  slash-rank: "538"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/feature_dist_timing_2.py
  - scripts/fixtures/sample_input.json
---

# 特征分布建模择时系列之二

溯源华创「物极必反，巧妙做空，特征成交量」思路：**成交量类特征** 进入历史极端高分位后，给出偏空/减仓开关（物极必反），而非系列一的对称多空分位。

## 与系列一（`feature-dist-timing`）差异（必读）

| 维度 | 系列一 | 系列二（本技能） |
|------|--------|------------------|
| 主题 | 通用特征分布阈值 | **特征成交量** 极端反转 |
| 默认特征名 | 任意 / `params.feature` | `volume` / `feature_volume` / `turnover` |
| 高分位行为 | 可配置做多（state=1） | **偏空**（state=-1，物极必反） |
| 低分位 | 可配置做空 | 默认中性（不主动做多），除非 `params.symmetrical=true` |
| 适用 | 情绪/价量综合特征 | 放量极端后的择时开关 |

勿与系列一合并；用户说「系列二 / 特征成交量」时用本技能。

## 运行

```bash
python scripts/feature_dist_timing_2.py --input data.json --output result.json
```

默认 `create_web`。仅标准库。

