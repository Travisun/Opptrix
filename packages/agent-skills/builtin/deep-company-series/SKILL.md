---
name: deep-company-series
description: 《看懂XX》长文系列。用户说「看懂系列」「深度长文系列」「教科书级公司拆解」「多篇公众号」「/deep-company-series」时使用。3–8 篇按复杂度适配；事实核查优先于文采。默认 create_web；署名 Opptrix · AI Berkshire 投研流程。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 《看懂XX》长文系列
  summary: 3–8 篇系列长文，严苛事实核查与跨篇一致性
  category: deep-research
  slash-rank: "55"
  default-deliverable: web
  required-packs: fundamentals market news workspace artifacts
allowed-tools: search_instruments ask_user get_current_time get_instrument_snapshot get_instrument_quotes get_instrument_profile get_instrument_financials get_instrument_income_statement get_instrument_balance_sheet get_instrument_cash_flow get_instrument_financial_indicators get_instrument_dividend get_instrument_shareholders list_news_articles get_news_article get_instrument_notices get_notice_content http_fetch browser_navigate workspace_write workspace_read opptrix_run create_web update_web read_web list_web_vendor
references:
  - references/series-template.md
  - references/fact-check-checklist.md
  - scripts/financial_rigor.py
  - scripts/report_audit.py
  - scripts/run_rigor_json.py
  - scripts/scorecard.py
  - scripts/fixtures/sample_scorecard_full.json
  - scripts/fixtures/sample_verify_market_cap.json
---

# 《看懂 XX》长文系列

为指定公司撰写 **3–8 篇**可独立分享的系列长文。核心能力是**改得严**，不是堆文采。署名：**Opptrix · AI Berkshire 投研流程**。

## 何时使用 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 教科书级多篇系列，认知重置→决策闭环 | 单篇公众号三 Agent → `@skill:wechat-article`（勿合并） |
| 愿花多轮修订与跨篇一致性扫描 | 单篇研报 → `@skill:investment-research` |
| | 季报点评 → `@skill:earnings-review` / `@skill:earnings-team` |
| | 行业全景 → `@skill:industry-research` |

## 研究质量（硬性）

- 事实核查 > 文采；禁用「显然/必然/我认为」等（见 `fact-check-checklist.md`）。  
- **禁止**概率加权期望年化；情景只列触发条件与方向。  
- 跨篇数字一致；防双算（并表 vs 投资组合）。  
- 终篇须镜子测试与红线清单；决策档位明确。  
- `get_current_time`；A/B/C；关键数字 rigor + 抽检。

## 篇数适配

| 复杂度 | 篇数 | 特征 |
|--------|------|------|
| 高 | 7–8 | 多业务 + 隐藏资产 + 丰富管理层史料 |
| 中 | 4–6 | 2–3 业务线 + 时代变量 |
| 低 | **3** | 主业清晰（开篇护城河 / 最大变量 / 估值决策） |

8 主轴模板与篇内骨架：`references/series-template.md`。无独立内容的篇合并，禁止凑字数。

## 取数

同投资研究工具栈。可先跑 `@skill:investment-research` 或 `@skill:investment-team` 作内部底稿，再改写成系列。用户确认篇目与核心论点后再写。

```bash
python scripts/run_rigor_json.py --input data.json --output result.json
python scripts/report_audit.py extract --report chapter.md
python scripts/scorecard.py --input evidence.json --output scorecard.json
```

## 步骤

### 阶段 1 — 调研

近 5 年年报/最新季报；独立观点多源；与用户确认篇数与主轴。

### 阶段 2 — 写作（01→末篇顺序）

每篇：`workspace_write` 存稿。篇头引用块 + 钩子开篇 + 要点回顾 + 下期预告 + 免责斜体。旧系列目录冲突时用带日期后缀新目录，不覆盖。

### 阶段 3 — 跨篇一致性

扫描：市值/净利/持股跨篇一致；术语首次解释；交叉引用有效；要点回顾数字与正文一致。可选用子 Agent 扫描后 **reclaim**。

### 阶段 4 — 交付

优先 **`create_web`**（索引页 + 分章，或用户指定篇）。注意单 skill 产物体积；超大则多页/多轮更新。署名与免责声明。隐私：勿写入本机路径/个人身份信息。

## 修订流程

硬错误必改 → 主观化弱化 → 颗粒度按可读性 → 不可靠第三方宁可删。改一处联动全系列引用。

## 禁止

- 替读者做买卖指令式荐股；预测点位假装事实  
- 概率加权期望；「大佬也持有」背书  
- 强求 8 篇凑数；脚本联网；与 wechat-article 混用  
