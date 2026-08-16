# Opptrix 自进化 Harness（Self-Harness）— 产品设计

> **状态**：**工程契约已落地**（Phase 0–3 REST + 设置「此模型的分析习惯」UI，2026-08-16）。用户侧「聊天自动自进化」**未**上线；自动晋升仅离线 lab / `npm run harness:lab`。  
> **参照**：上海 AI Lab *Self-Harness: Harnesses That Improve Themselves*（[arXiv:2606.09498](https://arxiv.org/abs/2606.09498)）  
> **相关文档**：[AGENT-GUIDE.md](./AGENT-GUIDE.md)、[AGENT-SKILLS.md](./AGENT-SKILLS.md)、[EXPERT-GUIDE.md](./EXPERT-GUIDE.md)、本节 §16

---

## 1. 一句话定义

**在不更换、不微调模型的前提下**，让 Opptrix 根据真实执行失败，**迭代「怎么跑投研」的脚手架（Harness）**——系统纪律、技能剧本、工具用法提示、验证与恢复策略——使同一模型在投研主路径上更稳、更完整、更合规。

这不是「让模型自己改代码乱进化」，而是：**有证据、有门控、可回滚的跑法升级**。

---

## 2. 为什么要做（产品价值）

### 2.1 用户能感知到什么

| 价值 | 用户体感 |
|------|----------|
| **同样模型，更好用** | 更少空转、漏取数、研讨半成品、乱编数字 |
| **换模型少翻车** | DeepSeek / 国产 / OpenAI 兼容各自有失败习惯；适配后换模型不至于「突然不会办事」 |
| **复杂交付更完整** | 如「投资研讨团」少跳阶段、少缺网页、署名与免责正确 |
| **更省、更稳** | 进化出更好跑法，而不是每轮堆更长临时指令；与会话前缀缓存策略同向 |

### 2.2 对产品与业务

| 价值 | 说明 |
|------|------|
| **ROI** | 投研瓶颈大量在「编排与纪律」，改脚手架通常比盲目换更大模型划算 |
| **跟模型迁徙** | 新模型上线不必全靠人肉重写 prompt / skill |
| **质量可度量** | 有基准与回归后，「这次改跑法有没有伤安全 / 取数」说得清 |
| **差异化** | 行情接口可复制；**随模型沉淀的投研跑法库**更难抄 |

### 2.3 对团队

- 从「无尽调文案」变成「弱点报告 → 补丁 → 晋升」  
- 客服 / 研发可按失败类型分桶看问题，而不是翻整段聊天  

---

## 3. 非目标（明确不做）

| 非目标 | 原因 |
|--------|------|
| 改模型权重 / 私有微调替代方案 | 成本与合规边界不同；本能力聚焦 Harness |
| 聊天中无门控地自动改全局系统纪律 | 易破坏安全、荐股边界与前缀缓存 |
| 没有成功判据的「感觉更好就合入」 | 会漂成自动改文案，伤害可信度 |
| 用自进化放宽沙盒、密钥、荐股禁令 | 安全底线不可被进化覆盖 |
| 替代数据层标准 API 与 Provider 质量 | 数据对错仍走数据层；Harness 只优化「怎么用」 |

---

## 4. 产品概念

### 4.1 Harness（脚手架）在 Opptrix 里是什么

用户不需要知道这个词。对内定义为：

> **介于模型与投研环境之间的可编程跑法层**：系统底线与投研纪律、技能剧本、工具选型提示、协作编排、失败拦截与恢复、上下文整理策略等。

用户可见的相关能力（不暴露内部名）：

- 技能（如投资研讨团）  
- 专家技能专长  
- 「助手更会按步骤完成分析」的体验差异（按所用模型）  

### 4.2 与「任务层自反思」的区别

| | 任务层自反思 | Self-Harness（本方案） |
|--|-------------|------------------------|
| 改什么 | 这一次怎么回答 / 再试一次 | **以后默认怎么跑** |
| 生命周期 | 单次或短会话 | Harness **版本** |
| 合入条件 | 往往无严格回归 | **必须通过基准与无退步门控** |

### 4.3 三阶段闭环（对产品的说法）

| 阶段 | 对内名称 | 产品含义 |
|------|----------|----------|
| 1 | 弱点挖掘 | 从真实失败里找出「反复犯的错」 |
| 2 | 改进提案 | 针对每一类错，给出**最小**跑法补丁 |
| 3 | 回归验证 | 用固定考题验收：修好了、且没弄坏别的，才晋升 |

---

## 5. 谁受益、谁操作

### 5.1 终端用户（默认）

- **不感知「自进化」技术词**  
- 感知：所选模型下，助手完成投研任务更完整、更少卡死  
- 可选（后期）：设置中看到「当前模型的跑法版本」与「恢复默认」  

### 5.2 产品 / 运营 / 研发（治理方）

- 查看弱点报告与提案  
- 审批或一键晋升 / 回滚 Harness 版本  
- 维护「投研考题集」（黄金场景）  

### 5.3 权限原则

- **Layer 0 安全底线**（禁具体买卖建议、禁编造须取数、密钥与沙盒等）**永不被自动补丁覆盖**  
- 自动/半自动只允许动「白名单跑法层」  

---

## 6. 可进化范围（产品分级）

| 等级 | 内容示例 | 自动合入 | 说明 |
|------|----------|----------|------|
| **A 会话 / 用户级** | 本会话技能专长、用户自建技能文案、软提醒 | 可半自动 | 影响面小，可先做 |
| **B 产品跑法** | 内置技能步骤与附件、工具选型提示、研讨剧本细节 | 须回归 + 人工或严格门控 | 投资研讨团等属此类 |
| **C 核心底线** | 全局禁荐股、沙盒/密钥、spin 核心、tools 冻结策略 | **禁止自动** | 仅人工变更 + 发版 |

**原则**：先 A、再 B、永不自动 C。

---

## 7. 成功标准（产品如何验收）

### 7.1 体验指标（主）

| 指标 | 方向 | 备注 |
|------|------|------|
| 主路径任务完成率 | ↑ | 如：取数闭环、技能跑完、研讨团交付网页 |
| 空转 / 重复失败拦截率 | ↓ 或「无效重试」↓ | 与现有失败拦截同向，不靠关掉护栏刷指标 |
| 半成品交付率 | ↓ | 缺阶段、缺免责、错署名等 |
| 换模型后主路径可用率 | ↑ | 同一考题集跨模型 |

### 7.2 工程 / 成本指标（辅）

| 指标 | 方向 |
|------|------|
| 适配新模型到「可用」的周期 | ↓ |
| 因改 prompt 导致的回滚次数 | ↓（有门控后） |
| 单次离线进化批次成本 | 可控、可预算 |

### 7.3 底线指标（一票否决）

- 荐股 / 目标价 / 仓位指令类违规 **不得变多**  
- 密钥进正文、沙盒逃逸类 **零容忍**  
- held-out 考题集 **不得净退步**  

---

## 8. 投研「考题」怎么定义（没有它就不要上线）

Self-Harness 在论文里依赖 Terminal-Bench 的硬通过。Opptrix 必须自建 **可判定** 的场景集，例如：

| 类型 | 示例判据（产品语言） |
|------|----------------------|
| 取数纪律 | 问行情必须先取数，不得空口数字 |
| 技能触发 | 说「投资研讨团」应走研讨流程而非随便聊天 |
| 研讨完整度 | 有立场枚举、免责、Opptrix 投资研讨团流程署名、默认可预览交付 |
| 协作 | 不无意义重复开同一协作任务 |
| 安全 | 索要密钥走保险箱，不诱导聊天粘贴 |
| 编程补齐 | 标准能力不够时用工作区能力补齐，且不替代标准取数主路径 |

**规模建议**：首期 30–80 条稳定考题；分 held-in（供挖弱点）与 held-out（晋升门控，不喂给提案模型当「抄答案」）。

---

## 9. 用户体验与界面（产品形态）

### 9.1 默认：用户无感

- 聊天主路径不出现「自进化 / Harness / 回归」等词  
- 不打断用户做「是否允许改助手大脑」的技术确认（全局变更走治理方）  

### 9.2 可选：设置中的「模型跑法」（后期）

建议文案方向（符合 UI 文案规范）：

- 标题：**此模型的分析习惯**  
- 说明：习惯版本来自本地已晋升的分析跑法；开关只控制离线合入是否允许。安全底线不会改。  
- 操作：**查看版本** / **恢复默认习惯**  

禁止对用户写：API、MCP、prompt、回归测试、Self-Harness 等。

### 9.3 治理台（内部 / 高级）

- 弱点榜（按模型）  
- 待审提案（改了什么、修哪类失败、考题分数）  
- 一键晋升 / 拒绝 / 回滚  

首期可以是 **研发本地报告 + PR**，不必先做完整 UI。

---

## 10. 与现有产品能力的关系

| 现有能力 | 关系 |
|----------|------|
| **技能 / 投资研讨团** | 优先进化对象（B 级剧本与附件） |
| **专家 / 技能专长** | A 级：会话与专家风格可先受益 |
| **工具包与选型提示** | B 级：减少选错工具、空转 |
| **协作子任务** | 进化「何时委派、如何收口」的纪律，不替代协作产品本身 |
| **上下文与缓存展示** | 进化不得 mid-对话打穿稳定前缀；版本切换用冷启动 |
| **安全与沙盒** | C 级，只读信号源，不自动改策略 |

---

## 11. 分阶段路线图（产品视角）

### Phase 0 — 看得见失败（只读）

**状态**：**已落地只读库**（2026-08-16）— `@opptrix/agent` 导出 `buildWeaknessReport` / `formatWeaknessReportMarkdown`；**默认不接入** `engine.chat`，零干扰。

**交付**：按模型的「失败类型报告」（工具失败、空转拦截、空回复、研究步骤停滞、技能交付缺口启发式等）  
**用户**：无感知  
**价值**：证明问题可分桶；为考题集选题  

**如何跑测（研发本地）**：

```bash
npm run build -w @opptrix/agent
node --test tests/harness-weakness-report.test.mjs
```

**准出**：连续两周能稳定产出分桶报告；产品能指出 Top 3 失败类型。

### Phase 1 — 离线进化实验室

**状态**：**已落地**（2026-08-16）— 离线考题集 + 模板提案 + held-out 验证 + **本地可晋升跑法仓**（`~/.opptrix` 用户库 `documents` namespace=`harness`）；冷启动叠层挂在 `buildActivatedSkillsPrompt`；**仍不进入** `engine.chat` 热路径挖弱点 / 跑 lab。

**交付**：
- 考题 ≥8（held-in / held-out；取数、空转、研讨交付、安全否决）
- 白名单 patch：`skill_body_append` / `skill_body_replace_span` / `route_hint_append`（后者先存仓）
- `promoteHarnessProposal` 写本地仓；`rollbackHarnessToDefault` 清空 active
- `formatVersion` 幂等迁移；未知 kind / 缺技能 soft-skip
- 与 Opptrix app version **解耦**（升级不清空用户仓）

**用户**：默认无感；有 active 时新会话技能正文自动叠层（不暴露技术词）

**如何跑（研发本地）**：

```bash
npm run build -w @opptrix/agent-skills && npm run build -w @opptrix/agent
node --test tests/harness-exam-lab.test.mjs tests/harness-local-store-migrate.test.mjs tests/harness-weakness-report.test.mjs
```

编程入口：`runHarnessLab({ report?, proposal?, promote? })`；晋升后技能正文经 `applyHarnessSkillOverlay`。

**准出**：至少 1 个模型桶 held-out 主路径完成率明显提升，且安全底线指标不恶化（线上验证后续迭代）。

### Phase 2 — 模型分桶「跑法版本」

**状态**：已落地（核心仓 + 叠层 + route_hint；设置 UI/REST 另轨）  

**交付**：按所用模型加载不同已晋升跑法；`route_hint_append` 挂入 turn-tail；考题 ≥24  
**用户**：换模型体验更稳；可查看版本 / 恢复默认（设置页另轨）  
**价值**：多模型产品体验一致化  

**准出**：新会话按模型加载正确版本；切换版本不污染进行中会话的 tools 冻结前缀（冷启动语义清晰）。

### Phase 3 — 有限自动（A 级）

**状态**：已落地（lab `promote: 'auto'` + 关停闸；设置 UI 另轨）  

**交付**：仅 A 级（`skill_body_append` / `route_hint_append`）在 held-out + 安全闸通过后可自动晋升；B 仍人工；C 永不自动；可一键关停（env / store）  
**用户**：默认无感；设置可关「允许离线自动合入」（UI 另轨）  
**准出**：自动合入有审计日志；关停后与现网一致；**永不**从 `engine.chat` 调 lab  

---

## 12. 风险与对策

| 风险 | 对策 |
|------|------|
| 软目标难判定 → 瞎进化 | 先做结构/流程类硬判据；立场对错不做自动目标 |
| 改全局纪律伤合规 | C 级锁定；晋升权限收紧 |
| 打穿上下文缓存 | 只允许版本切换 / 新会话加载，禁止回合中改 system/tools 集 |
| 过拟合考题 | held-out + 定期轮换少量考题；禁止用 held-out 喂提案 |
| 用户以为「AI 自己改安全」 | 文案强调安全底线不变；设置里可关自动 |

---

## 13. 已拍板决策（原开放问题 — 2026-08-16 关闭）

| # | 决策 | 结论 |
|---|------|------|
| 1 | 主战场 | 通用取数 + 少空转 + 研讨交付 + 安全 + 协作；考题结构覆盖 |
| 2 | 晋升权 | 本地仓为主；Phase3 仅 A 级可自动；B 人工；C 永不自动 |
| 3 | 用户可见性 | 设置「此模型的分析习惯」：查看版本 / 恢复默认；禁 Self-Harness/API/MCP |
| 4 | 多模型 | **一模型一跑法**：`modelRef` → `providerId:*` → `*` |
| 5 | 会话级补丁 | Phase 2/3 **不做**会话级自动补丁；仅冷启动版本叠层 |
| 6 | 自动关停 | 用户偏好 + 环境变量一键关停 |
| 7 | 零干扰 | 无 active / 关停时与现网一致；不 mid-loop 改 tools；lab 不进 chat |

---

## 14. 建议决策

| 建议 | 说明 |
|------|------|
| **做** | 作为中长期产品能力立项，与多模型体验、技能质量绑定 |
| **先做 Phase 0–1** | ✅ 已落地；现推进 Phase 2–3 全量产品实现 |
| **主叙事** | 「让每个模型都更会按 Opptrix 的方式做投研」，而非「AI 自我进化」营销词 |
| **安全叙事** | 「习惯可变，底线不变」 |

---

## 15. 附录：论文对照（给评审用）

| 论文要素 | Opptrix 映射 |
|----------|----------------|
| Weakness Mining | 会话轨迹 / 工具步骤 / 拦截记录 → 失败分桶 |
| Harness Proposal | 技能文案、选型提示、剧本附件等白名单补丁 |
| Proposal Validation | 投研考题 held-in / held-out + 安全一票否决 |
| 模型相关 Harness | 按模型（或厂商）分桶的跑法版本 |
| 不改权重 | 仅改脚手架；模型仍由用户配置 |

---

## 16. Phase 2 + Phase 3 — Implementer 接口真源（工程契约）

> **权威性**：本节为 Phase 2/3 实现的**唯一接口真源**。字段名、函数签名、REST 路径、挂载点以本节为准；与 Phase 1 代码冲突时，以实现本节 + 幂等 migrate 为准。  
> **禁止**：demo / 仅 UI 壳 / 在 `engine.chat` 热路径跑 lab / 改 frozen tools schema / mid-loop 改 tools。

### 16.1 现状锚点（Phase 1，勿破坏）

| 模块 | 路径 | 行为 |
|------|------|------|
| Store | `packages/agent/src/harness/local-store.ts` | `formatVersion=1`；`activeVersionId` 全局；namespace=`harness` / id=`store` |
| Overlay 技能 | `apply-overlay.ts` + `register-overlay.ts` | `setSkillBodyOverlay` → `applyHarnessSkillOverlay`；`route_hint` soft-skip `route_hint_not_mounted` |
| Lab | `lab.ts` → `runHarnessLab` | `promote?: boolean`；**禁止** chat 调用 |
| Turn-tail | `AgentEngine.buildRoundTurnTail` | 调 `buildTurnTailPrompt` + `buildRoundRoutePlaybook`；**此处挂 route_hint** |
| modelRef | `SessionRecord.model` | 形如 `providerId:modelId`；`providerIdFromModelRef` 取冒号前缀 |
| Settings API 范例 | `apps/server/src/python-settings-routes.ts` | 本地 `/api/settings/*`，无额外鉴权头（与现网一致） |

### 16.2 Store `formatVersion: 2`

#### 类型（最终字段名）

```ts
/** packages/agent/src/harness/local-store.ts */

export const HARNESS_FORMAT_VERSION = 2
export const HARNESS_WILDCARD_BUCKET = '*' as const

/** 审计动作（可扩展，未知值 migrate 时保留字符串） */
export type HarnessAuditAction =
  | 'promote_manual'
  | 'promote_auto'
  | 'rollback_model'
  | 'rollback_default'      // 清空某 modelRef / * 的 active
  | 'set_auto_promote'
  | 'migrate_v1_to_v2'
  | 'skip_auto_promote'     // 关停 / 非 A / 验证失败等

export interface HarnessAuditEntry {
  at: string                 // ISO 8601
  action: HarnessAuditAction | string
  modelRef?: string
  versionId?: string | null
  detail?: string            // 短说明；禁止密钥/长正文
}

export type HarnessPatchTier = 'A' | 'B' | 'C'

export interface HarnessVersionRecord {
  id: string
  createdAt: string
  proposalId?: string
  summary?: string
  patches: HarnessPatch[]
  skippedPatches: SkippedPatchRecord[]
  exportMarkdown?: string
  /** v2：该版本归属的模型桶键（精确 modelRef / `providerId:*` / `*`） */
  modelBucket?: string
  /**
   * v2：版本整体档位 = patches 中最高档。
   * A = 仅含 skill_body_append | route_hint_append
   * B = 含 skill_body_replace_span（或未来 B 白名单）
   * C = 永不自动（本期无自动写入路径）
   */
  tier?: HarnessPatchTier
}

export interface HarnessAutoPromotePref {
  enabled: boolean
  updatedAt: string
}

export interface HarnessStoreDocument {
  formatVersion: 2
  /** 全局默认 active（兼容 v1 语义；解析时等价 activeByModel['*']） */
  activeVersionId: string | null
  /** 按模型桶：精确 modelRef → versionId；缺省键不写 */
  activeByModel: Record<string, string | null>
  autoPromote: HarnessAutoPromotePref
  /** 新→旧；写入时裁剪 */
  auditLog: HarnessAuditEntry[]
  versions: Record<string, HarnessVersionRecord>
  [key: string]: unknown
}

export interface HarnessActivePointer {
  formatVersion: 2
  /** 镜像全局 * 桶，便于轻量读取 */
  activeVersionId: string | null
  /** 可选：最近一次解析用到的 modelRef（诊断；可不写） */
  updatedAt: string
}
```

#### 常量与裁剪

| 项 | 值 |
|----|-----|
| `AUDIT_LOG_MAX` | `200` |
| 裁剪策略 | `saveHarnessStore` 时若 `auditLog.length > 200`，保留**最新** 200 条（`slice(-200)`） |
| `active` 文档 | 继续写 `HARNESS_ACTIVE_DOC_ID`；`activeVersionId` = `activeByModel['*'] ?? null`（与全局字段同步） |
| 未知顶层字段 | migrate / save **保留** |

#### `migrateHarnessStore`（幂等 0/1 → 2）

伪代码契约：

```ts
// 1. 先跑现有 v0→v1 逻辑（versions / patches / skippedPatches）
// 2. 若 formatVersion >= 2 且已有 activeByModel 对象 → 规范化后返回（幂等）
// 3. formatVersion < 2：
//    - activeByModel = isRecord(raw.activeByModel) ? normalize : {}
//    - 若 activeByModel['*'] 缺失：activeByModel['*'] = activeVersionId（可为 null）
//    - 若 activeVersionId 缺失：activeVersionId = activeByModel['*'] ?? null
//    - 双向对齐：最终 activeVersionId === activeByModel['*']
//    - autoPromote = { enabled: true 若缺省, updatedAt: now }；显式 false 保留
//    - auditLog = Array.isArray ? filter valid : []；超长裁剪
//    - 各 version：补 modelBucket（缺省 '*'）、tier（由 patches 推导 classifyVersionTier）
//    - 追加一条 audit：{ action: 'migrate_v1_to_v2', detail: 'idempotent' }（仅当从 <2 升上来时写一次；已是 2 不重复刷）
// 4. formatVersion = 2
```

`classifyVersionTier(patches): 'A'|'B'|'C'`：

- 含未知/未来非白名单 kind → 视为 **B**（不可自动）
- 含 `skill_body_replace_span` → **B**
- 仅 `skill_body_append` 与/或 `route_hint_append` → **A**
- 空 patches → **A**（无害）

#### 模型桶键约定

```ts
/** 规范化 session.model / API 入参 */
export function normalizeHarnessModelRef(raw: string | null | undefined): string | null

/**
 * 解析顺序（硬性）：
 * 1. activeByModel[modelRef]     — 精确（normalize 后）
 * 2. activeByModel[`${providerId}:*`] — provider 通配（providerId 来自冒号前缀；无冒号则跳过本步）
 * 3. activeByModel['*'] 或 activeVersionId
 * 4. null → 无叠层（与 Phase0 前一致）
 */
export function resolveActiveHarnessVersionId(
  store: HarnessStoreDocument,
  modelRef: string | null | undefined,
): string | null

export function getActiveHarnessVersionForModel(
  modelRef: string | null | undefined,
): HarnessVersionRecord | null
```

- `normalizeHarnessModelRef`：`trim`；空 → `null`；**不做**大小写折叠（键精确匹配用户所选 `providerId:model`）。
- `promoteHarnessProposal` 签名扩展：

```ts
export function promoteHarnessProposal(
  proposal: HarnessProposal,
  opts?: {
    versionId?: string
    /** 写入 versions[id].modelBucket，并设置 activeByModel[bucket] */
    modelBucket?: string   // 默认 '*'
    source?: 'manual' | 'auto'
  },
): HarnessVersionRecord
```

晋升时：`store.versions[id] = { ..., modelBucket, tier }`；`activeByModel[modelBucket] = id`；若 `modelBucket === '*'` 同步 `activeVersionId`；写 audit；`clearHarnessOverlayCache()`。

```ts
export function rollbackHarnessForModel(modelRef: string): void
// activeByModel[normalize(modelRef)] = null；若为 '*' 同步 activeVersionId；audit rollback_model

export function rollbackHarnessToDefault(modelRef?: string): void
// 无参：兼容 Phase1 = 清空 '*'（及 activeVersionId）
// 有参：等同 rollbackHarnessForModel
```

### 16.3 Overlay 解析（技能正文 + route_hint）

#### 技能正文

`applyHarnessSkillOverlay(skillName, body, opts?)` 改为：

```ts
export function applyHarnessSkillOverlay(
  skillName: string,
  body: string,
  opts?: {
    bypassCache?: boolean
    /** 缺省：无模型上下文 → 仅解析 '*' 桶（兼容旧调用） */
    modelRef?: string | null
  },
): ApplyOverlayResult
```

- 用 `getActiveHarnessVersionForModel(opts?.modelRef)` 取代裸 `getActiveHarnessVersion()`。
- Cache key：`${epoch}::${versionId}::${skillName}`（不变）；晋升/回滚仍 `clearHarnessOverlayCache`。
- `ensureHarnessOverlayRegistered`：`setSkillBodyOverlay` 回调**无法**直接拿 session — 由 Engine 在组装激活技能前注入：

**挂载契约（硬性）**：

1. 新增模块级 ALS 或 Engine 私有字段 `harnessOverlayModelRef: string | null`（推荐 **AsyncLocalStorage** `harnessModelContext`，避免并发串台）。
2. `buildRoundTurnTail` / 激活技能正文路径进入时：`runWithHarnessModelRef(record.model, () => …)`。
3. `setSkillBodyOverlay` 内：`applyHarnessSkillOverlay(name, body, { modelRef: getHarnessModelRef() })`。
4. 无上下文 → `modelRef=null` → 只解析 `*`（与「无会话模型」一致）。

#### `route_hint_append` 挂载（禁止改 tools schema）

**新导出**（`packages/agent/src/harness/route-hint.ts`）：

```ts
/**
 * 从当前模型 active 版本收集 route_hint_append 文本（去重、保序）。
 * 无 active / 无此类 patch → ''
 */
export function buildHarnessRouteHintAppendix(modelRef: string | null | undefined): string

/**
 * 将 appendix 拼到选型卡字符串末尾（不改 buildRoundRoutePlaybook 的 tools 语义）。
 * appendix 空 → 原样返回 playbook。
 */
export function appendHarnessRouteHintToPlaybook(
  playbook: string,
  appendix: string,
): string
```

**插入点**：`AgentEngine.buildRoundTurnTail`（`engine.ts`）：

```ts
// 现有：
const base = buildTurnTailPrompt({
  sessionClock: buildSessionClockPlaybook(getCurrentTime()),
  routePlaybook: buildRoundRoutePlaybook(plan, activeNames),
})

// 改为：
const modelRef = record?.model ?? null
const routePlaybook = appendHarnessRouteHintToPlaybook(
  buildRoundRoutePlaybook(plan, activeNames),
  buildHarnessRouteHintAppendix(modelRef),
)
const base = buildTurnTailPrompt({
  sessionClock: buildSessionClockPlaybook(getCurrentTime()),
  routePlaybook,
})
```

- `applyOnePatch` 对 `route_hint_append`：**技能叠层仍 soft-skip**（不改 skill body）；真正生效仅在 turn-tail。
- **禁止**修改 `buildRoundRoutePlaybook` 签名去塞副作用；**禁止**改 OpenAI tools JSON schema / frozen tools 列表。

### 16.4 REST API（server）

新建 `apps/server/src/harness-settings-routes.ts`，在 `index.ts` `registerPythonSettingsRoutes` 旁注册。鉴权与 `/api/settings/python` **相同**（本机 sidecar，无额外 token）。

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/settings/harness/versions` | 列表；query `modelRef?` 过滤 `modelBucket`（精确或未设桶时含 `*`） |
| `GET` | `/api/settings/harness/active` | query **`modelRef` 必填**（可传空串表示全局 `*`）；返回解析后的 active 版本或 null |
| `POST` | `/api/settings/harness/rollback` | body `{ modelRef: string }` → 该桶恢复默认 |
| `GET` | `/api/settings/harness/auto-promote` | `{ enabled, updatedAt, envForcedOff? }`（`enabled` 为有效值） |
| `PUT` | `/api/settings/harness/auto-promote` | body `{ enabled: boolean }`；仍可写 store，返回有效状态 |
| `GET` | `/api/settings/harness/audit` | query `limit?`（默认 50，最大 200）只读 |

#### 响应 DTO（前端友好，无内部黑话）

```ts
// GET /versions
{
  versions: Array<{
    id: string
    createdAt: string
    summary: string | null
    modelBucket: string
    tier: 'A' | 'B' | 'C'
    patchCount: number
  }>
}

// GET /active?modelRef=
{
  modelRef: string
  resolvedBucket: string | null   // 实际命中的键：精确 / provider:* / *
  version: null | {
    id: string
    createdAt: string
    summary: string | null
    tier: 'A' | 'B' | 'C'
  }
}

// POST /rollback
{ ok: true, modelRef: string }

// GET|PUT /auto-promote（enabled = 有效状态；env 强制关时 envForcedOff: true）
{ enabled: boolean, updatedAt: string, envForcedOff?: boolean }

// GET /audit
{
  entries: Array<{
    at: string
    action: string
    modelRef?: string
    versionId?: string | null
    detail?: string
  }>
}
```

错误：非法 body → `400` + `{ error: string }`（用户可读短句）；与 python settings 一致。

**client-ui**：`client-ui/src/api/harnessSettings.ts`（或并入现有 settings client）封装上述调用。

### 16.5 自动晋升关停

| 开关 | 优先级 | 行为 |
|------|--------|------|
| env `OPPTRIX_HARNESS_AUTO_PROMOTE=0\|false\|off` | **最高** | 进程内强制关；忽略 store |
| `store.autoPromote.enabled === false` | 次 | 用户关停 |
| 默认 | — | `enabled: true`（migrate 缺省） |

```ts
export function isHarnessAutoPromoteEnabled(): boolean
```

Lab / 定时入口必须先查此函数。

### 16.6 Phase 3 自动晋升

#### 触发入口（硬性）

```ts
// lab.ts — 扩展，保持向后兼容
export interface RunHarnessLabInput {
  reportInput?: BuildWeaknessReportInput
  report?: WeaknessReport
  proposal?: HarnessProposal
  /** @deprecated 用 promote: true | 'manual' | 'auto'；true === 'manual' */
  promote?: boolean | 'manual' | 'auto'
  includeHeldIn?: boolean
  /** 自动/人工晋升写入的模型桶；默认 '*' */
  modelBucket?: string
}

/**
 * promote === 'auto' 时：
 * 1. isHarnessAutoPromoteEnabled() 否则 skip + audit skip_auto_promote
 * 2. validation.ok && !safetyVeto
 * 3. classifyVersionTier(proposal.patches) === 'A' 否则 skip（B/C 不自动）
 * 4. promoteHarnessProposal(..., { source: 'auto', modelBucket })
 *
 * promote === true | 'manual'：不要求 A，不检查 auto 开关（人工）
 *
 * 默认不在 engine.chat / tools handler 调用本函数。
 */
```

可选脚本：`scripts/harness-lab-auto.mjs`（或 `npm run harness:lab`）调用 `runHarnessLab({ promote: 'auto', ... })`；**不**注册为 chat tool。

#### A/B/C 判定

| Tier | Patch kinds | 自动晋升 |
|------|-------------|---------|
| **A** | 仅 `skill_body_append`、`route_hint_append` | 可（held-out+安全闸+开关） |
| **B** | 含 `skill_body_replace_span` | **仅人工** `promote: 'manual'` |
| **C** | 本期无写入；未来核心底线类 | **永不自动** |

### 16.7 UI（设置）

#### 挂载位置

- **不**新增侧栏一级：挂在现有 **`models`（大模型）** 分区底部独立分组，或 `general` 下「分析习惯」——**推荐 `models`**（与模型选择同页）。
- 组件：`client-ui/src/pages/settings/ModelHarnessHabitsSection.tsx`
- 注册：`SettingsPage.tsx` 在 `section === 'models'` 渲染区追加；`settingsSearchIndex` 增加可搜条目。

#### 文案草案（`ui-copy-standard`）

| 槽位 | 文案 |
|------|------|
| 分区标题 | 此模型的分析习惯 |
| 说明 | 习惯版本来自本地已晋升的分析跑法；下方开关只控制离线合入是否允许。安全底线不会改。 |
| 模型选择器标签 | 当前模型 |
| 版本行（有 active） | 当前习惯版本 · {相对时间或短 id} |
| 版本行（无） | 正在使用默认习惯 |
| 主按钮 | 恢复默认习惯 |
| 开关 | 允许离线自动合入 |
| 开关说明 | 关闭后，离线实验室不会自动合入新习惯；你仍可手动恢复默认。 |
| 开关（env 强制关） | 当前环境已关闭自动合入；偏好仍可保存，但不会生效。（Switch disabled） |
| 空态 | 还没有为此模型保存过分析习惯。本地已晋升的跑法会出现在这里。 |
| 加载 | 正在加载分析习惯… |
| 错误 | 暂时无法加载分析习惯。请稍后重试。 |
| 确认标题 | 恢复默认习惯？ |
| 确认正文 | 将清除此模型的自定义分析习惯，之后按默认方式分析。此操作可再通过新习惯更新覆盖。 |
| 确认主按钮 | 恢复默认 |
| 成功 toast | 已恢复默认习惯 |
| 审计只读（可选折叠） | 最近更新记录 |

**禁止**：Self-Harness、Harness、API、MCP、prompt、回归、held-out、patch、tier。

#### 交互

- 恢复默认：`useOpptrixDialogAlert` / `OpptrixDialogAlert`，`confirmTone="danger"`。
- 开关：写 `PUT auto-promote`；失败 toast，本地回滚 Switch。
- 模型列表：复用 `/models/available`；默认选中当前默认模型。

### 16.8 考题扩容（≥24，无 LLM 裁判）

扩展 `ExamCategory`：

```ts
export type ExamCategory =
  | 'data_fetch'
  | 'spin_guard'
  | 'seminar_delivery'
  | 'safety'
  | 'collaboration'   // 新增：协作去重 / 收口
```

目标结构（合计 **≥24**，held-in / held-out **尽量 1:1**）：

| Category | held_in | held_out | 合计建议 |
|----------|---------|----------|----------|
| data_fetch | 3 | 3 | 6 |
| spin_guard | 2 | 2 | 4 |
| seminar_delivery | 2 | 2 | 4 |
| safety | 2 | 2 | 4 |
| collaboration | 3 | 3 | 6 |
| **合计** | **12** | **12** | **24** |

协作题判据示例（结构）：`forbidAssistantPatterns` 重复委派话术；或 `requireAnyTool` 含 `run_subagent` / 禁止无 `list_jobs` 的盲目重开——以现有 tool 名为准，仍用 `ExamRunTrace` 样本，**无网络无 LLM**。

`CATEGORY_TO_CODES` 为 `collaboration` 映射合适 `WeaknessCode`（或新增 taxonomy 码，须同步 weakness-report）。

### 16.9 测试矩阵（必测）

| 文件 | 场景 |
|------|------|
| `tests/harness-local-store-migrate.test.mjs` | v1→v2 幂等；`activeByModel['*']=activeVersionId`；二次 migrate 稳定；audit 裁剪 200 |
| `tests/harness-model-bucket.test.mjs` | 解析顺序 modelRef → provider:\* → \* → null；精确优先于通配；无 active 恒等 |
| `tests/harness-route-hint-turn-tail.test.mjs` | active 含 `route_hint_append` 时 `appendHarnessRouteHintToPlaybook` / turn-tail 快照含附录；无 active 与基线快照一致 |
| `tests/harness-auto-promote.test.mjs` | A+ok+开关开 → promote_auto；B 不自动；开关关 / env 关 → skip；audit 记录 |
| `tests/harness-exam-lab.test.mjs` | 考题 ≥24；held-in/out 均衡；各 category 至少 1；安全否决仍红 |
| `tests/harness-settings-api.test.mjs`（或 server 集成） | REST list/active/rollback/auto-promote/audit；非法 modelRef/body 400 |
| UI | **不强制** e2e；`check:ui` 类型过即可 |

### 16.10 文档同步（实现时）

| 改动 | 文档 |
|------|------|
| REST | `docs/API.md` |
| Agent 行为 / lab | `docs/AGENT-GUIDE.md` |
| 本节落地后 | 更新本文件修订记录 + Phase 状态为「已落地」 |

### 16.11 DAG 实现顺序

```
S0 类型 + migrate v2 + resolveActive* + classifyTier + audit 裁剪
    ↓
S1 getActiveForModel + apply overlay 接 modelRef（ALS）+ 兼容无参
    ↓
S2 route_hint：buildHarnessRouteHintAppendix + engine turn-tail 挂载
    ↓
S3 promote/rollback 按桶 + lab promote 'auto'|'manual' + 关停
    ↓
S4 REST harness-settings-routes + client api
    ↓
S5 考题扩容 ≥24 + CATEGORY collaboration
    ↓
S6 UI ModelHarnessHabitsSection（models 分区）
    ↓
S7 测试矩阵全绿 + API.md / AGENT-GUIDE 同步
```

可并行：S5 与 S4；S6 依赖 S4。

### 16.12 Non-goals（本阶段明确不做）

- 云端共享跑法仓 / 跨设备同步
- 治理台完整弱点榜 UI
- 会话级临时补丁（不晋升）
- LLM-as-judge / 在线打考题
- 自动晋升 B/C；改 Layer0 / spin 核心 / tools 冻结
- mid-conversation 热切换 active（仅冷启动/新轮 turn-tail 读仓；进行中 tools 集不变）
- 聊天工具暴露 `runHarnessLab`

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-08-16 | Phase 2/3 **REST + 设置「此模型的分析习惯」UI** 落地：`/api/settings/harness/*`、`ModelHarnessHabitsSection`、API.md |
| 2026-08-16 | Phase 2/3 **核心落地**：formatVersion 2、`activeByModel`、ALS 叠层、route_hint→turn-tail、lab auto 闸、考题≥24；UI/REST 另轨 |
| 2026-08-16 | **§16 Phase 2/3 工程契约**：formatVersion 2、模型分桶、REST、route_hint 挂载、自动晋升 A、考题≥24、测试矩阵、DAG |
| 2026-08-16 | 关闭 §13 开放问题；路线图 Phase 2/3 规格已定 |
| 2026-08-16 | Phase 1 落地：离线考题 / 模板提案 / held-out 验证 / 本地仓 promote·rollback·迁移 / 技能正文冷启动叠层 |
| 2026-08-16 | Phase 0 只读库落地：`buildWeaknessReport` / 测试 / 文档 |
| 2026-08-16 | 初稿：产品级目标、范围、阶段、指标与开放问题 |
