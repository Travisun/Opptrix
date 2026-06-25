---
name: t-strategy
description: A股投行级T增收策略引擎。9个策略（高盛GAT/摩根大通均值回归/摩根士丹利量价/桥水宏观/行为金融/市场异象/价值因子/行业轮动）、50+技术指标、因子模型、组合风控。
source: plugin
trigger:
  - keywords: ["T策略","T增收","波段操作","买卖点","技术分析","策略信号","高抛低吸","低吸高抛","trading strategy","量化策略","多因子","选股策略","仓位管理"]
  - keywords: ["分析","评估","信号","评分","报告"]  # 结合股票代码触发
  - keywords: ["Goldman Sachs","高盛","JP Morgan","摩根大通","Morgan Stanley","摩根士丹利","Bridgewater","桥水","Fama-French","AQR","文艺复兴","Two Sigma"]
---

# t-strategy — A股投行级策略研究框架

`from t_strategy import SignalEngine, quick_assess, scan_portfolio, generate_report`

## 一句话

**基于 Goldman Sachs、JP Morgan、Morgan Stanley、Bridgewater 等 10+ 投行方法的 A 股策略框架。**
9 个独立策略 → 信号融合引擎 → BUY/SELL/HOLD 决策 + 置信度。

## 快速入手

```python
from a_stock_layer import AshareEngine
from t_strategy import SignalEngine, quick_assess, generate_report

engine = AshareEngine()

# 一句话评估
print(quick_assess(engine, "600519"))
# → 贵州茅台(600519): ▲ T买入信号 (评分42, 置信60%)

# 详细报告
print(generate_report(engine, "600519"))

# 批量扫描持仓
df = scan_portfolio(engine)
```

## 策略清单（9 个）

| 策略 | 来源 | 权重 | 用途 |
|------|------|------|------|
| TrendStrategy | Goldman Sachs GAT | 25% | 多周期趋势对齐，判断大方向 |
| MeanReversionStrategy | JP Morgan Technical | 25% | Bollinger+RSI 均值回归，T 入场出场 |
| MomentumFlowStrategy | Morgan Stanley Quant | 20% | MACD+KDJ+主力资金，动量确认 |
| VolumePriceStrategy | Morgan Stanley Quant | 15% | 量比+OBV+Force，量价配合 |
| MarketContextStrategy | Bridgewater Risk Parity | 15% | 行业+全市场情绪过滤 |
| BehavioralStrategy | Kahneman + Shefrin | — | 极端情绪逆向操作 |
| AnomalyStrategy | Jegadeesh + 事件研究 | — | 短期反转/业绩断层/事件驱动 |
| ValueFactorStrategy | Fama-French + AQR | — | PB-ROE/戴维斯双击/盈利质量 |
| RotationStrategy | 中金行业比较 | — | 行业资金/概念热度 |

> 前 5 个策略带权重参与融合评分，后 4 个作为辅助参考。

## 技术指标（50+）

均线: ma, ema, wma, trix
趋势: macd, adx, parabolic_sar
动量: rsi(6/12/24), kdj, williams_r, cci, roc, mfi, psychological_line
波动: bollinger, bollinger_b, atr, keltner
量能: obv, volume_ratio, force_index, eom
形态: detect_candlestick_patterns (锤子线/十字星/吞没/晨星/黄昏星等)

```python
from t_strategy.indicators import compute_all, rsi, macd, bollinger

# 从 K 线 DataFrame 一键计算
ti = compute_all(kline_df)
# ti 包含全部 30+ 指标列
```

## 因子模型

| 模型 | 函数 | 说明 |
|------|------|------|
| Fama-French | factors.compute_all_factors() | 价值+动量+质量+低波 |
| 估值因子 | factors.compute_value_factors() | PE, PB, 盈利收益率, 股息率 |
| 动量因子 | factors.compute_momentum_factors() | 1/3/6/12月动量, 短期反转 |
| 质量因子 | factors.compute_quality_factors() | ROE, 毛利率, 杠杆率 |
| 低波因子 | factors.compute_low_vol_factors() | 波动率, 最大回撤, Beta |

## 组合与风控

| 模块 | 功能 |
|------|------|
| portfolio.allocation.risk_parity_weights | 风险平价权重 |
| portfolio.allocation.mean_variance_weights | 均值方差最优 (MPT) |
| portfolio.allocation.kelly_fraction | 凯利公式 |
| portfolio.risk.position_sizing | 基于风险的仓位计算 |
| portfolio.risk.fixed_stop_loss | 固定比例止损 |
| portfolio.risk.trailing_stop | 移动止损 |
| portfolio.risk.sharpe_ratio | 夏普比率 |
| portfolio.risk.sortino_ratio | 索蒂诺比率 |
| portfolio.risk.max_drawdown | 最大回撤 |
| portfolio.risk.value_at_risk | VaR 在险价值 |

## SignalEngine 方法

| 方法 | 说明 |
|------|------|
| `analyze(code)` | 运行全策略融合分析 |
| `analyze(code, strategies=["trend", "mean_reversion"])` | 指定策略 |
| `list_available_strategies()` | 列出可用策略 |

## 典型工作流

```python
# 盘前扫描
df = scan_portfolio(engine)
signals = df[df.verdict != "HOLD"]

# 对感兴趣个股出详细报告
for code in signals["code"].values:
    print(generate_report(engine, code))
    print()

# 查看关键技术位
from t_strategy.data import fetch_kline
from t_strategy.indicators import compute_all
kd = fetch_kline(engine, "600519", "daily", 60)
ti = compute_all(kd)
last = ti.iloc[-1]
print(f"MA5={last.ma5:.1f} MA10={last.ma10:.1f} "
      f"Boll上轨={last.boll_up:.1f} Boll下轨={last.boll_low:.1f}")

# 仓位计算
from t_strategy.portfolio import kelly_fraction, fixed_stop_loss
triggered, stop_price = fixed_stop_loss(entry=143.149, current=168.85)
```

## 数据依赖

- 底层数据通过 `a_stock_layer.AshareEngine` + `efinance` 获取
- 所有策略计算纯本地，无需外部 API

## 注意事项

- 所有信号仅供参考，不构成投资建议
- T 操作建议用底仓的 1/3 以内仓位
- 连续 3 次止损后暂停交易
- 单边行情中均值回归策略可能失效

