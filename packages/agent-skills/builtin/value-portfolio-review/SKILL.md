---
name: value-portfolio-review
description: 价值投资组合审视。用户说「价值组合审视」「今天还会买吗」「组合调仓建议」「机会成本」「持仓集中度价值」「/value-portfolio-review」时使用。从「还会不会买」出发做集中度/相关性/三情景预期回报与调仓建议；勿与「组合复盘」事实摘要混淆。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 价值组合审视
  summary: 还会买吗、集中度与机会成本，给出调仓研究建议
  category: portfolio
  slash-rank: "91"
  default-deliverable: web
  required-packs: portfolio fundamentals market artifacts workspace
allowed-tools: get_portfolio_holdings portfolio_summary analyze_portfolio get_watchlist batch_instrument_snapshots get_instrument_quotes get_instrument_snapshot get_instrument_financials get_instrument_financial_indicators get_instrument_dividend list_news_articles search_instruments ask_user activate_agent_skill get_agent_skill opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 价值投资组合审视

> 署名：**Opptrix · AI Berkshire 分析**  
> 源映射：AI Berkshire `portfolio-review` → 本技能 **`value-portfolio-review`**（**禁止**覆盖 `@skill:portfolio-review`）

## 何时使用 / 非目标 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 「今天还会买吗」、仓位是否过高、机会成本、相关性共振、调仓研究建议 | 只要持仓/关注列表**事实复盘**（集中度数字、盈亏结构）→ `@skill:portfolio-review` |
| 按价值投资纪律审视整组合 | 单只深度研究 → `@skill:investment-research` / `@skill:equity-deep-dive` |
| 现金是否该留、是否「不如现金」 | 收益型单票派息安全门 → `@skill:income-investment` |

**硬性边界**：现有 `portfolio-review` 只做事实复盘、**不做买卖/调仓建议**。本技能**允许**给出研究向调仓建议（加/减/清/不动），但仍须免责声明：非投资建议。

## 研究质量硬性规则（摘要）

1. **四大师框架**：组合层结论须能落到段永平（可理解/本分）、巴菲特（现金流与安全边际）、芒格（失败路径/相关共振）、李录（集中与确定性）之一或组合视角；数据不足则诚实声明无法评分。  
2. **强制结论**：组合健康度须为 **优秀 / 良好 / 需要调整 / 问题严重 / 灰色地带（数据不足）** 之一；并回答「最应该做的一件事」。禁止两面讨好收尾。  
3. **镜子测试**：对建议「加仓/新建」的标的，用 ≤5 句说清生意、为何现在、什么会证伪；说不清 → 不得建议加仓。  
4. **信息丰富度 A/B/C**：报告头标注；C 级持仓结论降置信度，禁止假完整。  
5. **快速否决**：诚信污点 / 能力圈外且说不清赚钱方式 → 一票否决，估值再便宜也不用分数对冲。  
6. **纪律**：`get_current_time` 写数据截止日；事实|观点分栏；关键估值用 `@skill:financial-data` 的 `financial_rigor`（`opptrix_run`）；取数失败禁止用训练知识冒充；交付免责声明。

## 取数步骤（Opptrix 工具）

| 步骤 | 工具 |
|------|------|
| 持仓/关注 | `get_portfolio_holdings` / `portfolio_summary` / `analyze_portfolio` / `get_watchlist`；无持仓则 `ask_user` 要权重 JSON |
| 批量行情财务 | `batch_instrument_snapshots` / `get_instrument_quotes` / `get_instrument_financials` / `get_instrument_financial_indicators` / `get_instrument_dividend` |
| 事件补洞 | `list_news_articles` |
| 严谨验算 | `activate_agent_skill` → `financial-data`，再 `opptrix_run` 其 `scripts/run_rigor_json.py`（`verify-valuation` / `three-scenario`） |
| 写盘 | `workspace_write`（持仓规范化表、情景输入 JSON） |

**脚本不联网**；禁止移植雪球爬虫。无持仓文件时必须用户提供权重，不得臆造仓位。

## 执行流程

### 1. 解析持仓

标准化为：标的 | 代码 | 持仓量/权重 | 成本（可选）| 现价 | 市值 | 占比 | 盈亏（可选）。写入 workspace。

### 2. 刷新数据与 A/B/C

对每只持仓并行取行情与关键财务；标注信息丰富度。估值敏感路径走 `financial-data` 验算。

### 3. 单仓位体检

对每只回答：

- 如果今天没有持仓，还会在当前价格买入吗？  
- 如果明天不能交易，持有 5 年舒服吗？  
- 买入论文还完整吗？

输出：标的 | 估值要点 | 买入逻辑是否变化 | 论文健康度（可定性）| 仓位建议（合理/偏高/偏低）。

### 4. 组合层面

1. **集中度**：第一大/前三大占比、持仓数、现金占比（对照价值投资常见区间作研究参考，非硬性合规）。  
2. **相关性**：主题/行业/国家/货币共振表；检查是否 >50% 暴露同一主题或同一国家。  
3. **机会成本**：按「预期年化×确定性」排序；预期回报可用 FCF Yield + 增速示意，须标假设；垫底仓是否「不如现金」。  
4. **压力测试**：衰退 / 地缘 / 利率 / 估值压缩等情景的定性+粗估影响。

### 5. 调仓建议与交付

| 动作 | 标的 | 当前占比 | 建议占比 | 理由 |
|------|------|----------|----------|------|

结论必须明确：

1. 组合整体健康度（强制结论枚举）  
2. 最应该做的一件事  
3. 当前最大风险  

`list_web_vendor` → `create_web`。可把规范化持仓写入 workspace（如 `portfolio-value-latest.md`）供下次审视。

## 网页报告建议目录

1. 数据截止日、信息丰富度、署名  
2. 组合概览（持仓表）  
3. 单仓位体检  
4. 集中度 / 相关性 / 机会成本 / 压力测试  
5. 调仓建议表 + 强制结论  
6. 事实 | 假设 | 推断  
7. 免责声明（学习与投研辅助，非投资建议）

## `data_mode`

| 条件 | `data_mode` |
|------|-------------|
| 持仓权重齐全且多数标的有报价+关键财务 | `full` |
| 仅有比例无金额、或财务多为单源汇总 | `proxy`（`degraded=true`） |
| 无持仓且用户拒绝提供权重 | `insufficient`，停止调仓建议 |

## 禁止

- 覆盖或冒充 `@skill:portfolio-review`  
- 无镜子测试却建议「通过/加仓」  
- 用训练记忆填现价/仓位；无交付就结束  
- 用户可见文案堆工具/脚本路径
