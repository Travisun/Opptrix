---
name: morning-brief
description: 开盘早报。隔夜全球市场、A股预判、持仓风险检查、今日事件日历、资金流向、汇率变动、重大公告。在A股开盘前调用，帮助用户做好当日交易准备。
---

# 开盘早报 (Morning Brief)

A股开盘前（9:00-9:25）生成，帮助用户了解隔夜发生了什么、今天关注什么。

## 快速使用

```python
from a_stock_layer import AshareEngine
from skills.morning_brief.report_morning import MorningBriefReport

engine = AshareEngine()
reporter = MorningBriefReport(engine)
print(reporter.generate())
```

## 数据采集维度

| # | 维度 | API 调用 | 说明 |
|---|------|----------|------|
| 1 | 隔夜全球指数 | `global_index("dji/spx/ixic/hsi/n225")` | 美股三大指数 + 恒指/日经 |
| 2 | A股收盘回顾 | `index_realtime("000001/399001/399006/000688")` | 主要指数昨日收盘 |
| 3 | 市场情绪 | `market_breadth()` | 涨跌家数、成交额 |
| 4 | 涨停跌停 | `limit_updown()` | 涨停家数、概念分布 |
| 5 | 北向资金 | `market_money_flow("north")` | 净流入/流出、连续方向 |
| 6 | 行业资金流 | `sector_money_flow("industry")` | 流入/流出Top3行业 |
| 7 | 持仓风险 | `portfolio.holdings()` + `lockup_expiry/perf_forecast/insider_trade/shareholder_plans/share_pledge` | 每只持仓的多维风险扫描 |
| 8 | 事件日历 | `ipo_data()` + `macro_indicator()` | 新股、经济数据发布 |
| 9 | 隔夜新闻 | `news("600519")` / `news("000001")` | 热门股重大公告 |

## 分析逻辑

### 全球市场信号
- 美股平均涨跌幅 > 1.5%: "大幅走强/回调"
- 纳指 vs 道指: 成长 vs 价值风格
- 恒指走势: AH联动判断
- 综合输出: 外围影响的方向性判断

### 市场状态研判
涨跌比 + 成交额 + 涨停家数 三因子综合:
- 涨跌比 > 3:1 + 涨停 > 80 + 成交 > 1.5万亿 → 强势
- 涨跌比 < 0.5:1 + 涨停 < 15 + 成交 < 8000亿 → 弱势

### 北向资金连续流向
检测最近N日的持续方向，判断外资偏好:
- 连续净流入 → 提升信心
- 连续净流出 → 注意风险
- 单日大幅波动 → 关注原因

### 持仓风险多维扫描
对每只持仓并行检查5个维度:
1. 限售解禁（近期有无大量解禁）
2. 业绩预告（预增/预减/首亏）
3. 高管增减持（近期有无减持）
4. 股东增减持计划（进行中/已完成）
5. 股权质押（未解除质押占比）

## 输出结构

```
# A股开盘早报 | YYYY-MM-DD

## 隔夜全球
[指数表格 + 信号解读]

## A股盘前信号
[指数表格 + 涨跌比 + 涨停统计 + 概念分布]
[市场状态判定]

## 资金流向
[北向分析 + 行业资金排名]

## 今日重点
[新股/经济数据/事件日历]

## 持仓风险检查
[逐只股票的5维风险扫描]

## 隔夜重要新闻
[热门股重大公告摘要]

---
**操作提示:** [综合建议]
```

## 什么时候触发

- 用户问："今天怎么看" "开盘早报" "盘前分析"
- 交易日 9:00–9:25 之间最合适
- 非交易日回答："今天是周末/节假日，A股不开盘"

## 注意事项

- 所有数据采集使用 `concurrent.futures.ThreadPoolExecutor` 并行拉取，减少等待
- 持仓数据为空时正常输出无持仓部分
- 个别API失败不影响整体报告（容错处理）
