# AI Berkshire Skill 契约（定稿）

> 适用于由 AI Berkshire 映射而来的 Opptrix Agent Skills（见 [`ai-berkshire-skill-map.md`](./ai-berkshire-skill-map.md)）。  
> 精神对齐 [`quants-skill-script-contract.md`](./quants-skill-script-contract.md)，但对象是**投研工作流 skill**（研究编排 + 可选严谨计算脚本），不是截面因子/择时信号流水线。

## 1. 包体结构

每个 skill 目录（建议 `packages/agent-skills/builtin/<skill-name>/`）：

```
<skill-name>/
├── SKILL.md              # 必选：何时用、步骤、取数、质量规则、交付
├── scripts/              # 可选：仅本地计算（financial_rigor / report_audit / 规则打分等）
├── references/           # 可选：拆出的长规范、清单、样例片段（计入附件上限）
└── assets/               # 可选：小体积静态资源
```

硬性：

1. **禁止**依赖原仓库路径 `~/ai-berkshire`、`/Users/.../ai-berkshire`、或假定本机已 clone 源仓。  
2. **禁止**在 SKILL 中写死 `python3 ~/ai-berkshire/tools/...`。  
3. 需要原 `tools/financial_rigor.py` / `report_audit.py` 能力时：**复制/移植**到本 skill 的 `scripts/`（允许有限重复；禁止新建仓库级共享 `packages/ai-berkshire-*` 公共包给全部 AB skill import）。  
4. 超大源文（如未上市研究长规范、系列文模板）必须拆进 `references/`，保持单文件 ≤200KB。

## 2. 端到端数据流

```
Agent 用 Opptrix 工具取数（行情 / 财务 / 公告 / 资讯 / 文档）
  → workspace_write 写入证据 JSON / Markdown 底稿
  →（可选）opptrix_run 执行本 skill 的 scripts/*.py（严谨验算 / 抽检 / 规则打分）
  → 阅读脚本 stdout / --output JSON，并入研判
  → create_web 交付可预览报告（默认）
```

要点：

1. **脚本不联网**：禁止在 `scripts/` 内调用 FinMind / 腾讯 / 东方财富 / Morningstar / 雪球 / Yahoo / 任意 HTTP 行情 API；禁止 `curl`/`urllib`/`requests`/`playwright` 拉数。  
2. **Agent 负责取数与写盘**：用现有工具（见映射表「Opptrix 替换取数」）拿到数据后 `workspace_write`。  
3. **脚本只做计算与抽检**：读 `--input` / 报告路径，写 `--output` 或 stdout。  
4. **第二信源**：仍由 Agent 用另一工具或 `http_fetch`/`browser_*` 取得后写入 workspace，再交给 `financial_rigor cross-validate`；不是脚本自己去爬。

## 3. CLI 约定（有 scripts 时）

```bash
python scripts/financial_rigor.py verify-market-cap --price ... --shares ... --reported ... --currency ...
python scripts/report_audit.py extract --report path/to/draft.md --output audit_sample.json
python scripts/report_audit.py verdict --results results.json --report draft.md
python scripts/quality_screen.py --input data.json --output result.json
```

| 约定 | 要求 |
|------|------|
| 入口 | 相对 skill 目录的 `scripts/`；经 `opptrix_run` 执行 |
| 数值 | 财务关键路径使用 `decimal.Decimal`，禁止用 float 做决策敏感算术 |
| 退出码 | `0` 成功；非 `0` 失败（stderr 简短错误；勿打印密钥） |
| 主结果 | 可解析 JSON（stdout 与/或 `--output`） |

通用计算类输出建议形状：

```json
{
  "ok": true,
  "skill": "investment-research",
  "meta": {
    "data_mode": "full",
    "degraded": false,
    "used_inputs": ["panels.financials", "panels.quotes"],
    "missing_for_full": []
  },
  "checks": [],
  "metrics": {},
  "assumptions": [],
  "errors": []
}
```

## 4. 数据自适应 / `data_mode`（硬性）

投研脚本与 SKILL 流程必须按**实际可用证据**选择路径，**禁止**无条件写死降级或假装完整研究。

| `meta.data_mode` | 含义 | `meta.degraded` |
|------------------|------|-----------------|
| `full` | 已具备该步骤完整算法/结论所需字段与双源校验（若技能要求） | **必须** `false` |
| `proxy` | 缺完整字段，走了代理/第三方汇总/单源，但结果仍有信息量 | **必须** `true` |
| `insufficient` | 连诚实代理也无法支撑结论 | 配合 `ok: false` 或报告结论「数据不足 / 灰色地带」；**禁止**拼凑完整报告 |

约定：`degraded` **必须等于** `data_mode == "proxy"`。

规则：

1. **有完整数据 → full**：探测 workspace 中的一手财报原文标记、双源字段、必要历史序列等。  
2. **仅缺完整字段才 proxy**：写清 `used_inputs` 与 `missing_for_full`；`assumptions` 说明代理含义（例如「非原始财报，来自汇总字段」）。  
3. **完全无法计算/无法决策 → insufficient**：明示缺口与下一步（补一手材料、缩小问题、停止买入建议）；**不要**用训练记忆填确定性。  
4. 信息丰富度 **A/B/C**（见 §6）与 `data_mode` 相关但不等同：C 级公司仍可能对「商业本质三问」给出 `full` 质检下的有限结论，但必须降低「投资确定性」表述。

## 5. 依赖策略

| 层级 | 规则 |
|------|------|
| **默认** | 仅 Python 标准库 |
| **禁止** | 源仓取数 SDK/脚本联网；雪球 Playwright 凭据流；把 API Key 写入 skill 或报告 |
| **可选** | 无；投研算术以 stdlib `decimal` 为准 |
| **Agent 侧** | `numpy`/`pandas` **不是**本契约默认；若某 skill 例外引入，须在 SKILL.md 标明并提供无该依赖路径 |

## 6. 研究质量硬性规则（写入每个投研类 SKILL.md）

以下理念来自 AI Berkshire README / AGENTS / CLAUDE，实现时**必须**进入 SKILL「研究质量」段落（编排 skill `ai-berkshire` 亦须重申）：

### 6.1 四大师框架

涉及个股/行业深度结论时，须显式覆盖（或诚实声明某师视角因数据不足无法评分）：

| 视角 | 关注点 |
|------|--------|
| 段永平 | 商业模式、本分、可理解性 |
| 巴菲特 | 财务质量、自由现金流、安全边际与估值 |
| 芒格 | 逆向、竞争格局、失败路径 |
| 李录 | 长期确定性、管理层与风险、能力圈 |

团队类 skill（`investment-team`、`earnings-team`、`private-company-research`）应并行独立成稿再综合，避免「一个 prompt 切四段」冒充对抗。

### 6.2 强制结论（不打太极）

禁止以「一方面…另一方面…请自行判断」收尾而不给决策态。须给出可执行的结论形态之一：

- **通过 / 有条件通过 / 不通过 / 灰色地带（数据不足）**  
- 分层建议（如激进 / 稳健 / 保守）与**价格或条件区间**（无价格依据则写清触发条件，而非假精确）

并区分：**好生意** ≠ **好价格下的好投资**。

### 6.3 镜子测试

买入或「通过」类结论前，须用 ≤5 句说清：买的是什么生意、为何现在、什么会证伪。说不清 → **不买 / 不通过**，没有例外。

### 6.4 信息丰富度 A / B / C

报告开头必须标注：

| 级别 | 含义 | 研究策略 |
|------|------|----------|
| A | 信息充裕 | 重点反共识、找被忽视风险；防「正确的废话」 |
| B | 部分一手 | 标注推算置信度；关键结论双源 |
| C | 信息稀缺 | 第一性原理：少而硬的核心问题；禁止拼凑「看起来完整」 |

必须声明：**资料多 ≠ 确定性高**；**AI 分析置信度 ≠ 投资确定性**。

### 6.5 快速否决 / 安全门

触发诚信污点、能力圈外且说不清赚钱方式、或 skill 内定义的红线时：**一票否决**，估值再便宜也不用分数对冲。收益型 skill 的安全门同理覆盖打分卡。

### 6.6 其他强制纪律

1. 研究开始前用 `get_current_time`（或会话时钟）确认「今天」；报告头写明**数据截止日期**。  
2. 严格区分事实与观点；禁止「我认为/显然」；不确定就写不确定。  
3. 关键财务数字：决策敏感路径走 `scripts/financial_rigor.py`；需要发布级抽检走 `report_audit` 流程。  
4. 货币与单位（港币/人民币/美元/新台币、亿/万亿）必须写清；市值须股价×股本验算。  
5. 联网/取数失败：**禁止**用训练知识冒充已联网结果；须醒目标注并降级 `data_mode`。  
6. 客观呈现正反面；核心判断附反面论据。  
7. 本产品定位为学习与投研辅助，**不是**投资建议；交付页须有简短免责声明（产品文案，非堆技术词）。

## 7. 附件限制

与 Agent Skills 附件约束对齐：

- 单文件 ≤ **200KB**  
- 单 skill 附件总数 ≤ **16** 文件（含 `scripts/`、`references/`、`assets/` 等）

超限：拆 skill、删冗余样例、长文改 `references/` 多文件，或外链说明（勿把整份源仓报告/notebook 塞进 skill）。

## 8. 默认交付与署名

1. **默认 `create_web`** 交付可预览 HTML 报告（用户明确只要画布再用 `create_canvas`；关系结构可用 `create_mindmap`）。  
2. 报告署名使用产品文案，例如：**「Opptrix · AI Berkshire 投研流程」**（编排入口可用同一署名或「Opptrix · AI Berkshire 综合编排」）。  
3. **禁止**在用户可见文案中堆砌：MCP、Provider、SQLite、Hub、脚本路径、`opptrix_run`、HTTP 状态码等实现细节（内部 SKILL 步骤可写工具名供 Agent 执行）。  
4. 勿在标题默认追加「四大师综合」「投资备忘录」等冗余后缀，除非用户点名（与 `investment-memo-craft` 版式约定一致）。

## 9. SKILL.md 应写明的运行段落（模板要点）

1. 何时使用 / 非目标 / 与易混 builtin 的边界（尤其 `value-*` 改名项）  
2. 研究质量硬性规则（§6 摘要或引用本契约）  
3. 取数步骤（Opptrix **工具名**列表）  
4. `workspace_write` 证据与底稿约定  
5. 可选 `opptrix_run`：`python scripts/….py …`  
6. `data_mode` / A·B·C / 失败与留白  
7. 默认 `create_web` + 署名 + 免责声明  
8. 并行时：`run_subagent` / `reclaim_subagent` 纪律（若适用）

## 10. 命名冲突（实现时硬性）

| 源名 | Opptrix 名 | 不得覆盖 |
|------|------------|----------|
| `thesis-tracker` | `value-thesis-tracker` | 现有 `thesis-tracker`（论点看板） |
| `portfolio-review` | `value-portfolio-review` | 现有 `portfolio-review`（持仓/关注事实复盘） |

其余保留原名；边界见映射表「边界备注」。

## 11. 反模式

- ❌ 依赖 `~/ai-berkshire` 或源仓绝对路径  
- ❌ 脚本内联网取数 / 移植雪球爬虫凭据流  
- ❌ 无条件 `meta.degraded=true` 或写死 `data_mode: "proxy"`  
- ❌ 用训练知识冒充已刷新行情/财报  
- ❌ 两面讨好、无镜子测试、跳过快速否决却给「通过」  
- ❌ C 级信息稀缺却输出假完整尽调  
- ❌ 覆盖现有 `thesis-tracker` / `portfolio-review` 目录名  
- ❌ 用户可见文案堆技术实现词  
- ❌ 把整份超大源 md 塞进 skill 导致超过 200KB/16 文件  
- ❌ 编排 skill 无差别串行跑完全部重研究 skill（成本爆炸、无场景路由）

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-08-16 | 定稿：工作流包体、数据流、`data_mode`、研究质量硬性规则、附件与署名；对齐 quants 契约精神并适配投研 skill |
