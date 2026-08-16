---
name: private-company-research
description: 未上市公司深度研究。用户说「未上市研究」「私募公司尽调」「独角兽研究」「蚂蚁/小红书式研究」「/private-company-research」时使用。信息稀缺下还原生意真实价值；多角色并行；诚实留白；禁止虚假精确。默认 create_web；署名 Opptrix · AI Berkshire 投研流程。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 未上市公司深度研究
  summary: 信息稀缺下多角色拼图，诚实留白并评估真实价值
  category: deep-research
  slash-rank: "56"
  default-deliverable: web
  required-packs: fundamentals market news workspace artifacts
allowed-tools: search_instruments ask_user get_current_time run_subagent list_subagents get_subagent reclaim_subagent cancel_subagent update_research_checklist http_fetch browser_navigate list_news_articles get_news_article search_library get_instrument_quotes get_instrument_financials get_instrument_profile get_instrument_snapshot batch_instrument_snapshots workspace_write workspace_read opptrix_run create_web update_web read_web list_web_vendor
references:
  - references/bias-and-principles.md
  - references/role-business.md
  - references/role-financial.md
  - references/role-competitive.md
  - references/role-risk-governance.md
  - references/role-tech-and-signals.md
  - references/report-outline.md
  - scripts/financial_rigor.py
  - scripts/report_audit.py
  - scripts/run_rigor_json.py
  - scripts/scorecard.py
  - scripts/fixtures/sample_scorecard_full.json
  - scripts/fixtures/sample_scorecard_insufficient.json
---

# 未上市公司深度研究

面向蚂蚁、小红书、SpaceX、Stripe 等**未上市**标的。最终目标：在信息天然稀缺下，尽可能还原**生意真实价值**（不是融资叙事估值）。署名：**Opptrix · AI Berkshire 投研流程**。

详细任务说明书见 `references/`（经 `get_agent_skill_file` 读取）。偏见原则见 `bias-and-principles.md`。

## 何时使用 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 无标准财报的公司/独角兽深度拼图 | 上市标的尽调 → `@skill:equity-deep-dive` / `@skill:investment-research`（勿混用） |
| 融资轮次 + 可比公司 + 情景估值 | 已上市四大师研究 → `@skill:investment-team` |
| 默认常 `proxy`/`insufficient`，诚实留白 | |

## 研究质量（硬性）

- 宁可留白「不知道」，禁止推测填满模板伪装确定性。  
- 关键数据标置信度 🟢/🟡/🔴；事实 vs 推理分栏。  
- 信息极度稀缺 → 第一性原理四问（见 bias 文档），不追求形式完整。  
- 强制结论：投资 / 观望 / 回避（或灰色地带），并写明置信度。  
- 镜子测试；快速否决（诚信/能力圈）。  
- `get_current_time`；禁止训练知识冒充已刷新公开线索。

## 团队角色（最多并行 4～6 路）

| 角色 | 职责 | 说明书 |
|------|------|--------|
| Team Lead（父） | 拼图、冲突仲裁、定稿 | 本文件 |
| business-decoder | 商业模式与用户 | `role-business.md` |
| financial-detective | 财务拼凑与估值 | `role-financial.md` |
| competitive-mapper | 行业与竞争 | `role-competitive.md` |
| risk-governance-analyst | 风险与治理 | `role-risk-governance.md` |
| tech-ip-analyst + signal-miner | 技术与替代数据（可合并一路） | `role-tech-and-signals.md` |

若配额紧张：先并行 business / financial / competitive / risk 四路；tech+signal 由 Lead 补扫或第二波并行后 reclaim。

## 取数（Opptrix）

| 用途 | 工具 |
|------|------|
| 公开线索 | `http_fetch` / `browser_navigate` / `list_news_articles` / `search_library` |
| 可比上市同业 | `search_instruments` + `get_instrument_*` / `batch_instrument_snapshots` |
| 用户导入融资 JSON | `workspace_write` / `ask_user` |

**禁止**脚本联网爬虫；无雪球凭据流。可比算术可用本地脚本：

```bash
python scripts/run_rigor_json.py --input data.json --output result.json
python scripts/scorecard.py --input evidence.json --output scorecard.json
```

`data_mode` 默认常为 `proxy`；完全无法支撑则 `insufficient` + 灰色地带。也可 `get_agent_skill_file` 取 `@skill:financial-data` 的 rigor 脚本对照。

## 并行编排

1. 展示团队框架；确认后启动。`update_research_checklist`。  
2. 父预检：至少一次 `http_fetch` 或新闻工具可达。  
3. **同一轮** `run_subagent` 并行（建议 ≤4，必要时两波）；子任务禁止再委派。  
4. 每路：`get_subagent` → **立即 `reclaim_subagent`**。  
5. **交叉验证**：数据冲突仲裁；增长叙事 vs 招聘等信号一致性；白/灰/黑区地图。  
6. 按 `report-outline.md` 汇总 → `scorecard` → **`create_web`**。  
7. 收尾 cancel/reclaim。

## 禁止

- 虚假精确估值；资料少却输出假完整尽调  
- 与上市 `equity-deep-dive` 混用  
- 脚本联网；跳过 reclaim；无强制结论档位  
- 无 web 交付结束（除非用户只要口头要点）  
