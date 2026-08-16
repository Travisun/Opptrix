---
name: rsrs-timing
description: 光大 RSRS 阻力支撑相对强度择时。用户说「RSRS」「阻力支撑相对强度」「rsrs 择时」「光大 RSRS」「/rsrs-timing」时使用。窗口内 high~low OLS 得 β 与 R²，rsrs=β×R² 再滚动 zscore。默认 A股指数/ETF。默认 create_web。禁止荐股。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: RSRS择时
  summary: 光大RSRS高低点回归斜率择时
  category: quant
  slash-rank: "550"
  default-deliverable: web
  required-packs: instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart ask_user get_agent_skill_file opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/rsrs_timing.py
  - scripts/fixtures/sample_bars.json
---

# RSRS 择时（光大）

方法溯源光大证券「基于阻力支撑相对强度（RSRS）的市场择时」：用高低价相对关系刻画支撑/阻力强度。本技能**只读 workspace JSON 计算**，禁止脚本联网或 `jqdata`。

## 何时使用

- 用户要对 **指数 / 场内 ETF / 单标的** 做 RSRS 斜率或修正标准分择时状态解读
- 需要可复现的 `signal` / `series` / `metrics` JSON，再交付网页

非目标：全市场选股荐股；假装完整券商回测报告；与 `@skill:lean-indicator-playbook`（指标手册）合并。

## 算法要点（事实）

1. 取窗口 N 日 `high`、`low`，OLS：`high = a + β·low`
2. 得 β 与 R²；`rsrs = β × R²`
3. 对 `rsrs` 序列做长度 M 的滚动 zscore → `rsrs_z`
4. 阈值：`rsrs_z ≥ S1` → 状态 1；`rsrs_z ≤ S2` → 状态 -1（规则状态，非买卖指令）

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 日 K high/low | `get_instrument_chart` | not-feasible，禁止编造 |
| 参数 N/M/阈值 | `ask_user` 或显式默认 | 写入 assumptions |
| 落盘 | `workspace_write` | 无法跑脚本 |
| 计算 | `opptrix_run` | 标明失败原因 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头时可跳过 |

## 步骤

1. **确认标的与区间**（默认 CN 指数/ETF）。
2. **`get_instrument_chart`** 取足量日 K（建议 ≥ N+M，经典 N=18、M≈600；样本不足时缩短 M 并声明）。
3. **`workspace_write`** 写入输入 JSON（见契约）：`meta` / `bars`（含 `date,high,low`）/ `params`。
4. **准备脚本**：`get_agent_skill_file` 读取 `scripts/rsrs_timing.py` 拷到 workspace，或说明从本技能附件读出后由 `opptrix_run` 执行。
5. **`opptrix_run`**：`python scripts/rsrs_timing.py --input <data.json> --output <result.json>`
6. **解读**：`series.beta/r2/rsrs/rsrs_z` 为中间量；`signal` 为规则状态；**事实 | 假设 | 推断** 分栏。
7. **交付**：默认 `create_web`（信号曲线、阈值、局限与免责声明）。

## 输入 / 输出（契约）

- 输入：`docs/quants-skill-script-contract.md`；`params.N`、`params.M`、`buy_threshold`、`sell_threshold`
- 输出：`ok/skill/signal/series/metrics/assumptions/errors`
- 依赖：**仅 Python 标准库**；禁止联网取数

## 网页报告建议目录

1. 范围与数据时效  
2. 参数与算法定义  
3. 最新 `rsrs_z` 与规则状态（事实）  
4. 序列摘要图/表  
5. 事实 / 假设 / 推断  
6. 局限（震荡市钝化、样本长度、阈值任意性）  
7. 免责声明（信号≠买卖建议）

## 禁止

- 荐股或把状态写成「买入/卖出指令」
- 脚本内 `import jqdata` / 任意 HTTP 行情
- 无 `create_web`（或用户明确只要口头）就结束
- 与 `lean-*` 技能合并或冒充 LEAN 引擎结果
