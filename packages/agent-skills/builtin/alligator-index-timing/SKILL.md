---
name: alligator-index-timing
description: 鳄鱼线/AO 指数择时与轮动状态解读。用户说「鳄鱼线」「AO指标」「Alligator择时」「指数鳄鱼线轮动」「/alligator-index-timing」时使用。方法溯源 QuantsPlaybook 鳄鱼线策略与 SignalMaker；用平台日K经 workspace JSON 计算。默认 create_web。禁止脚本内取数。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 鳄鱼线指数择时
  summary: 鳄鱼线与AO共振解读指数/ETF趋势状态
  category: quant
  slash-rank: "430"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 鳄鱼线指数择时

方法溯源 **QuantsPlaybook** 鳄鱼线指数择时及轮动（SignalMaker `alligator_indicator_timing`）；本技能用平台日 K 做**规则状态解读**，不联网取数。

## 何时使用

用户要对 **A股指数/场内 ETF** 做鳄鱼线（下颚/牙齿/上唇）与 AO 动量震荡的择时状态诊断。

边界：纯指标手册用 `@skill:lean-indicator-playbook`；ETF 轮动组合勿与 `@skill:lean-etf-global-rotation` 合并。默认网页交付。

## 分析架构（投研方法）

- **问题/假设**：鳄鱼线是否多/空排列触发？AO 是否连续上行/下行？二者是否共振？
- **证据清单**：日 K OHLCV（事实）、参数窗口（假设）、共振持仓状态（推断）
- **多维交叉验证**：鳄鱼线排列 vs AO 连续方向；冲突时记平坦
- **结论与不确定**：滞后排列、震荡市假信号
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 日 K | `get_instrument_chart` → `workspace_write` | 不编造 |
| 计算 | `opptrix_run` 本技能脚本 | 失败则说明 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. 确认默认 CN 指数/ETF 与参数（periods/lag/ao_window，有默认值）。
2. 拉取日 K，写入 workspace JSON（`bars` 含 OHLCV）。
3. 运行：`python scripts/alligator_index_timing.py --input data.json --output result.json`
4. 解读 `signal`（1/-1/0）与 `series`（jaw/teeth/lips/ao）。
5. 分栏结论后默认 `create_web`。

## 输入 / 输出

- 输入：契约见仓库 `docs/quants-skill-script-contract.md`；`params.periods` 默认 `(13,8,5)`，`lag` 默认 `(8,5,3)`。
- 输出：`ok/signal/series/metrics/assumptions`；AO 为研报口径（非 TradingView median price）。

## 依赖与降级

- **仅 Python 标准库**；无 numpy/pandas/talib。
- 样本过短则 `ok=false` 并写 `errors`。

## 网页报告建议目录

1. 范围与参数  
2. 鳄鱼线/AO 当前状态  
3. 共振信号时间线  
4. 事实 / 假设 / 推断  
5. 局限与观察清单  
6. 免责声明

## 禁止

- 荐股；把信号写成买卖指令
- 脚本内联网取数（jqdata / tushare / qlib / HTTP 行情）
- 假装完整回测引擎或伪造胜率
- 无交付就结束（默认 web）
- 与 `lean-*` 技能合并或冒充

