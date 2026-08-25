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
6. **禁止半成品**：新功能须技术/用户/产品三维完备，兼容现有架构与安全；交付前复审回炉直至达标（见 R11）
7. **多平台默认可达**：功能改动须兼顾 macOS / Linux / Windows，禁止本机单一依赖定制（见 R12）

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
| 修改 Agent tool | `docs/AGENT-GUIDE.md`；并遵循 `mcp-tool-pack-routing.mdc` |

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

### R7. 多 Agent 编排与审计

**任何非豁免任务：先拆分步骤 → 派 2–4 个执行 subagent → 主 Agent 验收；不合格继续分派直至可用；维护 ID 表并完成后即时回收。**

- **Main Agent = 调度员 + 审计员**：拆分 → briefing（含 AC）→ 派发 → 逐条验 AC → 冲突仲裁 → 回收 → 交付。禁止直接改业务代码、替代 Verifier
- **执行层 2～4 个 subagent**：小改 2（Implementer+Verifier）；标准 3（+Explorer）；较大 4（+Architect/Documenter）。禁止一次超过 4、禁止只派 1 个全包
- **独立制衡**：Implementer 与 Verifier 不合并
- **返工**：AC 不通过则带文件:行号反馈继续分派，直到可用；连续 2 轮无增量须上报用户
- **Subagent ID 登记表（硬性）**：每次派发必须记录 `agent_id`/`task_id`（running）；**一收到完成/失败通知必须立刻停止并标 `reclaimed`**，禁止后台空跑、禁止无意义 `resume`
- **回收**：完成即停 + 交付前清点登记表无 `running`；清理卡死 / 不可用者
- **豁免**：纯问答、单行 typo、读文件回答问题 → Main Agent 直接处理
- **细则**：`.cursor/rules/multi-agent-orchestration.mdc`

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

### R9. UI 文案规范

**所有用户可见文案必须为产品级高端风格，禁止任何技术描述。**

- 写给使用者，非开发者；用户不关心实现，只关心「我能做什么」
- 禁止裸用 API、MCP、F10、Provider、hydrate、SQLite 等技术术语
- 禁止暴露组件名、文件名、路径、错误码等实现细节
- 空状态必须说明「为什么没有」和「下一步是什么」
- 错误提示必须说明「发生了什么」和「可做什么」
- 按钮用动词开头，明确用户将触发的动作
- 耗时操作给用户预期；失败说明可采取的动作
- 像一位专业顾问在对话，不像说明书在朗读

### R10. 双远程同步（GitHub + Gitee）

**凡 push / merge / merge 后 push，必须使 GitHub 与 Gitee 对应分支 tip 一致。**

- `gh pr merge` 只更新 GitHub → 合并后必须立刻 `git push gitee main`，并删除 Gitee 上残留功能分支
- 功能分支 / `main` / 发版 tag 均需两端存在且 tip 一致
- 完成前校验：`origin/main` 与 `gitee/main` SHA 相同；汇报时写明两侧均已更新
- 细则：`.cursor/rules/dual-remote-sync.mdc`

### R11. 新功能完备性与高可信交付

**新增/审计功能须技术·用户·产品三维完备；兼容现有架构与安全；禁止半成品；交付前复审，不合格回炉。**

- 设计前：主路径 + 空/错/权限态、兼容与安全、至少对照一种业界/开源做法
- 方向与不可逆取舍先问用户（配合 R1）
- 实现后按清单复审：端到端、失败态、不破坏邻接功能、测试与门禁、文档
- Verifier / 主验收 AC 须含完备性相关项；细则：`.cursor/rules/feature-completeness.mdc`

### R12. 多平台兼容（macOS / Linux / Windows）

**任何功能改动须兼顾三平台可运行与稳步；不得以当前开发环境的单一依赖做功能定制而忽略其他平台。**

- 适用：功能、沙盒、原生模块、路径、shell、打包、CI
- `darwin` / `linux` / `win32` 均须有实现路径，或明确 skip / 降级策略
- ❌ 硬编码本机路径；❌ 假设某一 OS 原生绑定全平台可用且无降级；❌ 只在本机验证就算完成
- 平台分支（`process.platform` / 条件编译 / 专属模块）须成对维护；新增专属能力时写明其他平台行为
- 沙盒（elevated、bwrap、Seatbelt 等）不得写成唯一实现而不给其他平台等价路径
- 细则：`.cursor/rules/cross-platform-compat.mdc`

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
- **内置推荐栈**（defaultPriority 越大越优先）：tonghuashun **120** → stockindex（Opptrix量化）**115** → tickflow **110** → tushare **105**；另含 binance/okx（CRYPTO，≤100）
- **已移除内置注册**：tencent、sinafinance、eastmoney、akshare、webfeed（实现与注册均已删除，本地配置启动时自动清理）
- **暂时下线**（源码保留、可加回）：baostock、zzshare（启动 purge 用户旧配置）
- **标的搜索权威源**：`stockindex`（Opptrix量化，`https://quant.opptrix.net`，需配置数据密钥；基址固定不可改）
- **Hub 降级**：机构持仓详情 Tab、非 CN 宏观 scope、部分跨市场 enrich；**右侧面板**主路径仍经 `queryInstrumentData`
- **搜索 / 名录**：搜索 = 扶摇 + Tickflow + 本地；名录灌库 = 纯 Tickflow（CN/HK/US 股票与 CN ETF）

## Agent / MCP 工具（摘要）

- 聊天路径经 **Tool Pack Router**：pack 召回 + `resolveToolRoutePlan` 精排 + 本轮选型卡；禁止全量固定 Broker
- **新增工具强制顺序**：`tools.ts` handler → `TOOL_META` → `TOOL_PACK_MEMBERSHIP` → `INTENT_RULES`（有用户说法时）→ 测试黄金用例 → `docs/AGENT-GUIDE.md`
- **后台 Job**：`list_jobs` / `cancel_job`（`core`）；长任务终态续跑 + Composer 任务面板（stdout / 结束任务）；细则见 `docs/AGENT-GUIDE.md` §4.2、`docs/API.md` Sessions
- 细则：`.cursor/rules/mcp-tool-pack-routing.mdc`；测试：`tests/mcp-tool-route-accuracy.test.mjs`

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
3. Phase B bump `apps/desktop/package.json` version；写 `docs/releases/{version}.md`；更新 `ONBOARDING_RELEASE_BY_VERSION`（文案**仅**功能/使用结果，禁止技术与纯 UI 打磨）
4. Phase C 兼容性；Phase D 用户确认后 `git tag desktop-v{version}` + push
5. **禁止**未写更新日志 / 未跑打包预检 / 未对齐 version 就打标签
6. **禁止**更新日志或引导开场写毛玻璃/按钮样式/依赖进程等技术或 UI 细节

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
| macOS 签名 / 公证 / 防漏签清单 | —（读规则） | `.cursor/rules/desktop-mac-signing.mdc`、`docs/DESKTOP-RELEASE.md` |
| SQLite / 数据库 | `schema-migration` | `.cursor/rules/backward-compatibility.mdc` |
| 行情 / Hub / 研究 API | `data-layer` | `docs/PROVIDER-STANDARD-API.md`、`docs/DATA-LAYER.md` |
| Agent / MCP 工具接入 | —（读规则） | `.cursor/rules/mcp-tool-pack-routing.mdc`、`docs/AGENT-GUIDE.md` |
| Agent 命令隔离 / 会话级 SRT | —（读规则） | `.cursor/rules/agent-shell-sandbox.mdc`、`docs/AGENT-GUIDE.md`、`docs/DESKTOP.md` |
| Provider 实现 | `provider-docs` | `docs/PROVIDER-STANDARD-API.md` |
| 架构设计 | `architecture` | `docs/ARCHITECTURE-COMPREHENSIVE.md` |
| 质量保证 / 审计 | `quality-assurance` | `docs/ARCHITECTURE-COMPREHENSIVE.md` |
| 多 Agent 编排（拆分 → 2–4 subagent → ID 登记 → 完成即停 → 主验收） | `multi-agent-orchestration.mdc` | `task-management` |
| UI 文案规范 | `ui-copy-standard.mdc` | `docs/UI-DESIGN-SYSTEM.md` |
| 多平台兼容 | —（读规则） | `.cursor/rules/cross-platform-compat.mdc` |
