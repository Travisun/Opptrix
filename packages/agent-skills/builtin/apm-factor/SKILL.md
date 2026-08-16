---
name: apm-factor
description: APM 隔夜/日间收益因子。用户说「APM」「隔夜收益」「日间收益」「开源证券 APM」「/apm-factor」时使用。用日 K open/close 构造隔夜与盘中收益差并截面排序。默认 create_web。禁止脚本联网取数。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: APM隔夜日间因子
  summary: 隔夜与日间收益差的微观结构因子排序
  category: quant
  slash-rank: "511"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/apm_factor.py
  - scripts/fixtures/sample_input.json
---

# APM 隔夜/日间因子

方法溯源 **开源证券 APM 因子模型**。本技能用日频 **open/close** 代理隔夜与日间收益（无 30 分钟线时诚实降级），截面输出因子排序。

## 何时使用

用户要看股票集合上**隔夜相对日间**的收益结构因子。默认网页交付。

边界：正式因子回测用 `@skill:factor-research`；隔夜网络类另见映射表其他技能。不与 `lean-*` 合并。

## 取数与运行

1. 确认宇宙与回看窗口（默认 20 日）。
2. 批量取日 K（须含 open、close）→ `workspace_write`。
3. 运行：

```bash
python scripts/apm_factor.py --input data.json --output result.json
```

4. `create_web` 交付排名与口径说明。

### 输入要点

- `bars[]`：`symbol,date,open,close`
- `params.window`：默认 20  
- `params.method`：`apm_new`（默认，隔夜−日间）| `apm_raw`

### 输出解读

- `signal`：因子值降序 ranking  
- 值为窗口内（隔夜−日间）t 统计量对累计日收益的截面残差（样本够时）

## 依赖

仅标准库。无分钟线时已在 `assumptions` 声明日频代理。

## 禁止

- 假装拥有分钟线精度；无 open/close 仍编造  
- 荐股；无 web 交付结束
