# 投研文章数据需求清单

## 概述

每篇投研文章必须基于 AStockLayer 实时查询的真实数据。本文档规定：**
每种文章类型需要采集哪些数据
数据如何入文
数据缺失时的处理方式

## AStockLayer 核心查询

```python
from a_stock_layer import AshareEngine
engine = AshareEngine()
```

---

## 数据维度总表

| 维度 | 查询方法 | 返回模型 | 缓存TTL | 必需场景 |
|------|---------|---------|---------|---------|
| 实时行情 | `engine.realtime(code)` | StockRealtime | 不缓存 | 所有文章 |
| 历史K线 | `engine.kline(code, "daily", start, end)` | StockKline | 1h | 技术面、价值分析 |
| 公司概况 | `engine.profile(code)` | StockProfile | 7天 | 所有文章 |
| 财务摘要 | `engine.financials(code)` | FinancialSummary | 24h | 价值分析、财报解读 |
| 利润表 | `engine.income_statement(code)` | IncomeStatement | 24h | 财报解读、对比分析 |
| 资产负债表 | `engine.balance_sheet(code)` | BalanceSheet | 24h | 财报解读、风险分析 |
| 现金流 | `engine.cash_flow(code)` | CashFlow | 24h | 财报解读、质量判断 |
| 主营构成 | `engine.main_business(code)` | MainBusinessData | 24h | 产业链分析、价值分析 |
| 资金流 | `engine.money_flow(code)` | MoneyFlow | 1h | 技术面、资金面分析 |
| 新闻公告 | `engine.news(code)` | NewsItem | 1h | 事件驱动、热点分析 |
| 舆情 | `engine.sentiment(code)` | SentimentData | 不缓存 | 事件驱动、市场情绪 |
| 龙虎榜 | `engine.dragon_tiger(date)` | DragonTiger | 1h | 短线分析、热点分析 |
| 融资融券 | `engine.margin_trade(code)` | MarginTrade | 1h | 资金面分析 |
| 涨停跌停 | `engine.limit_updown(date)` | LimitUpDown | 不缓存 | 热点追踪 |
| 市场情绪 | `engine.market_breadth(date)` | MarketBreadth | 不缓存 | 市场大背景 |
| 北向资金 | `engine.market_money_flow("north")` | MarketMoneyFlow | 1h | 市场大背景 |
| 行业资金 | `engine.sector_money_flow()` | SectorMoneyFlow | 1h | 板块分析 |
| 股东信息 | `engine.shareholders(code)` | ShareholderData | 24h | 深度研究 |
| 机构持仓 | `engine.inst_holding(code)` | InstitutionalHolding | 24h | 深度研究 |
| 分红回购 | `engine.dividend(code)` | Dividend | 24h | 价值分析 |
| 解禁质押 | `engine.lockup_expiry(code)` | LockupExpiry | 1h | 风险扫描 |
| 高管增减持 | `engine.insider_trade(code)` | InsiderTrade | 1h | 事件驱动 |
| 可比公司 | `engine.peer_companies(code)` | PeerCompany | 7天 | 对比分析 |
| 业绩预告 | `engine.perf_forecast(code)` | PerformanceForecast | 1h | 财报解读 |
| 技术指标 | `engine.tech_indicator(code, "daily", 120)` | TechnicalIndicator | 1h | 技术面分析 |
| 前五大客户 | `engine.top_customer_supplier(code, "customer")` | TopCustomerSupplier | 24h | 产业链分析 |
| 前五大供应商 | `engine.top_customer_supplier(code, "supplier")` | TopCustomerSupplier | 24h | 产业链分析 |
| 研发投入 | `engine.rd_investment(code)` | RDInvestment | 24h | 成长性分析 |
| 实际控制人 | `engine.actual_controller(code)` | ActualController | 24h | 公司治理分析 |
| 子公司 | `engine.subsidiaries(code)` | SubsidiaryData | 24h | 产业链分析 |

---

## 根据文章类型的数据采集模板

### 1. 价值锚定型（必需 + 推荐）

**必需**：
```python
# 必不可少的核心数据
realtime = engine.realtime(code)          # 当前价、PE、PB、市值
financials = engine.financials(code)      # 营收/利润/ROE/毛利率
dividend = engine.dividend(code)          # 分红历史
peer = engine.peer_companies(code)        # 同行列表
main_biz = engine.main_business(code)     # 主营构成
```

**推荐**：
```python
profile = engine.profile(code)               # 行业/概念
balance = engine.balance_sheet(code)          # 资产负债表深度
cash = engine.cash_flow(code)                 # 现金流验证
inst = engine.inst_holding(code)              # 机构持仓变化
```

**数据入文示例**：
> 截至今天收盘，XX 报收 45.60 元，PE（TTM）为 12.3 倍——这不仅是近 5 年的最低水平，在同行里也排倒数。上一轮 PE 在这个位置是 2018 年底，当时的情况是……
> 但PE低的原因值得分析——是被情绪压低的，还是基本面出了问题。我们得看看这估值到底是被什么压住的。

### 2. 技术面研判型（必需 + 推荐）

**必需**：
```python
realtime = engine.realtime(code)              # 当前价、涨跌幅
kline = engine.kline(code, "daily", start, end)  # 日K线
tech = engine.tech_indicator(code, "daily", 120) # 技术指标(MA/MACD/RSI/KDJ/BOLL)
money = engine.money_flow(code)                # 资金流
```

**推荐**：
```python
intraday = engine.intraday_tick(code, today)   # 当日分时
breadth = engine.market_breadth(today)         # 市场整体情绪
sector_flow = engine.sector_money_flow()       # 行业资金
dragon = engine.dragon_tiger(today)            # 龙虎榜（涨停时必查）
```

**数据入文示例**：
> 放量了。今天成交 XX 亿，是 5 日均量的 1.8 倍。关键是在年线位置放的量——
> MACD 刚好在这个位置金叉。技术上的信号组合挺漂亮的。
> 但我最关心的是：这量是谁买的？主力资金今天净流入 XX 亿，北向也买了 XX 万。
> 这是一个数据层面的观察，需要结合基本面进一步验证。

### 3. 产业链洞察型（必需 + 推荐）

**必需**：
```python
main_biz = engine.main_business(code)               # 产品/地区/行业三维主营
top_customer = engine.top_customer_supplier(code, "customer")  # 前五客户
top_supplier = engine.top_customer_supplier(code, "supplier")  # 前五供应商
subsidiaries = engine.subsidiaries(code)             # 子公司
rd = engine.rd_investment(code)                      # 研发投入
```

**推荐**：
```python
actual_ctrl = engine.actual_controller(code)         # 实控人
related = engine.related_party_trades(code)           # 关联交易
peer = engine.peer_companies(code)                    # 同行对比
profile = engine.profile(code)                        # 行业/概念
```

**数据入文示例**：
> XX 这个生意是这样的：从 XX 买原材料（前五大供应商占了 70% 采购额，
> 集中度相当高），加工成 XX 卖给 XX 行业的大客户（前五大客户占营收 55%）。
> 毛利率 XX%，净利率 XX%——这利润率在行业中游，但有意思的是它的
> 研发费用率 XX%，在同体量的公司里算高的。

### 4. 财报解读型（必需 + 推荐）

**必需**：
```python
income = engine.income_statement(code)                # 利润表
balance = engine.balance_sheet(code)                  # 资产负债表
cash = engine.cash_flow(code)                         # 现金流
financials = engine.financials(code)                  # 财务摘要
realtime = engine.realtime(code)                      # 当前价
```

**推荐**：
```python
forecast = engine.perf_forecast(code)                 # 业绩预告
dividend = engine.dividend(code)                      # 分红
rd = engine.rd_investment(code)                       # 研发
shareholders = engine.shareholders(code)              # 股东变化
```

**数据入文示例**：
> 看利润表，营收涨了 XX%，这没什么好质疑的。真正让我皱眉的是毛利率——
> 跌了 XX 个百分点。管理层说是原材料涨价，但看同行，别人只跌了 XX 个点。
> 这就不是行业性问题，是它自己的问题了。

### 5. 事件驱动型（必需 + 推荐）

**必需**：
```python
news = engine.news(code)                              # 最新新闻公告
realtime = engine.realtime(code)                      # 当日价格反应
sentiment = engine.sentiment(code)                    # 舆情热度
money = engine.money_flow(code)                       # 资金流向
```

**推荐**：
```python
insider = engine.insider_trade(code)                  # 高管增减持
lockup = engine.lockup_expiry(code)                   # 解禁
pledge = engine.share_pledge(code)                    # 质押
shareholders = engine.shareholders(code)              # 股东变化
intraday = engine.intraday_tick(code, today)          # 当天的分时
```

**数据入文示例**：
> XX 公告说实控人要减持 XX%——市场当天的反应是跌了 XX%。
> 但我翻了翻公告，它的减持理由是 XX，而且是在股价涨了 1 倍之后。
> 说实话，我也不喜欢减持，但这个位置、这个量级、这个原因……
> 这可能是过度反应，也可能不是——关键看后续XX数据的验证。

### 6. 对比分析型（必需 + 推荐）

**必需**：
```python
# 对两家公司（A 和 B）都查
profile_a = engine.profile(code_a)
financials_a = engine.financials(code_a)
# 同上查 code_b
main_biz_a = engine.main_business(code_a)
main_biz_b = engine.main_business(code_b)
realtime_a = engine.realtime(code_a)
realtime_b = engine.realtime(code_b)
```

**推荐**：
```python
peer_a = engine.peer_companies(code_a)   # 确认行业基准
rd_a = engine.rd_investment(code_a)
inst_a = engine.inst_holding(code_a)
```

### 7. 实盘复盘型（必需 + 推荐）

**必需**：
```python
# 从 portfolio 记录读取交易历史
trades = engine.portfolio.trades(code)
realtime = engine.realtime(code)                      # 现在价格
# 回顾当时的市场环境和分析逻辑
kline_at_buy = engine.kline(code, "daily", buy_date_range)
```

**推荐**：
```python
money_flow = engine.money_flow(code)                  # 验证当时的资金判断
news_at_buy = engine.news(code, when=buy_date)         # 当时发生了什么
```

---

## 数据缺失处理

### 轻度缺失（不影响发布）
- 某个财务数据缓存尚未刷新 → 使用缓存数据，文中标注"上次报告期"
- 某日龙虎榜未发布 → 跳过该数据

### 中度缺失（需部分降级）
- 某一类数据完全不可用（如产业链数据）→ 告知用户缺失维度
  > "XX 的产业链数据暂时无法获取，这部分将用行业通用逻辑替代。"
- 自动退回上一级数据源（AStockLayer 已内置回退链）

### 严重缺失（阻塞）
- `engine.realtime()` 无法获取当前价格 → 阻塞，需要排查 AStockLayer 安装
- `engine.profile()` 无法返回公司信息 → 阻塞，确认股票代码正确

## 数据入文 Golden Rule

> 数据的引用不是装饰，是证据链的一部分。每一句"数据说"后面都要跟一个"我认为"或者"这说明"。
> 不用数据填字数——用数据支撑判断。
