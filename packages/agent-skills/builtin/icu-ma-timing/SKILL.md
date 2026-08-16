---
name: icu-ma-timing
description: ICU 均线择时。用户说「ICU均线」「ICU MA」「重复中位数均线」「Siegel均线」「/icu-ma-timing」时使用。窗口内 Siegel 稳健回归外推均线，收盘穿越生成状态。默认 A股。默认 create_web。禁止荐股。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: ICU均线择时
  summary: Siegel重复中位数ICU均线穿越信号
  category: quant
  slash-rank: "570"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/icu_ma_timing.py
  - scripts/fixtures/sample_bars.json
---

# ICU 均线择时

对照 QuantsPlaybook `C-择时类/ICU均线`：用 **Siegel 重复中位数（RM）稳健回归** 在窗口末端外推得到 ICU 均线；收盘上穿/下穿生成规则状态（对应原 CrossOver 思路）。本技能为纯 Python 重写，**无 scipy / backtrader**。

## 何时使用

用户要对单标的用稳健均线替代普通 MA，观察穿越状态。

边界：普通双均线用 `@skill:lean-ma-cross-trend`；勿合并。

## 算法要点（事实）

1. 窗口 N 的收盘价，对时间下标做 Siegel slopes
2. `icu_ma = intercept + slope × (N−1)`（窗口末端拟合值）
3. 收盘上穿 ICU → 状态 1；下穿 → 状态 -1

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 日 K close | `get_instrument_chart` | 无法计算 |
| 窗口 N | `ask_user`（默认 5） | 写入假设 |
| 落盘 | `workspace_write` | 无法跑脚本 |
| 脚本 | `get_agent_skill_file` | 说明读出 |
| 计算 | `opptrix_run` | 标明失败 |
| 交付 | `create_web` | 可跳过口头 |

## 步骤

1. 确认标的与 N。
2. `get_instrument_chart` → `workspace_write`（`bars.close`）。
3. 准备 `scripts/icu_ma_timing.py`。
4. `opptrix_run`：`python scripts/icu_ma_timing.py --input … --output …`
5. 解读 `series.icu_ma` 与 `signal`（事实/假设/推断分栏）→ 默认 `create_web`。

## 依赖与性能

- 仅 Python 标准库（内置 Siegel；不要求 scipy）
- 复杂度约 O(N²×T)，N 宜小（默认 5）；大 N 须提示耗时

## 禁止

- 荐股；把上穿写成买入指令
- 引入 backtrader / scipy 作为硬依赖却不声明
- 无交付结束（默认 web）
