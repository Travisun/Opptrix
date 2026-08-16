---
name: star-manager-alpha
description: 优秀基金经理超额收益因子。用户说「明星基金经理」「基金持仓因子」「优秀管理人超额」「/star-manager-alpha」时使用。缺基金持仓时 ok:false 或 meta.degraded + 用户导入 panels.holdings。默认 create_web。禁止联网取持仓。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 优秀基金经理超额
  summary: 持仓重合超额选股因子
  category: quant
  slash-rank: "527"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/star_manager_alpha.py
  - scripts/fixtures/sample_input.json
---

# 优秀基金经理超额收益因子

方法溯源 QuantsPlaybook「来自优秀基金经理的超额收益」。对用户/Agent 写入的 **基金持仓面板** 统计重合与权重，输出选股截面。

## 何时使用

要从「优秀管理人持仓」中提炼选股权重。默认 `create_web`。

## 取数与运行

1. 优先取基金持仓能力；缺口时 `ask_user` 导入 JSON 至 `panels.holdings`。
2. `workspace_write` → `opptrix_run`：

```bash
python scripts/star_manager_alpha.py --input data.json --output result.json
```

3. `create_web` 交付。

### 输入

- `panels.holdings[]`：`fund_id, symbol, weight, period`（可选 `excess_ret`）
- 缺持仓且无 `params.allow_degraded` → `ok:false`
- 有 `panels.holdings` / `fund_holdings` / `manager_returns` → `data_mode=full`
- 缺持仓且 `params.allow_proxy=true`（兼容 `allow_degraded`）→ 日K动量代理，`data_mode=proxy`
- 否则 `ok=false`（insufficient），不默认强制 proxy

## 依赖

仅标准库。禁止 jqdata/tushare/qlib。

