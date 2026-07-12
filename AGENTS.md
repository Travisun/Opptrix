# Opptrix — Agent 工程规则

> 源：`.cursor/rules/`（Cursor 侧规则）。本文件由 MiMoCode 自动注入 system instructions。
> 细则按场景在 `.mimocode/skills/`；动手前 `skill` 加载对应 skill，或 Read 原文 `.cursor/rules/*.mdc`。

## Important（硬性 · 全仓库）

1. **禁止断代**：schema、用户数据、Hub/API、更新源变更须 **兼容 + 幂等迁移**。细则 → skill `schema-migration` / `.cursor/rules/backward-compatibility.mdc`。
2. **探索再改**：凡了解代码库 / 查实现 / 找符号 / 跟调用链 / 评估影响 — **必须先 CodeGraph**，禁止会话开始就 Glob/Grep/Read 全库扫。细则 → skill `codegraph`。
3. **桌面发版**：用户要求发布 / 打 `desktop-v*` 前，**必须先**加载 skill `desktop-release`（或 Read `.cursor/rules/desktop-release.mdc`），撰写 `docs/releases/{version}.md`，Checklist Phase A–D 完成前不得 push 标签。
4. **增量改动**：按用户最新指示做最小 diff；不顺手重构；用户已确认的 UI 行为勿擅自改。
5. **client-ui 收尾**：改动 `client-ui/**` 后跑 `npm run check:ui`，三项全 0 再宣告完成。

## 场景索引（动手前加载）

| 场景 | Skill / 规则 | 关键文档 |
|------|-------------|---------|
| 探索代码 / 定位符号 | `codegraph` | `.cursor/rules/codegraph.mdc` |
| 改 `client-ui` | `client-ui` | `docs/UI-DESIGN-SYSTEM.md`、`docs/UI-LAYOUT.md` |
| 桌面发版 / 打标签 / bump | `desktop-release` | `docs/DESKTOP-RELEASE.md`、`docs/releases/` |
| 引导 / onboarding 激活 | `desktop-release`（含 onboarding 节） | `.cursor/rules/onboarding.mdc` |
| SQLite / 本地用户数据 | `schema-migration` | `.cursor/rules/backward-compatibility.mdc` |
| 行情 / Hub / 研究 API | `data-layer` | `docs/PROVIDER-STANDARD-API.md`、`docs/DATA-LAYER.md` |
| Provider 实现 / 自定义方法文档 | `provider-docs` | `.cursor/rules/provider-standard-api.mdc`、`data-provider-docs.mdc` |

## CodeGraph 优先（摘要）

本仓库索引在 `.codegraph/`（**100% 本地**）。

优先级：`codegraph explore` / MCP `codegraph_explore` → Read 具体文件 → 极窄 Grep/Glob。

```bash
export PATH="$HOME/.local/bin:$PATH"
codegraph explore "<问题或符号>"
codegraph status
```

允许跳过：已定位只需改具体行；无索引；刚改未同步的单文件；非代码（env/锁/日志）。

涉及行情/数据拉取时，探索目标须含 `queryInstrumentData`、`InstrumentDataCapability`；不得跳过标准层直连 Provider。

## 数据层（摘要）

- **唯一标准入口**：`engine.queryInstrumentData(ref, capability, opts?)`
- 扩展顺序：复用 capability → 扩 `instrument-query.ts` → 扩 Provider 标准方法 → 最后才 `invokeCustomMethod` + 文档登记
- **禁止** Hub / client-ui / Agent 主路径新增 `de.realtime()` / 直连第三方行情 URL
- 腾讯 ETF 基金自定义方法（`invokeCustomMethod("tencent", ...)`）：`tencentFundProfile`（基金档案+溢价率）、`tencentFundAsset`（资产配置+持仓）、`tencentFundRankInfo`（业绩排名）、`tencentFundNavHistory`（全量历史净值）、`tencentEtfKline`（ETF 专用 K 线）、`tencentFundNotice`（公告）、`tencentSameTypeFunds`（同类基金）、`tencentSameSeriesFunds`（同系基金）。标准能力 `etfProfile`/`etfNav`/`etfHoldings` 已增强。

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

## 向后兼容 / Schema（摘要）

- 可升级路径：启动自动检测 + **幂等**迁移；`meta` / `SCHEMA_VERSION` 记录步骤
- 只增不破：优先 `ALTER` / 新表 + 回填；禁止无迁移 DROP/重命名
- 失败可诊断、保留原数据；禁止「失败就删库」作为唯一路径
- market-data：`MIGRATION_STEPS.length === SCHEMA_VERSION`；每版须跨版本跃迁 + 幂等测试

## 桌面发版（摘要）

1. Read `desktop-release` skill + `onboarding` 细则 + `docs/DESKTOP-RELEASE.md`
2. Phase A 代码就绪（`check:ui` / `build:packages`）
3. Phase B bump `apps/desktop/package.json` version；写 `docs/releases/{version}.md`（`## 新功能` + `## 修复`）；更新 `ONBOARDING_RELEASE_BY_VERSION`
4. Phase C 兼容性；Phase D 用户确认后 `git tag desktop-v{version}` + push
5. **禁止**未写更新日志 / 未对齐 version 就打标签

引导激活：只改文案不 bump `version` / `ONBOARDING_FLOW_VERSION` / `LEGAL_AGREEMENTS_VERSION` → 老用户**不会**重走引导。`shared/onboarding.ts` 与 `client-ui/.../constants.ts` 必须双写同步。

## 原文与扩展

| Cursor 规则 | 路径 |
|------------|------|
| 索引 | `.cursor/rules/rules-index.mdc` |
| CodeGraph | `.cursor/rules/codegraph.mdc` |
| 兼容 | `.cursor/rules/backward-compatibility.mdc` |
| Schema | `.cursor/rules/schema-migration.mdc` |
| client-ui | `.cursor/rules/client-ui-guidelines.mdc` |
| 收尾验证 | `.cursor/rules/post-edit-verification.mdc` |
| 浮层组件 | `.cursor/rules/ui-overlay-components.mdc` |
| 数据层 | `.cursor/rules/data-layer-standard-api.mdc` |
| Provider | `.cursor/rules/provider-standard-api.mdc` |
| Provider 文档 | `.cursor/rules/data-provider-docs.mdc` |
| 桌面发版 | `.cursor/rules/desktop-release.mdc` |
| Onboarding | `.cursor/rules/onboarding.mdc` |

MCP（Cursor）：`.cursor/mcp.json` → codegraph。MiMo 侧可在 `.mimocode/mimocode.jsonc` 或 `mimo mcp add` 配置同等服务。
