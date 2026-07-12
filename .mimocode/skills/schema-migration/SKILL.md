---
name: schema-migration
description: >-
  Hard rules for SQLite schema changes and backward compatibility — register
  migration steps, idempotent upgrades, dual-read, tests. Use when editing
  store/schema packages or local user data formats.
---

# 向后兼容与 SQLite Schema 迁移（硬性）

**禁止断代**：已发布客户端升级后仍须能打开、读数据、逐步迁移；不得因 schema/架构/配置变更导致数据丢失、白屏、无法启动或无法更新。

## 适用包

| 包 | 入口 |
|---|---|
| `packages/market-data` | `schema-migrate.ts`、`schema.ts`、`instrument-ns.ts` |
| `packages/market-data-store` | `SCHEMA_VERSION`、`MIGRATION_SQL` |
| `packages/user-store` | `store.ts`（`meta`、`migrateFromLegacyFiles`） |
| `packages/news-feed` | `store.ts`（`ensureMigrated`） |

总原则原文：`.cursor/rules/backward-compatibility.mdc`。

## 必须遵守

1. **可升级路径**：启动自动检测旧格式，**幂等**迁移；`meta` / `SCHEMA_VERSION` 记录步骤
2. **双读 / 双写（过渡期）**：读优先新格式，回退旧格式
3. **只增不破**：优先 `ALTER` / 新表 + 回填；禁止无迁移 DROP/重命名列
4. **失败可重试**：`up` 后校验失败 → 不写完成标记；保留原数据
5. **跨版本客户端**：旧客户端连新 server 可解析；新客户端连旧 server 有降级或明确错误
6. **自动更新不断链**：改更新源须保证旧版至少能升到过渡版
7. **数据层替换**：映射旧 capability/路径或提供 import/migrate

## market-data 新增 v(N+1)

1. `schema.ts`：`SCHEMA_VERSION += 1`，追加 `MIGRATION_V(N+1)_SQL`
2. `schema-migrate.ts`：注册 `{ version, description, isApplied, up }`
3. `isApplied`：用可观测结构（表/列/视图），勿仅信 `schema_meta`
4. 复杂回填放独立模块；读写过渡期双读

**`MIGRATION_STEPS.length === SCHEMA_VERSION`**。

## 必须加的测试

| 场景 | 做法 |
|---|---|
| 跨版本跃迁 | seed 到上一版，打开后断言版本与数据保留 |
| 幂等 | 最新库连续 `migrate` 两次 |
| 部分失败恢复 | 半迁移库再次打开须补齐 |
| 注册表一致 | 步数 = SCHEMA_VERSION，version 连续 |

范本：`tests/instruments-composite-key.test.mjs`。

## 禁止

- 改 schema/JSON 不写迁移，依赖用户删库
- 重命名 key/namespace 无兼容层
- 仅新版本写数据、旧版本打开空/崩溃
- 更换更新 URL 后旧包永久无法更新且无说明
- 「开发环境清库即可」作为已发布用户方案

## 改动自检

- [ ] 已注册 `up` + `isApplied`，版本已 bump
- [ ] 从至少一个旧版本跃迁测试通过
- [ ] 幂等 +（若适用）部分失败恢复
- [ ] 双读/双写或文档声明弃用下限
- [ ] 无法自动迁移时 PR + Release 写清手动步骤

原文：`.cursor/rules/schema-migration.mdc`、`backward-compatibility.mdc`。
