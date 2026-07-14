# Opptrix — Agent 工程规则

> 本文件由 MiMoCode 自动注入 system instructions，每次会话生效。
> 细则按场景在 `.mimocode/skills/`；动手前 `skill` 加载对应 skill。
> `.cursor/rules/*.mdc` 为 Cursor IDE 专用，MiMoCode 不读取。

---

## 核心信条

1. **先理解，再动手**：重要修改前必须向用户提问确认需求
2. **先探索，再修改**：CodeGraph 定位后才能改代码
3. **代码即文档，文档即代码**：架构/API/调用方式变更后必须同步文档
4. **增量改动**：按用户最新指示做最小 diff；不顺手重构
5. **禁止断代**：schema、用户数据、Hub/API 变更须兼容 + 幂等迁移

---

## 硬性规则（全仓生效）

### R1. 需求澄清

**重要修改前必须向用户提问确认需求。**

触发场景：
- 新增功能 → 确认目标、场景、边界
- 修改架构 → 确认范围、影响、方案
- 修改 API → 确认兼容性、调用方影响
- 修改 UI → 确认交互、视觉、响应式
- 修改 Provider → 确认数据源、API 限制
- 修改 Schema → 确认迁移策略、数据保留

提问模板：
```
## 需求确认

**目标**：{你理解的目标}

**影响范围**：
- {影响 1}
- {影响 2}

**需要澄清**：
- {问题 1}
- {问题 2}

**实现方案**：
- 方案 A：{描述}
- 方案 B：{描述}

请确认或补充。
```

### R2. 探索再改

**凡了解代码库 / 查实现 / 找符号 / 跟调用链 — 必须先 CodeGraph。**

```bash
export PATH="$HOME/.local/bin:$PATH"
codegraph explore "<问题或符号>"
```

允许跳过：已定位只需改具体行；无索引；刚改未同步的单文件；非代码。

### R3. 文档同步

**架构/API/调用方式变更后必须同步更新对应文档。**

| 改动类型 | 必须更新的文档 |
|----------|----------------|
| 新增/修改 Hub feature | `docs/API.md`、`AGENT-GUIDE.md` |
| 新增/修改 Provider | `docs/PROVIDER-STANDARD-API.md`、`docs/DATA-LAYER.md` |
| 修改 `queryInstrumentData` | `docs/ARCHITECTURE.md`、`docs/DATA-LAYER.md` |
| 修改 UI 组件 | `docs/UI-DESIGN-SYSTEM.md`、`docs/UI-LAYOUT.md` |
| 修改 Schema | `docs/DATA-LAYER.md`、迁移测试 |
| 修改 Electron | `docs/DESKTOP.md`、`docs/ARCHITECTURE-COMPREHENSIVE.md` |
| 修改 API 路由 | `docs/API.md` |
| 修改 Agent tool | `docs/AGENT-GUIDE.md` |

### R4. 向后兼容

**禁止断代：任何已发布客户端升级后仍须能打开、读数据、逐步迁移。**

- 可升级路径：启动自动检测 + **幂等**迁移
- 只增不破：优先 `ALTER` / 新表 + 回填；禁止无迁移 DROP/重命名
- 失败可诊断、保留原数据；禁止「失败就删库」
- Schema：`MIGRATION_STEPS.length === SCHEMA_VERSION`；每版须跨版本跃迁 + 幂等测试

### R5. 安全规范

**敏感数据处理、输入校验、权限控制。**

- ❌ 禁止 API Key/Token 写入代码或提交 Git
- ❌ 禁止日志包含敏感信息
- ✅ 所有外部输入必须校验
- ✅ Electron：`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`
- ✅ 网络请求必须有超时

### R6. 代码质量

**类型安全、错误处理、性能、可维护性。**

- ❌ 禁止 `any` 类型、`@ts-ignore`、非空断言 `!`
- ✅ Provider 层返回 null 触发 failover
- ✅ Hub 层格式式化为用户友好消息
- ✅ 独立操作必须并行（`Promise.all`）
- ✅ 网络请求必须有超时（`AbortController`）
- ✅ 函数 <50 行，文件 <300 行

### R7. 任务分派

**复杂任务拆解为子任务，分派 subagent 并行执行。**

- 拆到可验证：每个子任务有明确完成标准
- 隔离上下文：Subagent prompt 必须自包含
- 并行优先：独立子任务同时执行
- 结果可审计：返回 Status + Summary + Files + Findings

### R8. 审查与审计

**代码提交前必须通过质量门禁。**

提交前：
- [ ] 无 `any` 类型
- [ ] 无 `@ts-ignore`
- [ ] 错误处理完整
- [ ] 测试通过
- [ ] 文档已更新（如适用）

client-ui 改动后：
- [ ] `npm run check:ui` 退出码 0

packages 改动后：
- [ ] `npm run build:packages` 无错误

---

## 架构分层

```
UI Layer (client-ui)
  └─ 职责：渲染、用户交互、状态展示
  └─ 禁止：直连 Provider、硬编码 API URL

API Layer (apps/server)
  └─ 职责：HTTP 路由、请求校验、响应格式化
  └─ 禁止：复杂业务逻辑、Provider 直连

Hub Layer (research-hub, search-hub)
  └─ 职责：feature 调度、多数据源聚合
  └─ 禁止：Provider 实现、UI 逻辑、持久化

Engine Layer (a-stock-layer)
  └─ 职责：查询计划、Provider 路由、缓存、熔断
  └─ 禁止：业务语义、UI 状态

Provider Layer (providers/*)
  └─ 职责：单一数据源适配、API 调用、数据标准化
  └─ 禁止：跨 Provider 逻辑、缓存策略、业务判断

Storage Layer (user-store, market-data)
  └─ 职责：SQLite 持久化、Schema 迁移
  └─ 禁止：业务逻辑、网络调用
```

调用规则：
| 调用方 | 允许调用 | 禁止调用 |
|--------|----------|----------|
| UI | Hub API、搜索 API | Provider、Engine、SQLite 直连 |
| Hub | Engine.queryInstrumentData | Provider 直连、SQLite 直连 |
| Engine | Provider Registry、Cache | Hub、UI、用户存储 |
| Provider | 上游 API、数据标准化 | 其他 Provider、Engine |

---

## 数据层（摘要）

- **唯一标准入口**：`engine.queryInstrumentData(ref, capability, opts?)`
- 扩展顺序：复用 capability → 扩 `instrument-query.ts` → 扩 Provider 标准方法 → 最后才 `invokeCustomMethod` + 文档登记
- **禁止** Hub / client-ui / Agent 主路径新增 `de.realtime()` / 直连第三方行情 URL
- 腾讯 ETF 基金自定义方法（`invokeCustomMethod("tencent", ...)`）：`tencentFundProfile`、`tencentFundAsset`、`tencentFundRankInfo`、`tencentFundNavHistory`、`tencentEtfKline`、`tencentFundNotice`、`tencentSameTypeFunds`、`tencentSameSeriesFunds`。

## client-ui（摘要）

- 设计前读 `docs/UI-DESIGN-SYSTEM.md`、`docs/UI-LAYOUT.md`；沿用 Fluent UI v9 + 项目 tokens / `Opptrix*` 封装
- 禁止 `window.confirm` / `alert` / `prompt`；确认用 `OpptrixDialogAlert` / `useOpptrixDialogAlert`
- Electron 始终 desktop 布局；小窗口侧栏全高浮层、无全屏遮罩
- 面向投资者文案：日常中文，避免裸用 hydrate/MCP/F10

改码后：

```bash
npm run check:ui   # typecheck:ui + lint:ui + audit:ui
# 同时改了 packages：先 npm run build:packages，再 check:ui
```

## 桌面发版（摘要）

1. Read `desktop-release` skill + `docs/DESKTOP-RELEASE.md`
2. Phase A 代码就绪（`check:ui` / `build:packages` / **`audit:desktop-pack`**）
3. Phase B bump `apps/desktop/package.json` version；写 `docs/releases/{version}.md`；更新 `ONBOARDING_RELEASE_BY_VERSION`
4. Phase C 兼容性；Phase D 用户确认后 `git tag desktop-v{version}` + push
5. **禁止**未写更新日志 / 未跑打包预检 / 未对齐 version 就打标签

引导激活：只改文案不 bump 版本 → 老用户**不会**重走引导。`shared/onboarding.ts` 与 `client-ui/.../constants.ts` 必须双写同步。

---

## 全面架构指南

**完整架构文档**：[`docs/ARCHITECTURE-COMPREHENSIVE.md`](./docs/ARCHITECTURE-COMPREHENSIVE.md)

涵盖：数据库层、数据层、Provider 机制、模块化开发、UI 规范、Electron 安全、弹性模式、端口管理、翻译服务、测试基础设施、CI/CD、配置管理、发布打包、审计流程。

## 场景索引（动手前加载）

| 场景 | Skill | 关键文档 |
|------|-------|---------|
| 探索代码 / 定位符号 | `codegraph` | `codegraph explore` |
| 改 `client-ui` | `client-ui` | `docs/UI-DESIGN-SYSTEM.md`、`docs/UI-LAYOUT.md` |
| 桌面发版 / 打标签 | `desktop-release` | `docs/DESKTOP-RELEASE.md` |
| SQLite / 数据库 | `schema-migration` | `.cursor/rules/backward-compatibility.mdc` |
| 行情 / Hub / 研究 API | `data-layer` | `docs/PROVIDER-STANDARD-API.md`、`docs/DATA-LAYER.md` |
| Provider 实现 | `provider-docs` | `docs/PROVIDER-STANDARD-API.md` |
| 架构设计 | `architecture` | `docs/ARCHITECTURE-COMPREHENSIVE.md` |
| 质量保证 / 审计 | `quality-assurance` | `docs/ARCHITECTURE-COMPREHENSIVE.md` |
| 任务分派 | `task-management` | - |
