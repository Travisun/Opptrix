---
name: ai-berkshire
description: AI Berkshire 分析。用户说「AI Berkshire」「AI Berkshire 分析」「价值投资流程」「四大师投研」「按场景路由投研」「/ai-berkshire」时使用。按场景路由基础 skill，强制质量规则，端到端澄清→取数→子 skill→审计建议→create_web。非投资研讨团。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: AI Berkshire 分析
  summary: 场景路由价值投资技能，交付带强制结论的投研网页
  category: decision
  slash-rank: "38"
  default-deliverable: web
  required-packs: fundamentals market news portfolio artifacts workspace
allowed-tools: ask_user get_current_time search_instruments activate_agent_skill get_agent_skill list_agent_skills run_subagent list_subagents reclaim_subagent cancel_subagent update_research_checklist opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/route_plan.py
  - scripts/fixtures/sample_route_deep.json
  - scripts/fixtures/sample_route_news.json
  - references/route-table.md
---

# AI Berkshire 分析

> 署名：**Opptrix · AI Berkshire 分析**  
> 本技能是价值投资工作流**总入口**：路由并激活基础 skill，**禁止**无差别串行跑完全部重研究 skill（成本爆炸）。

## 何时使用 / 非目标 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 用户要「按 AI Berkshire / 四大师流程」做投研，但场景未钉死单一 skill | 用户明确只要**多空辩论研讨团** → `@skill:multi-role-research-council` |
| 需要场景路由 + 统一质量门禁与 web 交付结构 | 用户已点名单一基础 skill（如只要财报精读）→ 直接激活对应 skill |
| | 量化因子/LEAN 回测 → quants / lean-* 技能 |

### 与 `multi-role-research-council`（硬性）

| | 本技能 | 投资研讨团 |
|--|--------|------------|
| 框架 | 段永平/巴菲特/芒格/李录价值投资 | 多空辩论 + 风险互评 |
| 角色 | 流程入口 + 基础 AB skill | 分析师→Bull/Bear→主席→风险三人 |
| 署名 | Opptrix · AI Berkshire 分析 | Opptrix投资研讨团流程 |
| 禁止合并 | 勿把研讨团报告写成四大师流程，反之亦然 | |

## 强制质量规则摘要（契约 §6，执行时必须重申）

1. **四大师**：深度结论须显式覆盖四视角，或声明因数据不足无法评分。团队类须 `run_subagent` 独立成稿再综合，禁止「一个 prompt 切四段」冒充对抗。  
2. **强制结论**：通过 / 有条件通过 / 不通过 / 灰色地带（或场景等价枚举）；禁止两面讨好收尾。区分好生意 ≠ 好价格下的好投资。  
3. **镜子测试**：买入或「通过」前 ≤5 句说清生意、为何现在、证伪条件。  
4. **A/B/C**：报告头标注；资料多 ≠ 确定性高；AI 置信度 ≠ 投资确定性。  
5. **快速否决**：诚信/能力圈红线一票否决。  
6. **纪律**：`get_current_time` → 数据截止日；事实|观点；关键数字经 `financial-data` 严谨脚本；取数失败禁止训练知识冒充；交付免责声明。

## 场景路由表（摘要）

完整表见 `references/route-table.md`。路由脚本：

```bash
python scripts/route_plan.py --input route.json --output plan.json
```

输入示例：

```json
{ "intent": "deep_research", "symbol": "600519", "urgency": "normal" }
```

| intent 示例 | 推荐技能顺序（核心） | team 并行 |
|-------------|----------------------|-----------|
| `quick_screen` | financial-data → investment-checklist → quality-screen | 否 |
| `deep_research` | financial-data → investment-research → investment-memo-craft | 否 |
| `team_research` | financial-data → investment-team → investment-memo-craft | **是** |
| `earnings` / `earnings_team` | financial-data → earnings-review 或 earnings-team | team 仅后者 |
| `industry_funnel` | financial-data → industry-funnel → investment-checklist | 否 |
| `portfolio` | financial-data → **value-portfolio-review** | 否 |
| `thesis` / `thesis_drift` | financial-data → value-thesis-tracker / thesis-drift | 否 |
| `news_pulse` | financial-data → news-pulse | **是** |
| 其他 | 见 route-table（management / private / series / income / bottleneck / wechat / memo_craft / dyp） | 视场景 |

`urgency=high` 时脚本会把场景的 `urgency_boost` 技能提前。

**命名冲突**：持仓论文用 `value-thesis-tracker`，组合价值审视用 `value-portfolio-review`；**勿**激活或覆盖现有 `thesis-tracker` / `portfolio-review`。

## 端到端主路径（硬性完备）

```
1. 澄清  → ask_user / search_instruments（标的、场景 intent、紧急度、持仓/窗口等）
2. 路由  → workspace_write route.json → opptrix_run scripts/route_plan.py
3. 规范取数 → activate_agent_skill financial-data（双源与验算规范；按需跑 rigor）
4. 激活子 skill → 按 recommended_skills 顺序 activate_agent_skill / get_agent_skill
5. Team 类 → 在子 skill 指引下 run_subagent 并行，完成后 reclaim_subagent
6. 版式（可选）→ investment-memo-craft 若在计划中
7. 审计建议 → financial-data 的 report_audit（extract → 填值 → verdict）；打回则修补后再交付
8. 交付 → list_web_vendor → create_web
```

可用 `update_research_checklist` 跟踪步骤。若某基础 skill 尚未安装/激活失败：诚实降级，缩小范围或引导用户改场景，**禁止**用记忆拼「完整尽调」。

## 最终 web 产物结构（与原项目同级，硬性）

报告**必须**包含：

1. **页眉**：标的、场景、**数据截止日期**、信息丰富度 A/B/C、署名「Opptrix · AI Berkshire 分析」  
2. **强制结论表**：决策态 +（如适用）价格/条件带或触发条件；空仓者 vs 持有者分行（若深度研究）  
3. **四视角摘要**表（段永平 / 巴菲特 / 芒格 / 李录）— 不足则格子内写「数据不足，无法评分」  
4. 场景主体（子 skill 产出的核心章节，可摘要嵌入）  
5. 事实 | 假设 | 推断  
6. 数据缺口 / `data_mode` 说明  
7. **免责声明**：学习与投研辅助，**不是**投资建议  

禁止无上述结构就结束；禁止用户可见文案堆 MCP/脚本路径等实现词。

## `data_mode`

- 路由成功且子 skill 主路径证据充足 → 本技能可标 `full`  
- 缺标的但仍可跑部分场景（如 dyp/wechat）→ `proxy`  
- intent 无法识别 → `insufficient`，列出可选 intent，停止假装研究

## 禁止

- 一次激活并串行跑完映射表全部 21 个重 skill  
- 与投资研讨团流程混署名或混框架  
- 覆盖 `portfolio-review` / `thesis-tracker` 目录  
- 脚本联网；无 create_web 交付（除非用户只要口头路由计划）
