# Architecture Skill

## 触发条件

当用户请求以下操作时加载此 skill：
- 设计新功能的架构
- 评估架构变更的影响
- 审查架构合规性
- 规划模块拆分或重构
- 讨论技术选型

## 核心原则

### 分层架构

```
UI Layer → API Layer → Hub Layer → Engine Layer → Provider Layer → Storage Layer
```

每层职责单一：
- **UI**：渲染、用户交互、状态展示
- **API**：HTTP 路由、请求校验、响应格式化
- **Hub**：feature 调度、多数据源聚合、结果格式化
- **Engine**：查询计划、Provider 路由、缓存、熔断、负载均衡
- **Provider**：单一数据源适配、API 调用、数据标准化
- **Storage**：SQLite 持久化、Schema 迁移、FTS 索引

### 调用规则

| 调用方 | 允许调用 | 禁止调用 |
|--------|----------|----------|
| UI | Hub API、搜索 API、用户偏好 API | Provider、Engine、SQLite 直连 |
| Hub | Engine.queryInstrumentData、评估/策略包 | Provider 直连、SQLite 直连 |
| Engine | Provider Registry、Cache、Health | Hub、UI、用户存储 |
| Provider | 上游 API、数据标准化 | 其他 Provider、Engine、Cache |
| Agent | Hub、Engine（经 MCP 工具） | Provider 直连、SQLite 直连 |

### 注册模式

新增能力通过**注册**而非**修改**：

```typescript
// ✅ 正确：注册新 Provider
registry.register(new MyProvider())

// ✅ 正确：注册新 Hub feature
case 'my_feature': return handleMyFeature(params)

// ✅ 正确：注册新 Agent tool
tools.register('my_tool', { ... })

// ❌ 错误：修改 Engine 核心循环
// ❌ 错误：在 Hub 内硬编码 Provider 调用
```

## 设计流程

### 1. 需求分析

```
1. 明确功能目标
2. 识别涉及的层级
3. 确定扩展点（注册 vs 修改）
4. 评估影响范围
```

### 2. 架构设计

```
1. 选择分层位置
2. 定义接口契约
3. 确定数据流
4. 设计错误处理
5. 考虑缓存策略
```

### 3. 实现规划

```
1. 拆分任务（task tool）
2. 确定依赖关系
3. 分派 subagent（如适用）
4. 定义完成标准
```

### 4. 验证

```
1. 类型检查
2. 单元测试
3. 集成测试
4. 代码审查
5. 文档更新
```

## 常见场景

### 新增 Provider

```
位置：packages/a-stock-layer/src/providers/{name}/
步骤：
1. 创建 manifest.ts（capabilities、bindings）
2. 实现 BaseDriver（标准方法）
3. 注册到 register.ts
4. 添加测试连接
5. 编写自定义方法文档（如有）
6. 更新 AGENTS.md
```

### 新增 Hub Feature

```
位置：packages/research-hub/src/hub.ts
步骤：
1. 在 hub.ts 增加 case
2. 映射到 InstrumentDataCapability（或登记自定义方法）
3. 暴露 REST（如需）
4. 注册 Agent tool（如需）
5. 更新文档
```

### 新增因子

```
位置：packages/stock-eval/src/factors/
步骤：
1. 添加实现
2. 注册到 factor-registry.ts
3. 添加测试
4. 更新评分卡（如需）
```

### 新增 UI 组件

```
位置：client-ui/src/components/ 或 client-ui/src/{domain}/
步骤：
1. 设计前必读 UI-DESIGN-SYSTEM.md
2. 沿用设计语言（Fluent UI v9 + tokens）
3. 优先组合现有组件
4. 运行 npm run check:ui
```

## 反模式

- ❌ **God Object**：单个文件/类承担过多职责
- ❌ **Shotgun Surgery**：一个需求改动 5+ 个不相关的文件
- ❌ **Feature Envy**：模块 A 频繁访问模块 B 的内部数据
- ❌ **Primitive Obsession**：用 string/number 代替值对象
- ❌ **Reinventing the Wheel**：已有标准 API 却新建平行实现
