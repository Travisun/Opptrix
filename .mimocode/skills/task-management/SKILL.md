# Task Management Skill

## 触发条件

当用户请求以下操作时加载此 skill：
- 拆分复杂任务
- 分派子任务给 subagent
- 跟踪任务进度
- 整合多个 subagent 的结果
- 评估任务完成度

## 核心原则

1. **拆到可验证**：每个子任务必须有明确的完成标准
2. **隔离上下文**：Subagent 不共享父 agent 的完整上下文
3. **并行优先**：独立子任务同时执行
4. **结果可审计**：每个子任务返回结构化结果

## 何时分派 Subagent

| 场景 | 策略 | 理由 |
|------|------|------|
| 探索代码库（>3 个文件） | `explore` subagent | 隔离大量读取结果 |
| 并行研究（多角度调研） | 多个 `explore` subagent | 并行加速 |
| 独立实现（单文件/单模块） | `general` subagent | 隔离实现细节 |
| 代码审查（验证实现） | `general` subagent | 独立视角 |
| 复杂任务（多步骤） | `task` + `subagent` | 任务跟踪 + 并行执行 |

## 任务拆分模板

```
## 任务
{一句话描述目标}

## 背景
{为什么做这件事，已知什么，排除什么}

## 约束
- 范围：{只改哪些文件/目录}
- 风格：{沿用现有代码风格}
- 禁止：{不要做的事}

## 完成标准
- [ ] {可验证的条件 1}
- [ ] {可验证的条件 2}

## 依赖
- 前置任务：{依赖的前置任务}
- 并行任务：{可以并行执行的任务}
```

## Subagent 简报模板

```
## 任务
{一句话描述目标}

## 背景
{为什么做这件事，已知什么，排除什么}

## 约束
- 范围：{只改哪些文件/目录}
- 风格：{沿用现有代码风格}
- 禁止：{不要做的事}

## 完成标准
- [ ] {可验证的条件 1}
- [ ] {可验证的条件 2}

## 输出格式
**Status**: success | partial | failed | blocked
**Summary**: 一句话总结

{交付物}

**Files touched**: 文件列表
**Findings worth promoting**: 发现的问题或建议
```

## 并行执行模式

```typescript
// 独立任务并行
parallel([
  () => agent("探索 Provider A 的实现", { subagent_type: "explore" }),
  () => agent("探索 Provider B 的实现", { subagent_type: "explore" }),
  () => agent("探索 Hub 调度逻辑", { subagent_type: "explore" }),
])

// 有依赖时串行
pipeline(items, [
  (item) => agent(`分析 ${item}`),
  (item, prev) => agent(`实现 ${item}，基于 ${prev}`),
])
```

## 任务追踪

### 创建任务

```typescript
task({ 
  operation: "create", 
  summary: "实现新 Provider X" 
})
```

### 标记进度

```typescript
task({ 
  operation: "start", 
  id: "T1", 
  event_summary: "开始探索现有 Provider 模式" 
})
```

### 完成任务

```typescript
task({ 
  operation: "done", 
  id: "T1", 
  event_summary: "Provider X 实现完成，测试通过" 
})
```

### 阻塞任务

```typescript
task({ 
  operation: "block", 
  id: "T1", 
  event_summary: "等待上游 API 文档" 
})
```

## 结果整合规则

1. **信任但验证**：Subagent 返回的结果视为事实，但关键决策需父 agent 验证
2. **冲突处理**：多个 Subagent 结论冲突时，父 agent 仲裁或重新分派
3. **信息压缩**：只传递必要信息
4. **错误传播**：Subagent 失败时，父 agent 决定重试、降级或终止

## 任务状态

```
open → in_progress → done
                 ↘ blocked → open
                 ↘ abandoned
```

### 状态规则

- **open**：待执行
- **in_progress**：正在执行（同一时间只有一个）
- **blocked**：被阻塞（等待依赖）
- **done**：已完成
- **abandoned**：已放弃

## 反模式

- ❌ **过度分派**：简单查找也分派 Subagent
- ❌ **上下文泄露**：Subagent prompt 包含无关的父 agent 上下文
- ❌ **结果忽略**：分派后不检查 Subagent 返回
- ❌ **无完成标准**：Subagent 不知道何时算完成
- ❌ **状态混乱**：任务状态不一致或过时
