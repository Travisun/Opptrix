---
name: industry-funnel
description: 行业漏斗筛选：全市场→粗筛≤10→终选 3→四大师短评与仓位建议。用户说「行业漏斗」「精选三家」「从全市场筛到三只」「/industry-funnel」时使用。与 industry-research（产业链全景）互补；易混 quality-screen / universe-screen。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 行业漏斗筛选
  summary: 逐层过滤到 3 家终选，淘汰理由可追溯
  category: industry
  slash-rank: "111"
  default-deliverable: web
  required-packs: fundamentals market research artifacts workspace
allowed-tools: search_instruments get_sector_list get_sector_constituents get_index_constituents batch_instrument_snapshots get_instrument_financial_indicators get_instrument_financials get_instrument_quotes get_instrument_snapshot evaluate_instrument get_current_time list_news_articles ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor run_subagent list_subagents reclaim_subagent
references:
  - scripts/quality_gate.py
  - scripts/financial_rigor.py
  - scripts/fixtures/sample_gate.json
---

# 行业漏斗筛选

从行业/方向扫描 → 硬指标粗筛 ≤10 → 结构化短评 → **终选 3 家**四大师深度短文 + 仓位建议。每层淘汰必须留理由。

## 何时使用 / 非目标

| 使用 | 不要用 |
|------|--------|
| 「AI 算力里帮我筛到三只值得深挖的」 | 只要产业链地图 → `@skill:industry-research` |
| 需要可复盘的留/弃标准 | 只要 7 条去劣硬门槛 → `@skill:quality-screen` |
| | 量化因子宇宙 → `@skill:universe-screen` |

## 研究质量（硬性）

- 四大师框架覆盖终选 3 家（段/巴/芒/李）；数据不足须声明无法评分
- 强制结论：激进/稳健/保守分层 + 条件区间；**好生意 ≠ 好价格下的好投资**
- 镜子测试（买入建议前 ≤5 句）；A/B/C 信息丰富度；快速否决不可被分数对冲
- `get_current_time`；署名 **Opptrix · AI Berkshire 分析**；免责声明

## 漏斗结构

```
全市场扫描 30–60 → 5 硬指标 ≤10 → 精细分析 → 终选 3 → 建议
```

### 第一层：扫描池

A 成交活跃 ∪ B 涨幅榜 ∪ C 市值前部；覆盖 A/港/美及关键国际；未上市单列「未来 IPO 候选」。工具：`get_sector_constituents` / `get_index_constituents` / `search_instruments` / `batch_instrument_snapshots`。

### 第二层：5 硬指标

| # | 指标 | 通过 |
|---|------|------|
| 1 | PE | 合理；高成长可 PEG<1.5 |
| 2 | ROE | >15% 或改善（重资产可放宽） |
| 3 | 经营现金流/净利 | >70% |
| 4 | 资产负债率 | <60%（公用事业 <70%） |
| 5 | 护城河快评 | ★★★+ |

5 全过直接留；4 过+1 接近标黄；不足 4 条淘汰写理由。过多则抬高护城河再筛。

```bash
python scripts/quality_gate.py --input candidates.json --output gate.json
```

### 第三层：精细分析（每家 300–500 字）

商业模式一句 / 财务质量 / 护城河 / 前 3 风险 / 估值快评 / 是否进终选。

终选按**组合互补**而非纯打分：≥1 高确定性、≥1 成长弹性、可选 1 高弹性卫星。

### 第四层：四大师短评（每家 800–1200 字）

段永平生意本质 → 巴菲特财务与安全边际 → 芒格逆向失败路径 → 李录长期确定性与能力圈。估值用：

```bash
python scripts/financial_rigor.py verify-valuation ...
python scripts/financial_rigor.py three-scenario ...
```

（脚本**不联网**；Agent 先取数写入 workspace。）

## data_mode

完整财务+护城河可评 → `full`；缺字段粗筛 → `proxy`；宇宙都组不出 → `insufficient`（灰色地带，禁止拼凑终选）。

## 步骤

1. 确认行业/方向与市场范围  
2. 建扫描池并标注纯正度  
3. `workspace_write` → `quality_gate.py`  
4. 精细分析 → 终选 3 → 四大师短评 + 仓位  
5. `create_web` 交付  

## 网页目录建议

1. 漏斗总览与数据截止  
2. 扫描池与淘汰日志  
3. 粗筛表  
4. 精细分析  
5. 终选三大师短评与仓位  
6. 风险与免责声明  

## 禁止

- 黑箱淘汰；用故事股叙事跳过硬指标  
- 依赖源仓库绝对路径或脚本联网取数  
- 无交付网页（默认）
