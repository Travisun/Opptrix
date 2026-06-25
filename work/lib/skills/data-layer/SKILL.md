---
name: a-stock-layer
description: A股投资研究数据层。13个数据源自动回退（东财/通达信双源/巨潮/股吧/国家统计局/中证指数等），60+查询维度覆盖行情/资金/财务/股东/产业链/舆情/宏观/全球市场。用 from a_stock_layer import AshareEngine 查任意数据。
---

# AStockLayer 数据层 — 完整能力索引

`from a_stock_layer import AshareEngine`

## 快速入手

```python
engine = AshareEngine()

# 所有查询返回 QueryResult：
#   .success  (bool)   — 是否成功
#   .data     (list)   — 返回数据的 dataclass 列表
#   .source   (str)    — 实际使用的数据源
#   .cached   (bool)   — 是否来自缓存
#   .error    (str)    — 失败原因

# 传 as_df=True 直接返回 pandas DataFrame
result = engine.realtime("600519")
if result.success:
    for item in result.data:
        print(item.name, item.price)           # 贵州茅台 1210.30
```

---

## 一、数据源（13 个 Driver，自动回退）

引擎按优先级遍历 driver，失败自动回退下一个，上层无感知。

| Driver | 优先级 | 能力数 | 核心定位 |
|--------|--------|--------|---------|
| **eastmoney** | 100 | 50 | 全维度主源：行情/资金/K线/F10/产业链/龙虎榜/财报/新闻/全球指数/宏观 |
| **mootdx** | 90 | 4 | 通达信TCP直连：行情+K线（券商级数据，不依赖HTTP） |
| **pytdx** | 85 | 4 | 通达信互备：同上，不同实现代码和服务器 |
| **efinance** | 80 | 4 | 东财HTTP封装：行情+K线 |
| **tencent** | 50 | 4 | 腾讯财经：实时行情+全球指数+汇率（50字段最全） |
| **sina** | 40 | 4 | 新浪财经：实时行情+全球指数+汇率 |
| **tonghuashun** | 30 | 2 | 同花顺：实时行情 |
| **csindex** | 30 | 1 | 中证指数：指数成分股权重列表 |
| **cninfo** | 25 | 1 | 巨潮资讯网：上市公司公告全文 |
| **netease** | 20 | 2 | 网易财经：历史日K线CSV（上市至今完整） |
| **stats_gov** | 20 | 1 | 国家统计局：GDP/CPI/PPI/PMI/M2等宏观指标 |
| **guba** | 15 | 2 | 东方财富股吧：舆情热点+讨论帖子 |
| **xueqiu** | 10 | 3 | 雪球：行情+资金流（兜底） |

**回退链示例：** `engine.realtime("600519")` → eastmoney(100) → mootdx(90) → pytdx(85) → efinance(80) → tencent(50) → sina(40) → tonghuashun(30) → xueqiu(10)

---

## 二、53 个数据能力（Capability）索引

| 类别 | Capability | 值 | 说明 |
|------|-----------|-----|------|
| **行情** | `STOCK_REALTIME` | `stock_realtime` | 个股实时行情 |
|  | `STOCK_KLINE` | `stock_kline` | 个股K线 |
|  | `INTRADAY_TICK` | `intraday_tick` | 日内分时 |
|  | `INDEX_REALTIME` | `index_realtime` | 大盘指数实时 |
|  | `INDEX_KLINE` | `index_kline` | 大盘指数K线 |
|  | `STOCK_LIST` | `stock_list` | 全市场股票列表 |
| **资金** | `STOCK_MONEY_FLOW` | `stock_money_flow` | 个股资金流 |
|  | `MARKET_MONEY_FLOW` | `market_money_flow` | 北向/南向资金流 |
|  | `SECTOR_MONEY_FLOW` | `sector_money_flow` | 行业/板块资金流 |
| **公司概况** | `STOCK_PROFILE` | `stock_profile` | 公司背景概况 |
|  | `STOCK_BASIC` | `stock_basic` | 基本信息 |
|  | `MANAGER_INFO` | `manager_info` | 管理层信息 |
|  | `EMPLOYEE_COMP` | `employee_composition` | 员工构成（学历/职能） |
| **财务** | `FINANCIAL_SUMMARY` | `financial_summary` | 财报摘要 |
|  | `BALANCE_SHEET` | `balance_sheet` | 资产负债表 |
|  | `INCOME_STMT` | `income_statement` | 利润表 |
|  | `CASH_FLOW` | `cash_flow` | 现金流量表 |
|  | `DIVIDEND` | `dividend` | 分红送配 |
|  | `PERF_FORECAST` | `performance_forecast` | 业绩预告 |
| **股东** | `SHAREHOLDER` | `shareholder` | 股东人数+十大股东 |
|  | `INST_HOLDING` | `inst_holding` | 机构持仓 |
|  | `INSIDER_TRADE` | `insider_trade` | 高管持股变动 |
|  | `SHAREHOLDER_PLAN` | `shareholder_plan` | 股东增减持计划 |
|  | `BUYBACK` | `buyback` | 股票回购 |
|  | `ACTUAL_CONTROLLER` | `actual_controller` | 实际控制人追溯 |
|  | `SUBSIDIARY` | `subsidiary` | 子公司信息列表 |
| **产业链** | `MAIN_BUSINESS` | `main_business` | 主营构成（产品/地区/行业） |
|  | `TOP_CUSTOMER` | `top_customer` | 前五大客户 |
|  | `TOP_SUPPLIER` | `top_supplier` | 前五大供应商 |
|  | `RELATED_PARTY` | `related_party` | 关联交易 |
|  | `RD_INVESTMENT` | `rd_investment` | 研发投入 |
|  | `MERGER_ACQUISITION` | `merger_acquisition` | 并购事件 |
|  | `PEER_COMPANY` | `peer_company` | 可比公司 |
| **交易衍生** | `DRAGON_TIGER` | `dragon_tiger` | 龙虎榜 |
|  | `MARGIN_TRADE` | `margin_trade` | 融资融券 |
|  | `BLOCK_TRADE` | `block_trade` | 大宗交易 |
|  | `LOCKUP_EXPIRY` | `lockup_expiry` | 限售解禁 |
|  | `SHARE_PLEDGE` | `share_pledge` | 股权质押 |
|  | `LIMIT_UPDOWN` | `limit_updown` | 涨停跌停 |
|  | `MARKET_BREADTH` | `market_breadth` | 市场情绪涨跌家数 |
| **衍生品** | `CONVERTIBLE_BOND` | `convertible_bond` | 可转债 |
|  | `ETF_DATA` | `etf_data` | ETF基金 |
|  | `IPO_DATA` | `ipo_data` | 新股IPO |
| **指数** | `INDEX_CONST` | `index_constituent` | 指数成分股 |
|  | `SECTOR_LIST` | `sector_list` | 板块列表 |
| **跨市场** | `GLOBAL_INDEX` | `global_index` | 全球指数 |
|  | `EXCHANGE_RATE` | `exchange_rate` | 汇率 |
| **宏观** | `MACRO_INDICATOR` | `macro_indicator` | 宏观经济指标 |
|  | `TRADE_CALENDAR` | `trade_calendar` | 交易日历 |
| **信息** | `NEWS` | `news` | 新闻公告 |
|  | `SENTIMENT` | `sentiment` | 舆情动态 |
| **技术** | `TECH_INDICATOR` | `tech_indicator` | 技术指标（本地计算） |
| **机构** | `INSTITUTIONAL_VISIT` | `institutional_visit` | 机构调研记录 |

---

## 三、60 个 Engine 查询方法速查

### 行情（10）
```python
engine.realtime(code)                        # → List[StockRealtime]      个股实时行情
engine.batch_realtime([codes])               # → List[StockRealtime]      批量实时行情
engine.kline(code, period, start, end)       # → List[StockKline]         历史K线(daily/weekly/monthly/60m/30m/15m/5m/1m)
engine.intraday_tick(code, date)             # → List[IntradayTick]       日内分时
engine.index_realtime(code)                  # → List[IndexRealtime]      大盘指数
engine.index_kline(code, period)             # → List[IndexKline]         指数K线
engine.stock_list(market)                    # → List[StockListItem]      全市场股票(all/sh/sz/bj)
engine.global_index(code)                    # → List[GlobalIndex]        全球指数(dji/spx/ixic/hsi/n225)
engine.exchange_rate(pair)                   # → List[ExchangeRate]       汇率(USDCNY/EURCNY/HKDCNY)
engine.trade_calendar(year)                  # → List[TradeCalendar]      交易日历
```

### 资金（3）
```python
engine.money_flow(code)                      # → List[MoneyFlow]          个股资金流(超大/大/中/小单)
engine.market_money_flow(direction)          # → List[MarketMoneyFlow]    北向/南向资金
engine.sector_money_flow(sector_type)        # → List[SectorMoneyFlow]    行业/概念资金流
```

### 公司深度（10）
```python
engine.profile(code)                         # → StockProfile             公司概况(行业/概念/主营业务/注册信息)
engine.shareholders(code, report_date)       # → List[ShareholderData]    股东人数+十大股东
engine.manager_info(code)                    # → List[ManagerInfo]        管理层(履历/薪酬/持股)
engine.employee_composition(code)            # → EmployeeComposition      员工构成(学历/职能分布)
engine.actual_controller(code)               # → List[ActualController]   实际控制人追溯
engine.subsidiaries(code)                    # → SubsidiaryData           子公司列表(持股/资产/利润)
engine.peer_companies(code)                  # → List[PeerCompany]        同行业可比公司
engine.financials(code, report_type)         # → List[FinancialSummary]   财报核心指标
engine.balance_sheet(code)                   # → List[BalanceSheet]       资产负债表
engine.income_statement(code)                # → List[IncomeStatement]    利润表(详细)
engine.cash_flow(code)                       # → List[CashFlow]           现金流量表
engine.dividend(code)                        # → List[Dividend]           分红送配历史
engine.perf_forecast(code)                   # → List[PerformanceForecast]业绩预告
```

### 产业链挖掘（7）
```python
engine.main_business(code)                   # → MainBusinessData          主营构成(产品/地区/行业三维)
engine.top_customer_supplier(code, dir)      # → List[TopCustomerSupplier] 前五大客户/供应商
engine.related_party_trades(code)            # → List[RelatedPartyTrade]   关联交易详情
engine.rd_investment(code)                   # → RDInvestment              研发投入(费用/人员/资本化)
engine.ma_events(code)                       # → List[MAEvent]             并购重组事件
engine.inst_holding(code)                    # → List[InstitutionalHolding]机构持仓
engine.insider_trade(code)                   # → List[InsiderTrade]        高管增减持
engine.shareholder_plans(code)               # → List[ShareholderPlan]     股东增减持计划
engine.buyback(code)                         # → List[ShareBuyback]        股票回购
```

### 交易衍生（8）
```python
engine.dragon_tiger(date)                    # → List[DragonTiger]         龙虎榜(含机构席位检测)
engine.margin_trade(code)                    # → List[MarginTrade]         融资融券
engine.block_trade(code)                     # → List[BlockTrade]          大宗交易
engine.lockup_expiry(code)                   # → List[LockupExpiry]        限售解禁
engine.share_pledge(code)                    # → List[SharePledge]         股权质押
engine.limit_updown(date)                    # → List[LimitUpDown]         涨停跌停(含连板/概念)
engine.market_breadth(date)                  # → MarketBreadth             市场情绪(涨跌家数/新高新低)
engine.ipo_data()                            # → List[IPOData]             新股IPO
```

### 组合品（3）
```python
engine.convertible_bonds()                   # → List[ConvertibleBond]     可转债(溢价/纯债/评级)
engine.etf_data(etf_code)                    # → List[ETFData]             ETF基金(净值/折溢价/规模)
engine.index_constituents(index_code)        # → List[IndexConstituent]    指数成分股(含权重)
```

### 宏观（2）
```python
engine.macro_indicator(indicator)            # → List[MacroIndicator]      宏观(GDP/CPI/PPI/PMI/M2/社融)
engine.exchange_rate(pair)                   # → List[ExchangeRate]        汇率
```

### 信息（3）
```python
engine.news(code, page, news_type)           # → List[NewsItem]            新闻/公告(含巨潮官方公告)
engine.sentiment(code)                       # → SentimentData             舆情热度(股吧讨论/情绪评分)
engine.institutional_visits(code)            # → List[InstitutionalVisit]  机构调研记录
```

### 技术分析（1）
```python
engine.tech_indicator(code, period, count)   # → TechnicalIndicator        技术指标(MA/MACD/RSI/KDJ/BOLL)
```

---

## 四、43 个 Schema 数据模型详细字段

### 行情类
| 模型 | 关键字段 |
|------|---------|
| **StockRealtime** | code, name, price, open, high, low, pre_close, volume, amount, change, change_pct, turnover_rate, pe, pb, market_cap, amplitude, volume_ratio, timestamp |
| **StockKline** | code, date, open, close, high, low, volume, amount, change_pct, turnover_rate |
| **IndexRealtime** | code, name, price, open, high, low, pre_close, change, change_pct, volume, amount, timestamp |
| **IndexKline** | code, date, open, close, high, low, volume, amount, change_pct |
| **IntradayTick** | code, time, price, avg_price, volume, amount, change_pct, volume_pct |
| **StockListItem** | code, name, market, industry, listing_date, total_market_cap, total_shares |
| **GlobalIndex** | code, name, market(US/HK/JP/EU), price, change, change_pct, open, high, low, pre_close, timestamp |
| **ExchangeRate** | currency_pair, rate, change_pct, timestamp |

### 资金类
| 模型 | 关键字段 |
|------|---------|
| **MoneyFlow** | code, date, main_net, super_large_net, large_net, medium_net, small_net, main_net_pct, close, change_pct |
| **MarketMoneyFlow** | direction(north/south), date, net_amount, sh_net, sz_net, cumulative |
| **SectorMoneyFlow** | sector_name, date, main_net, main_net_pct, top_stocks |

### 公司深度类
| 模型 | 关键字段 |
|------|---------|
| **StockProfile** | code, name, industry, concepts[], listing_date, main_business, registered_capital, total_shares, circulating_shares, total_market_cap, employees, province, city, website |
| **ShareholderData** | code, report_date, shareholder_count, shareholder_count_change, avg_holding_value, top_10_shareholders[ShareholderItem], institutional_holding_pct |
| **ShareholderItem** | rank, name, shares_held, share_pct, change |
| **ManagerInfo** | code, name, position, gender, age, education, background, compensation, shares_held, start_date |
| **EmployeeComposition** | code, report_date, total_employees, education_phd/master/bachelor/college/other, func_production/sales/technology/finance/admin |
| **ActualController** | code, controller_name, shareholding_ratio, control_level, control_path, nature(个人/国资/境外), total_shares, report_date |
| **SubsidiaryData** | code, report_date, subsidiaries[SubsidiaryItem], total_count |
| **SubsidiaryItem** | name, shareholding_ratio, business_nature, total_assets, net_profit, registered_capital, established_date, is_consolidated |
| **PeerCompany** | code, peer_code, peer_name, industry, reason |

### 财务类
| 模型 | 关键字段 |
|------|---------|
| **FinancialSummary** | code, report_date, report_type, revenue, revenue_yoy, net_profit, net_profit_yoy, eps, roe, gross_margin, debt_ratio, operating_cash_flow |
| **BalanceSheet** | code, report_date, total_assets, total_liabilities, equity, current_assets, non_current_assets, cash, accounts_receivable, inventory, fixed_assets, intangible_assets, short/long_term_borrowing |
| **IncomeStatement** | code, report_date, revenue, cost, gross_profit, selling_expense, admin_expense, rnd_expense, finance_expense, operating_profit, net_profit, eps_basic/diluted |
| **CashFlow** | code, report_date, operating_cash_inflow/outflow/net_cash, investing_*, financing_*, net_cash_change, free_cash_flow |
| **Dividend** | code, announcement_date, ex_date, record_date, cash_bonus, share_transfer, rights_issue, rights_price, bonus_total, year |
| **PerformanceForecast** | code, report_date, forecast_type(预增/预减/扭亏/首亏), profit_lower, profit_upper, change_lower, change_upper, announcement_date, summary |

### 产业链挖掘类
| 模型 | 关键字段 |
|------|---------|
| **MainBusinessData** | code, report_date, report_type, products[BusinessLineItem], regions[BusinessLineItem], industries[BusinessLineItem], total_revenue |
| **BusinessLineItem** | name, revenue, revenue_pct, cost, gross_margin, gross_margin_change |
| **TopCustomerSupplier** | code, report_date, direction(customer/supplier), items[CustomerSupplierItem], total_pct |
| **CustomerSupplierItem** | rank, name, amount, amount_pct, is_new |
| **RelatedPartyTrade** | code, report_date, related_party, relationship(子公司/联营/管理), trade_type(采购/销售/租赁/担保), trade_amount, trade_balance, pricing_policy, is_material |
| **RDInvestment** | code, report_date, report_type, rd_expense, rd_expense_pct, capitalized_rd, capitalized_rd_pct, rd_staff_count, rd_staff_ratio |
| **MAEvent** | code, announcement_date, target_company, target_industry, transaction_amount, transaction_method(现金/股份), shareholding_after, purpose(横向/纵向/多元化), progress, goodwill |

### 交易衍生类
| 模型 | 关键字段 |
|------|---------|
| **DragonTiger** | code, date, name, reason, rank, total_buy, total_sell, net_amount, buy_count, sell_count, buy_detail[DragonTigerSeat], sell_detail[] |
| **MarginTrade** | code, date, margin_balance, margin_buy, margin_refund, margin_net, short_balance, short_sell, short_refund, short_net |
| **BlockTrade** | code, date, name, price, volume, amount, premium_discount, buyer, seller |
| **LockupExpiry** | code, date, name, shares_unlock, share_pct, market_value, holder_type |
| **SharePledge** | code, date, pledger, pledgee, shares_pledged, share_pct, pledge_date, release_date, status |
| **LimitUpDown** | code, date, name, limit_type(涨停/跌停/炸板), consecutive_days, price, change_pct, block_amount, block_ratio, turnover_rate, reason |
| **MarketBreadth** | date, advance, decline, flat, limit_up, limit_down, total_volume, total_amount, new_high, new_low, advance_pct, description |
| **IPOData** | code, name, issue_date, listing_date, issue_price, issue_pe, lottery_rate, first_day_return, subscription_amount, industry, board, status |
| **ConvertibleBond** | bond_code, bond_name, stock_code, stock_name, bond_price, stock_price, premium_ratio, conversion_price, pure_bond_value, ytm, remaining_size, rating |
| **ETFData** | etf_code, etf_name, nav, price, premium_discount, tracking_index, scale, daily_volume, daily_amount, tracking_error, management_fee, established_date, fund_manager |
| **IndexConstituent** | index_code, index_name, stock_code, stock_name, weight, industry |

### 宏观/宏观/信息类
| 模型 | 关键字段 |
|------|---------|
| **MacroIndicator** | indicator_name(GDP/CPI/PPI/PMI/M2), date, value, yoy_change, mom_change, unit, source |
| **TradeCalendar** | date, is_trading_day, day_type(交易日/周末/节假日), market |
| **NewsItem** | code, date, title, summary, url, source, content_type(news/announcement), is_important |
| **SentimentData** | code, date, sentiment_score(-1~1), hot_score(0~100), mention_count, avg_sentiment, related_news_count, bull_ratio, bear_ratio |
| **InstitutionalVisit** | code, visit_date, organization, organization_type(基金/券商/保险/QFII/私募), visitor_count, research_category, main_content |
| **TechnicalIndicator** | code, date, 21个字段: ma5/10/20/60/120, macd/macd_signal/macd_hist, rsi_6/12/24, kdj_k/d/j, boll_up/mid/low, volume_ma5/10 |
| **TradeCalendar** | date, is_trading_day, day_type, market |

---

## 五、持仓管理（Portfolio Manager）

`engine.portfolio` — 记录交易、计算盈亏（移动加权平均法，符合A股券商标准）

```python
pf = engine.portfolio

# 记录交易
pf.buy("600519", 100, 220.50)               # 买入 100 股
pf.buy("600519", 100, 220.50, commission=5.0)  # 手动指定佣金
pf.sell("600519", 50, 240.00)               # 卖出 50 股
pf.remove_trade(1)                           # 按id删除交易
pf.clear()                                   # 清空全部

# 费率配置
pf.set_commission(rate=0.00025, min_fee=5.0)        # 佣金: 万2.5最低5元
pf.set_stamp_duty(0.0005)                            # 印花税: 0.05%仅卖出
pf.set_transfer_fee(0.00001)                         # 过户费: 十万分之一
pf.set_stock_commission("600519", rate=0.0002)       # 某股票专属佣金
pf.get_config()                                      # 查看当前费率

# 查询
summary = pf.summary(refresh_prices=True)
# .total_cost .total_market_value .total_pnl .total_pnl_pct
# .total_unrealized_pnl .total_realized_pnl .holdings_count

holdings = pf.holdings(refresh_prices=True)
# .code .name .shares .cost_basis .current_price
# .market_value .unrealized_pnl .realized_pnl

trades = pf.trades("600519")                 # 某只股票的交易明细
stats = pf.stats()                           # 数据库统计
```

### 核心算法
- **买入**: 加权平均成本 = (原持仓市值 + 买入金额 + 费用) / (原股数 + 买入股数)
- **卖出**: 已实现盈亏 = (卖出价 - 成本价) × 卖出股数 - 费用
- **浮动盈亏**: (当前价 - 成本价) × 持仓股数（通过 `engine.realtime()` 获取市价）

### 默认费率
| 费用 | 费率 | 说明 |
|------|------|------|
| 佣金 | 万2.5，最低5元 | 可全局或股票专属 |
| 印花税 | 0.05% | 仅卖出 |
| 过户费 | 十万分之一 | 买卖均收 |

---

## 六、缓存策略

非实时数据自动 SQLite 缓存到 `~/.cache/ashare/a_stock_layer_cache.db`

| TTL | 数据类型 |
|-----|---------|
| 不缓存 | 实时行情、涨停跌停、市场情绪、全球指数、分时、可转债、舆情 |
| 1小时 | K线、资金流、龙虎榜、两融、大宗、解禁、增减持、机构调研、汇率 |
| 24小时 | 财务三张表、股东、分红、机构持仓、质押、主营构成、客户供应商、子公司、研发投入、关联交易、并购事件、ETF、宏观指标 |
| 7天 | 股票基本信息、可比公司 |
| 30天 | 交易日历 |

```python
engine.clear_cache()                          # 全部清空
engine.clear_cache("stock_kline")             # 指定类型
engine.cache_stats()                          # 统计
```

---

## 七、代码映射速查

从查询维度反向查找 Engine 方法、Capability 和 Schema 模型：

```python
# 想查什么 → 调什么 → 返回什么 → 是什么能力
# 实时价格   → engine.realtime()         → StockRealtime      → STOCK_REALTIME
# 历史K线    → engine.kline()            → StockKline         → STOCK_KLINE
# 资金进出    → engine.money_flow()       → MoneyFlow          → STOCK_MONEY_FLOW
# 公司概况    → engine.profile()          → StockProfile       → STOCK_PROFILE
# 十大股东    → engine.shareholders()      → ShareholderData    → SHAREHOLDER
# 利润表      → engine.income_statement()  → IncomeStatement    → INCOME_STMT
# 主营构成    → engine.main_business()     → MainBusinessData    → MAIN_BUSINESS
# 前五客户    → engine.top_customer_supplier()→ TopCustomerSupplier→ TOP_CUSTOMER
# 实际控制人  → engine.actual_controller() → ActualController   → ACTUAL_CONTROLLER
# 子公司      → engine.subsidiaries()      → SubsidiaryData     → SUBSIDIARY
# 研发投入    → engine.rd_investment()     → RDInvestment       → RD_INVESTMENT
# 并购        → engine.ma_events()         → MAEvent            → MERGER_ACQUISITION
# 员工构成    → engine.employee_composition()→ EmployeeComposition→ EMPLOYEE_COMP
# 机构调研    → engine.institutional_visits()→ InstitutionalVisit→ INSTITUTIONAL_VISIT
# 可比公司    → engine.peer_companies()    → PeerCompany        → PEER_COMPANY
# 龙虎榜      → engine.dragon_tiger()      → DragonTiger        → DRAGON_TIGER
# 涨停跌停    → engine.limit_updown()      → LimitUpDown        → LIMIT_UPDOWN
# 市场情绪    → engine.market_breadth()    → MarketBreadth      → MARKET_BREADTH
# 北向资金    → engine.market_money_flow() → MarketMoneyFlow    → MARKET_MONEY_FLOW
# 行业资金    → engine.sector_money_flow() → SectorMoneyFlow    → SECTOR_MONEY_FLOW
# 新闻公告    → engine.news()              → NewsItem           → NEWS
# 舆情热度    → engine.sentiment()         → SentimentData      → SENTIMENT
# 全球指数    → engine.global_index()      → GlobalIndex        → GLOBAL_INDEX
# 汇率        → engine.exchange_rate()     → ExchangeRate       → EXCHANGE_RATE
# 宏观指标    → engine.macro_indicator()   → MacroIndicator     → MACRO_INDICATOR
# 技术指标    → engine.tech_indicator()    → TechnicalIndicator → TECH_INDICATOR
# 可转债      → engine.convertible_bonds() → ConvertibleBond    → CONVERTIBLE_BOND
# ETF         → engine.etf_data()          → ETFData            → ETF_DATA
# 新股        → engine.ipo_data()          → IPOData            → IPO_DATA
# 指数成分    → engine.index_constituents()→ IndexConstituent   → INDEX_CONST
# 股票列表    → engine.stock_list()        → StockListItem      → STOCK_LIST
# 日内分时    → engine.intraday_tick()     → IntradayTick       → INTRADAY_TICK
# 融资融券    → engine.margin_trade()      → MarginTrade        → MARGIN_TRADE
# 大宗交易    → engine.block_trade()       → BlockTrade         → BLOCK_TRADE
# 限售解禁    → engine.lockup_expiry()     → LockupExpiry       → LOCKUP_EXPIRY
# 股权质押    → engine.share_pledge()      → SharePledge        → SHARE_PLEDGE
# 高管增减持  → engine.insider_trade()     → InsiderTrade       → INSIDER_TRADE
# 业绩预告    → engine.perf_forecast()     → PerformanceForecast→ PERF_FORECAST
# 分红送配    → engine.dividend()          → Dividend           → DIVIDEND
# 管理层      → engine.manager_info()      → ManagerInfo        → MANAGER_INFO
# 股东计划    → engine.shareholder_plans() → ShareholderPlan    → SHAREHOLDER_PLAN
# 回购        → engine.buyback()           → ShareBuyback       → BUYBACK
# 关联交易    → engine.related_party_trades()→ RelatedPartyTrade→ RELATED_PARTY
# 交易日历    → engine.trade_calendar()    → TradeCalendar      → TRADE_CALENDAR
```

---

## 八、安装依赖

```bash
pip install -e /path/to/a-stock-layer
# 依赖包括: requests mootdx pytdx efinance pandas
```

如需完整产业链数据支持：`pip install pytdx`

---

## 九、常见模式

```python
# 1. 实时行情 + 投资研究组合查询
engine = AshareEngine()
code = "600519"
r = engine.realtime(code)           # 当前价
p = engine.profile(code)            # 公司概况
f = engine.financials(code)         # 财报摘要
n = engine.news(code)               # 最新新闻
m = engine.money_flow(code)         # 资金流向
b = engine.main_business(code)      # 主营构成

# 2. 产业链全景
engine.main_business(code)          # 卖什么
engine.top_customer_supplier(code)  # 卖给谁/向谁买
engine.subsidiaries(code)           # 子公司
engine.actual_controller(code)      # 谁控制
engine.peer_companies(code)         # 竞争对手

# 3. 风险扫描
engine.lockup_expiry(code)          # 解禁风险
engine.share_pledge(code)           # 质押风险
engine.insider_trade(code)          # 高管动向
engine.shareholder_plans(code)      # 股东计划
engine.perf_forecast(code)          # 业绩预警

# 4. 市场全景
engine.global_index("dji")          # 美股
engine.exchange_rate("USDCNY")      # 汇率
engine.market_breadth()             # 全市场情绪
engine.sector_money_flow()          # 行业资金
engine.market_money_flow("north")   # 北向资金
engine.dragon_tiger()               # 龙虎榜
engine.limit_updown()               # 涨停跌停
```
