# 辩论停止规则（2–5 轮自适应）

父 Agent（或轻量 chair 子任务）在**每一完整辩论轮**（Bull + Bear 各交付一次 `debate` 结果）结束后，用 `chair_stop` schema 判定。

## 硬约束

| 规则 | 说明 |
|------|------|
| **最少 2 轮** | `round < 2` 时 `should_stop` 必须为 false，`reason_code=min_rounds_not_met` |
| **最多 5 轮** | `round >= 5` 时必须停止，`reason_code=max_rounds` |
| **禁止跳轮** | 不得在未跑完本轮双方发言前判定停止 |

## 可停止（2 ≤ round ≤ 4）

满足任一即可 `should_stop=true`：

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
  chair_stop(round)
  if should_stop or round == 5: break
  round += 1
→ research_chair
```

## 禁止

- 第 1 轮结束后直接出研究主席结论  
- 为「显得充分」在已 converged 后强行打满 5 轮  
- 用口头摘要代替 `chair_stop` JSON（不利于 checklist 与复盘）
