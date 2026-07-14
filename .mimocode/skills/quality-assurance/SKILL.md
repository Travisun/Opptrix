# Quality Assurance Skill

## 触发条件

当用户请求以下操作时加载此 skill：
- 代码审查
- 质量检查
- 发布前审计
- 测试验证
- 性能评估

## 代码审查流程

### 1. 自我审查

```
1. 运行 check:ui（如有 UI 改动）
2. 运行 build:packages（如有 packages 改动）
3. 运行相关测试
4. 检查 git status
```

### 2. 分派审查

```
1. 创建 task 记录
2. 分派 general subagent 独立审查
3. 收集审查意见
4. 修复问题
5. 重新验证
```

### 3. 审查清单

#### 功能正确性

- [ ] 需求是否完整实现？
- [ ] 边界条件是否处理？
- [ ] 错误情况是否优雅处理？
- [ ] 性能是否有明显问题？

#### 架构合规

- [ ] 是否遵循分层架构？
- [ ] 是否使用标准 API？
- [ ] 是否正确使用 `InstrumentRef`？
- [ ] 新增能力是否通过注册？

#### 类型安全

- [ ] 无 `any` 类型
- [ ] 无 `@ts-ignore`
- [ ] 无非空断言 `!`
- [ ] 输入经过类型守卫校验

#### 错误处理

- [ ] Provider 层返回 null 触发 failover
- [ ] Hub 层格式式化为用户友好消息
- [ ] 无空 catch 块
- [ ] 无吞掉错误

#### 测试

- [ ] 关键路径有测试覆盖
- [ ] 边界条件有测试
- [ ] 测试可独立运行
- [ ] 无测试间依赖

#### 文档

- [ ] 复杂逻辑有注释说明 WHY
- [ ] 公共 API 有 JSDoc
- [ ] 更新日志已更新（如适用）

## 发布前审计

### Phase A — 代码就绪

```bash
# 1. 客户端检查
npm run check:ui           # 如有 client-ui 改动

# 2. 包构建
npm run build:packages     # 如有 packages 改动

# 3. 前端构建
npm run build -w opptrix-client

# 4. 打包预检
OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop
```

### Phase B — 版本与文档

```bash
# 1. 检查版本号
cat apps/desktop/package.json | grep version

# 2. 检查更新日志
cat docs/releases/{version}.md

# 3. 检查引导参数
grep -n "ONBOARDING_RELEASE_BY_VERSION" client-ui/src/onboarding/manifest.ts
```

### Phase C — 兼容性

```bash
# 1. 检查 Schema 版本
grep -n "SCHEMA_VERSION" packages/market-data/src/schema.ts

# 2. 检查迁移步骤
grep -n "MIGRATION_STEPS" packages/market-data/src/schema-migrate.ts
```

### Phase D — 发布

```bash
# 1. 预览 Release Notes
node scripts/assemble-release-notes.mjs {version}

# 2. 打标签
git tag desktop-v{version}
git push origin desktop-v{version}
```

## 审计报告模板

```markdown
## 审计报告 — {版本号}

### 总体评估
✅ 通过 | ⚠️ 有条件通过 | ❌ 不通过

### 检查结果

| 类别 | 状态 | 备注 |
|------|------|------|
| 代码就绪 | ✅ | |
| 类型安全 | ✅ | |
| 测试覆盖 | ✅ | |
| 文档完整 | ⚠️ | API.md 待更新 |
| 兼容性 | ✅ | |
| 打包预检 | ✅ | |

### 发现的问题
1. {问题描述}
   - 严重性：高/中/低
   - 建议：{修复建议}

### 建议
- {建议 1}
- {建议 2}

### 结论
可以发布。建议在发布前更新 API.md。
```

## 质量指标

### 代码质量

| 指标 | 目标 | 检查方式 |
|------|------|----------|
| 类型覆盖 | >95% | `tsc --noEmit` |
| ESLint 警告 | 0 | `npm run lint:ui` |
| 测试通过 | 100% | `npm run test:ci` |

### 测试覆盖

| 类型 | 覆盖率目标 |
|------|------------|
| 核心逻辑（Engine/Provider） | >80% |
| Hub 调度 | >70% |
| API 路由 | >60% |
| UI 组件 | 关键路径 |

### 性能指标

| 指标 | 目标 | 检查方式 |
|------|------|----------|
| API 响应时间 | <500ms | 性能测试 |
| 内存使用 | <200MB | 运行时监控 |
| 启动时间 | <3s | 用户体验测试 |

## 反模式

- ❌ **跳过审查**：代码直接合并
- ❌ **形式审查**：只看 diff 不运行测试
- ❌ **忽略警告**：CI 警告不处理
- ❌ **带红发布**：测试失败仍打标签
- ❌ **无审计发布**：未完成 Checklist 就发布
