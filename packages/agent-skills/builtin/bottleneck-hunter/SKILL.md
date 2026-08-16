---
name: bottleneck-hunter
description: 供应链瓶颈猎手。用户说「瓶颈猎手」「供应链咽喉」「第二层瓶颈」「谁会先不够用」「/bottleneck-hunter」时使用。从超级趋势拆物理供应链，找 Layer2/3 瓶颈与可交易标的；瓶颈真实≠买点，须估值透支检验。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 供应链瓶颈猎手
  summary: 物理拆链找咽喉，估值门槛过滤伪机会
  category: industry
  slash-rank: "113"
  default-deliverable: web
  required-packs: fundamentals market research artifacts workspace
allowed-tools: search_instruments get_instrument_quotes get_instrument_financials get_instrument_financial_indicators get_instrument_snapshot batch_instrument_snapshots list_news_articles get_news_article http_fetch browser_navigate get_current_time ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor run_subagent list_subagents reclaim_subagent
references:
  - scripts/financial_rigor.py
---

# 供应链瓶颈猎手

不问「推荐什么股票」，问：**若趋势继续扩张，哪一环会先不够用？** Alpha 常在第二、三层（材料/设备/测试），而非已被定价的 Layer1 龙头。

## 何时使用 / 非目标

| 使用 | 不要用 |
|------|--------|
| 超级趋势下的物理瓶颈与标的地图 | 一般产业链科普 → `@skill:industry-research` |
| 估值透支检验后的观察/深研清单 | 主题政策映射 → `@skill:theme-policy-map` |
| | 台股月营收若工具不足 → 诚实 `insufficient`/`proxy` 或请用户导入 JSON，**禁止**假装 FinMind 全量 |

## 研究质量（硬性）

- 瓶颈真实 ≠ 投资机会；估值红灯可封顶信号强度  
- 强制结论：深入研究 / 观察 / 等待更好价格 / 数据不足  
- 正反论据；A/B/C；`get_current_time`  
- 署名 **Opptrix · AI Berkshire 分析**

## 流程摘要

1. **超级趋势确认**：持续性/物理性/规模性/加速性；≥3 个已发生验证事件  
2. **物理拆解**：Layer0–4；重点扫 Layer2–3  
3. **瓶颈 6 标准**：供给集中、扩产周期、替代、利用率、需求增速、客户验证 → S/A/B 级  
4. **标的初筛**：上市、瓶颈业务占比、优先中小市值、流动性  
5. **估值检查（不可跳过）**：市值 vs TAM、PS/PE/增速、乐观收入倍数、增发后暴涨等红黄绿灯；`financial_rigor` 验算市值/情景  
6. **反向验证**：为何瓶颈可能被解除；聪明人为什么不买  
7. `create_web` 交付瓶颈地图 + 明确标的（或仅信号扫描）

## Opptrix 取数

趋势与短缺证据：`list_news_articles` / `http_fetch` / `browser_navigate`  
标的：`search_instruments` + `get_instrument_quotes` / `get_instrument_financials` / `batch_instrument_snapshots`  

```bash
python scripts/financial_rigor.py verify-market-cap ...
python scripts/financial_rigor.py three-scenario ...
```

## data_mode

关键瓶颈有多源事件+财务可评估值 → `full`；供应链一手弱、估值为近似 → `proxy`；趋势本身无法确认 → `insufficient`。

## 网页目录建议

1. 趋势确认与数据截止  
2. 供应链分层与瓶颈地图  
3. 明确标的（估值检查必填）  
4. 其他信号与观察名单变化  
5. 偏见自查与免责声明  

## 禁止

- 跳过估值门槛用叙事买亏损高 PS  
- 移植雪球/FinMind 爬虫凭据；脚本联网  
- 依赖原仓库绝对路径  
