---
name: time-varying-sharpe
description: 时变/滚动夏普择时。用户说「时变夏普」「滚动夏普」「tv sharpe」「夏普择时」「/time-varying-sharpe」时使用。用收益序列滚动夏普作仓位或状态开关。默认 A股指数/ETF。默认 create_web。禁止荐股。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 时变夏普择时
  summary: 滚动夏普比率择时状态
  category: quant
  slash-rank: "560"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/time_varying_sharpe.py
  - scripts/fixtures/sample_bars.json
---

# 时变夏普择时

对收盘价收益做**滚动样本夏普**（均值/标准差×√252），映射为风险偏好偏强/偏弱状态。方法灵感来自国海/国信等「时变夏普」系列；**本脚本默认实现滚动夏普**，非 Whitelaw 两步宏观回归完整复现（见 assumptions）。

## 何时使用

- 用户要看指数/ETF 近期风险调整后强度是否抬升/回落
- 需要可复现 JSON 信号再交付网页

非目标：完整宏观因子面板建模；个股荐股。

## 算法要点（事实）

1. 由 `close` 得日收益
2. 窗口 W 内超额收益（可减 `rf_daily`）均值 / 样本标准差 × `ann_factor`（默认 √252）
3. `tv_sharpe ≥ buy_threshold` → 状态 1；`≤ sell_threshold` → 状态 0

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 日 K close | `get_instrument_chart` | 无法计算 |
| 无风险利率 | `ask_user` 或 `rf_daily=0` | 写入假设 |
| 落盘 | `workspace_write` | 无法跑脚本 |
| 脚本 | `get_agent_skill_file` | 说明读出执行 |
| 计算 | `opptrix_run` | 标明失败 |
| 交付 | `create_web` | 可跳过口头 |

## 步骤

1. 确认标的、窗口与阈值。
2. `get_instrument_chart` → `workspace_write`（`bars.close` + `params`）。
3. 拷贝/读出 `scripts/time_varying_sharpe.py`。
4. `opptrix_run`：`python scripts/time_varying_sharpe.py --input … --output …`
5. **事实 | 假设 | 推断** 分栏 → 默认 `create_web`。

## 依赖

仅 Python 标准库。禁止联网取数。

## 禁止

- 荐股；把夏普抬升写成「必须加仓」
- 把滚动夏普静默说成已完整复现 Whitelaw 回归模型
- 无交付结束（默认 web）
