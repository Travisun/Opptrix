---
name: thesis-drift
description: 投资论文漂移检测。用户说「论文漂移」「新旧论文对比」「thesis drift」「事实变化还是措辞」「/thesis-drift」时使用。只认证据变化；区分事实/估值/措辞；禁止文风漂移制造假变化。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 论文漂移检测
  summary: 新旧论文证据对比，判定 Improved/Unchanged/Weakened
  category: decision
  slash-rank: "167"
  default-deliverable: web
  required-packs: fundamentals market artifacts workspace
allowed-tools: workspace_read workspace_write read_document search_library get_instrument_quotes get_instrument_financial_indicators ask_user activate_agent_skill get_agent_skill opptrix_run create_web update_web read_web list_web_vendor
references:
  - scripts/thesis_drift_diff.py
  - scripts/fixtures/sample_thesis_pair.json
---

# 投资论文漂移检测

> 署名：**Opptrix · AI Berkshire 分析**

## 何时使用 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 对比两份论文/研究报告快照，判断是否**证据漂移** | 建立或季度检查单票论文 → `@skill:value-thesis-tracker` |
| 区分事实变化 vs 估值变化 vs 措辞变化 | 论点看板 → `@skill:thesis-tracker`；单次修订 → `@skill:thesis-update` |

依赖 `value-thesis-tracker` 结构（核心假设/红线/估值锚点）。缺结构时尽量抽取，抽不到标「无法判断」，**禁止编造**。

## 研究质量硬性规则（摘要）

强制结论须回答：未漂移 / 正向漂移 / 负向漂移 / 证据不足；拆开「事实 vs 价格」；建议动作如何迁移。证据优先于措辞；红线优先于低估值。A/B/C、数据截止日、免责声明同契约 §6。

## 取数与脚本

1. `workspace_read` / `read_document` 读取旧/新两份材料。  
2. Agent 抽取为结构化 JSON（见下方 schema）→ `workspace_write`。  
3. `opptrix_run`：

```bash
python scripts/thesis_drift_diff.py --input pair.json --output drift.json
```

4. 数值百分比/估值变化：`activate_agent_skill financial-data` → `run_rigor_json.py`（脚本本身不联网）。  
5. `create_web` 交付漂移报告。

### 输入 JSON 形状（`thesis_drift_diff.py`）

```json
{
  "symbol": "00700",
  "company": "腾讯",
  "old": {
    "date": "2025-12-01",
    "thesis_summary": "...",
    "action": "hold",
    "assumptions": [{"id": "1", "text": "...", "status": "ok"}],
    "redlines": [{"id": "1", "text": "...", "triggered": false}],
    "valuation": {"price": 400, "pe": 18, "margin_of_safety": 0.2},
    "management": "trustworthy",
    "moat": "stable"
  },
  "new": { }
}
```

假设 `status`：`ok` | `weakening` | `impaired` | `broken`。  
动作：`buy` | `hold` | `watch` | `reduce` | `exit` | `unknown`。

## 固定维度（不可临时增减）

| 维度 | Improved | Unchanged | Weakened |
|------|----------|-----------|----------|
| 估值锚点 | 安全边际扩大或内在价值上修且可验算 | 无实质变化 | 安全边际收窄/锚点失效 |
| 核心假设 | 更多假设被强化 | 状态一致 | 弱化/受损/破裂 |
| 红线 | 风险解除 | 未触发且水平不变 | 触发或概率上升 |
| 管理层质量 | 新行为提高信任 | 延续 | 损害信任 |
| 竞争护城河 | 变宽/被验证 | 无实质变化 | 削弱/突破 |

每个非 Unchanged 必须引用具体证据；找不到证据 → Unchanged 或无法判断。

## 模式

- **指定路径对比**：用户给两份路径 → 抽取 → 脚本 → 报告。  
- **自动快照**：在 workspace 找 `{symbol}-value-thesis*` 最早/最新；公司不一致则停止。  
- **缺失基线**：明确无法检测；引导先跑 `@skill:value-thesis-tracker` 建档。**禁止**用记忆补旧论文。

## 网页目录

1. 对比对象与时间跨度、数据截止  
2. 总体漂移结论（强制）  
3. 维度漂移表（脚本输出）  
4. 证据差异明细  
5. 估值验算摘要（如有）  
6. 建议动作迁移  
7. 不确定项 + 免责声明

## `data_mode`

- 两侧结构完整且关键字段可比 → `full`  
- 一侧靠正文抽取 → `proxy`  
- 缺基线或非同一公司 → `insufficient`

## 禁止

- 把同义改写判为漂移  
- 股价涨跌自动改生意质量结论  
- 覆盖 `value-thesis-tracker` / `thesis-tracker` 职责  
- 脚本联网；无交付结束
