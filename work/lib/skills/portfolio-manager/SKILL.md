---
name: portfolio-manager
description: 持仓管理。记录用户A股买卖交易、管理佣金费率、计算持仓盈亏。用 engine.portfolio.buy()/sell() 记录交易，engine.portfolio.summary()/holdings() 查盈亏。移动加权平均法计算，支持股票专属佣金配置。
---

# 持仓管理 (Portfolio Manager)

记录交易、跟踪持仓、计算盈亏。数据持久化到 `~/.a_stock_layer/portfolio.db`。

## 如何与用户交互

用户会这样描述交易，从中提取关键信息：

> "帮我记一下我买了100股茅台，价格220元"
> code=600519, shares=100, price=220.50, type=buy

> "我今天卖了50股茅台，价格240元"
> code=600519, shares=50, price=240.00, type=sell

### 需要提取的字段

| 字段 | 说明 |
|------|------|
| code | 股票代码（必需）。贵州茅台→600519，平安银行→000001 |
| shares | 股数（必需）|
| price | 成交单价（必需）|
| type | buy/sell（必需，从"买/卖/买入/卖出"推断）|
| date | 交易日期。用户未说则填当天 |
| name | 股票名称，用户未说则自动从行情获取 |

## API

```python
pf = engine.portfolio

# ── 记录交易 ──
pf.buy("600519", 100, 220.50)              # 买入
pf.buy("600519", 100, 220.50, date="2024-06-01")  # 指定日期
pf.buy("600519", 100, 220.50, commission=5.0)     # 手动指定佣金

pf.sell("600519", 30, 260.00)              # 卖出

# ── 费率配置（覆盖自动计算的默认万2.5）──
pf.set_commission(rate=0.00025, min_fee=5.0)       # 佣金: 万2.5最低5元
pf.set_stamp_duty(0.0005)                           # 印花税: 0.05%仅卖出
pf.set_transfer_fee(0.00001)                        # 过户费: 十万分之一
pf.set_stock_commission("600519", rate=0.0002, min_fee=1.0)  # 某股票专属
pf.reset_stock_commission("600519")                  # 恢复全局
pf.get_config()                                      # 查看当前配置

# ── 查询 ──
summary = pf.summary()            # 整体盈亏汇总
# .total_cost .total_market_value .total_pnl .total_pnl_pct
# .total_unrealized_pnl .total_realized_pnl .holdings_count

holdings = pf.holdings()          # 逐只持仓明细
# .code .name .shares .cost_basis .current_price
# .market_value .unrealized_pnl .realized_pnl

trades = pf.trades()              # 全部交易记录
trades = pf.trades("600519")      # 某只股票的交易明细
# .code .trade_side .shares .price .amount .total_fee .trade_date

# ── 管理 ──
pf.remove_trade(1)                # 按id删除一条交易
pf.clear()                        # 清空全部交易数据
```

## 算法

移动加权平均法（中国A股券商标准）：

- **买入**: 新成本价 = (原持仓市值 + 买入额 + 费用) / (原股数 + 买入股数)
- **卖出**: 已实现盈亏 = (卖出价 − 成本价) × 卖出股数 − 费用
- **浮动盈亏**: (当前市价 − 成本价) × 持仓股数（通过 `engine.realtime()` 获取市价）

## 默认费率

| 费用 | 费率 | 说明 |
|------|------|------|
| 佣金 | 万 2.5，最低 5 元 | 可全局或按股票配置 |
| 印花税 | 0.05% | 仅卖出时收取 |
| 过户费 | 十万分之一 | 买卖均收 |

## 数据存储

`~/.a_stock_layer/portfolio.db`（独立 SQLite，与缓存互不干扰）。
