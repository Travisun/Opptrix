---
name: value-thesis-tracker
description: 价值投资论文追踪。用户说「投资论文」「买入论文」「红线检查」「论文健康度」「季度检查论文」「/value-thesis-tracker」时使用。建立或追踪核心假设/红线/估值锚点；红线触发即给行动建议。勿与论点看板 thesis-tracker 混淆。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 价值论文追踪
  summary: 核心假设与红线纪律，季度检查论文健康度
  category: decision
  slash-rank: "166"
  default-deliverable: web
  required-packs: fundamentals market news artifacts workspace
allowed-tools: search_instruments get_instrument_quotes get_instrument_snapshot get_instrument_financials get_instrument_financial_indicators get_instrument_dividend list_news_articles get_news_article get_instrument_notices get_notice_content workspace_read workspace_write read_document search_library ask_user activate_agent_skill get_agent_skill opptrix_run create_web update_web read_web list_web_vendor
---

# 价值投资论文追踪

> 署名：**Opptrix · AI Berkshire 投研流程**  
> 源映射：AI Berkshire `thesis-tracker` → 本技能 **`value-thesis-tracker`**（**禁止**覆盖 `@skill:thesis-tracker`）

## 何时使用 / 非目标 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 买入前写清卖出条件；季度检查核心假设与红线 | 多标的**论点看板**（workspace SSOT 状态表）→ `@skill:thesis-tracker` |
| 单票巴菲特式论文健康度与行动建议 | 新旧报告**漂移对比** → `@skill:thesis-drift` |
| 从既有 research/team 报告抽取建档 | 单次短修订条目 → `@skill:thesis-update` |

**硬性边界**：`thesis-tracker` 是多标的论点生命周期看板；本技能是**单票价值投资论文**（5 句核心论文 + 假设 + 红线 + 估值锚点）的建立与追踪。

## 研究质量硬性规则（摘要）

1. 四大师视角在「管理层/护城河/估值/能力圈」处显式触及或声明不足。  
2. **强制结论**：论文完整 / 边际弱化 / 受损 / 破裂；动作：加仓 / 持有 / 减仓 / 清仓 / 灰色地带。  
3. **镜子测试**：建立模式必须 5 句话写清；写不全 → 不得进入「可买入」叙事。  
4. A/B/C 标注；红线触发优先于「估值便宜」。  
5. `get_current_time`；事实|观点；估值用 `@skill:financial-data` 验算；免责声明。

## 取数

| 用途 | 工具 |
|------|------|
| 读既有报告/论文 | `workspace_read` / `read_document` / `search_library` |
| 刷新锚点 | `get_instrument_quotes` / `get_instrument_financial_indicators` / `get_instrument_financials` |
| 事件 | `list_news_articles` / `get_instrument_notices` / `get_notice_content` |
| 验算 | `activate_agent_skill` → `financial-data` → `opptrix_run` |
| 持久化 | `workspace_write`（建议路径：`thesis/{symbol}-value-thesis.md`） |

## 模式 A：建立论文

1. 确认标的；优先从既有 `investment-research` / `investment-team` 产物抽取。  
2. **核心论文（≤200 字，5 句）**：生意本质、护城河、管理层、安全边际、下行保护。  
3. **核心假设清单**（3–7 条）：假设 | 验证方式 | 频率 | 状态。  
4. **红线清单**：条件 | 严重度 | 触发后动作（致命=立即清仓研究建议等）。  
5. **估值锚点**：买入时 / 乐观 / 中性 / 悲观（股价、倍数、内在价值示意、安全边际）。  
6. `workspace_write` 建档 → `create_web`。

## 模式 B：追踪检查

1. 读既有论文；无基线则转模式 A 或引导用户先建档。  
2. 刷新行情/财务/公告。  
3. 逐条更新假设状态：成立 / 边际弱化 / 受损 / 破裂。  
4. 红线检查；任一触发 → 醒目标注 + 行动建议。  
5. 估值锚点更新表。  
6. **健康度**（研究用）：`10 - 破裂×3 - 受损×2 - 弱化×1 - 红线触发×5`，夹在 1–10。  
7. 追加追踪记录；`create_web`。

| 健康度 | 含义 | 建议动作（研究向） |
|--------|------|-------------------|
| 9–10 | 假设更强 | 考虑加仓研究 |
| 7–8 | 核心成立 | 继续持有研究 |
| 5–6 | 部分受损 | 提高警惕 |
| 3–4 | 基础动摇 | 考虑减仓研究 |
| 1–2 | 红线或破裂 | 强烈建议卖出研究 |

## 网页目录

1. 数据截止、A/B/C、署名  
2. 核心论文五句  
3. 假设表 / 红线表 / 估值锚点  
4. 健康度与强制结论  
5. 下次检查重点  
6. 事实 | 假设 | 推断 + 免责声明

## `data_mode`

- 有结构化论文 + 本期关键财务/公告 → `full`  
- 仅有叙述性旧报告、假设靠抽取 → `proxy`  
- 无标的无材料 → `insufficient`

## 禁止

- 覆盖 `@skill:thesis-tracker`  
- 股价下跌直接等同论文破裂  
- 红线触发后用「再等等」淡化  
- 无交付结束；用户文案堆技术词
