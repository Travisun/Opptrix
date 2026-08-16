---
name: qrs-timing
description: 中金 QRS 择时信号。用户说「QRS」「中金 QRS」「qrs 择时」「高低价相关择时」「/qrs-timing」时使用。重写 corr/β/zscore/regulation 核心；单标的 high/low 即可。默认 A股。默认 create_web。禁止荐股。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: QRS择时
  summary: 中金QRS相关与β标准化择时
  category: quant
  slash-rank: "555"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/qrs_timing.py
  - scripts/fixtures/sample_bars.json
---

# QRS 择时（中金）

方法溯源中金《金融工程视角下的技术择时艺术》QRS 思路，对照 QuantsPlaybook `SignalMaker/qrs.py` **重写**为自包含脚本（无 pandas/numpy 依赖）。与独立模块 `@skill:signal-qrs`（若存在）同源算法，本技能面向**择时解读 + 网页交付**。

## 何时使用

用户要对单标的（指数/ETF/个股）用高低价相关结构生成 QRS 规则状态。

非目标：多资产向量化批量选股；完整 backtrader 回测引擎；荐股。

## 算法要点（事实）

1. 窗口 N：计算 `corr(high,low)` 与 `β = (std(high)/std(low))·corr`（可选 simple β 不含 corr）
2. 窗口 M：对 β 序列滚动 zscore → `zscore_beta`
3. `regulation = |corr|^n`（可选除以滚动均值）
4. `qrs = zscore_beta × regulation`；阈值映射为状态 1 / -1

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 日 K high/low | `get_instrument_chart` | 无法计算 |
| 参数 | `ask_user`（N/M/n/阈值） | 用默认并标假设 |
| 落盘 | `workspace_write` | 无法跑脚本 |
| 脚本 | `get_agent_skill_file` → workspace | 说明从 skill 读出 |
| 计算 | `opptrix_run` | 写明错误 |
| 交付 | `create_web` | 可跳过口头要点 |

## 步骤

1. 确认标的与区间（默认 CN）。
2. `get_instrument_chart` 取 high/low（建议 ≥ N+M；经典 N=18、M≈600，不足则缩短并声明）。
3. `workspace_write` 输入 JSON（`bars` + `params`）。
4. `get_agent_skill_file` 拷贝 `scripts/qrs_timing.py`（或等价读出后执行）。
5. `opptrix_run`：`python scripts/qrs_timing.py --input … --output …`
6. 分栏解读 `series` 与 `signal` → 默认 `create_web`。

## 依赖

- **仅 Python 标准库**（SKILL 明确：无需 numpy/pandas）
- 禁止脚本联网 / jqdata / tushare

## 禁止

- 荐股；把 QRS 写成下单指令
- 与 `lean-indicator-playbook` 合并
- 无交付结束（默认 web）
