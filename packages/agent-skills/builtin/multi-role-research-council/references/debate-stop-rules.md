# 辩论停止规则（1–3 轮自适应）

父 Agent（或轻量 chair 子任务）在**每一完整辩论轮**（Bull + Bear 各交付一次 `debate` 结果）结束后，用 `chair_stop` schema 判定。

## 硬约束

| 规则 | 说明 |
|------|------|
| **默认 1 轮** | 首轮双方发言 + 审查后，若无明显新议题，应停止 |
| **round ≥ 1 可停** | `round >= 1` 且满足可停止条件时 `should_stop=true` |
| **最多 3 轮** | `round >= 3` 时必须停止，`reason_code=max_rounds` |
| **禁止跳轮** | 不得在未跑完本轮双方发言前判定停止 |

## 可停止（1 ≤ round ≤ 2）

满足任一即可 `should_stop=true`（**须先完成本轮审查**，确认无实质新论点再停）：

1. **converged**：双方 `concessions` 覆盖了对方核心 `claims`，且 `open_questions` 不再引入新的可验证议题  
2. **diminishing_returns**：本轮 `claims`/`rebuttals` 与上轮高度重复（实质新论点 < 2 条）  
3. **evidence_exhausted**：双方均承认关键数据缺口，继续辩论只会重复缺口叙述  

否则 `should_stop=false`，`reason_code=continue`。

## 流程提示

```
round = 1
loop:
  run bear (or bull) → reclaim
  run bull (or bear) → reclaim
  chair_stop(round)  // 强化审查：是否真有第 2/3 轮必要？
  if should_stop or round == 3: break
  round += 1
→ research_chair
```

## 禁止

- 未审查首轮就强行进入第 2/3 轮  
- 为「显得充分」在已 converged 后强行打满 3 轮  
- 用口头摘要代替 `chair_stop` JSON（不利于 checklist 与复盘）
