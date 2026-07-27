# 远程专家市场静态目录

本目录托管 Opptrix **官方专家市场**的静态 JSON，发布到 `https://update.opptrix.org/experts/`（Cloudflare R2 + CDN）。

## 文件结构

| 文件 | 说明 |
|------|------|
| `catalog.json` | 列表索引；`experts[]` **不含** `persona` |
| `{id}.json` | 单条完整 `ExpertDefinition`（含 persona、defaultPacks 等） |
| `README.md` | 本说明 |

当前内置 5 条官方专家（与 `packages/agent/src/experts/catalog.mock.json` 一致，供离线 fallback）。

## 字段说明

列表项（`catalog.json` 与各 `{id}.json` 的元数据部分）：

- `id` — 小写开头，仅 `a-z0-9_-`，最长 64 字符
- `title` / `summary` — 展示用
- `icon` — `{ "kind": "emoji"|"icon", "value": "..." }`
- `tags` — 最多 8 个，去重
- `official` — 官方条目为 `true`
- `source` — 官方远程为 `"builtin"`
- `version` — 如 `"1.0.0"`

详情文件额外必填：

- `persona` — 技能专长，1–4000 字，不得命中注入拦截模式（见 `docs/EXPERT-GUIDE.md` §3）
- `defaultPacks` — 合法 Tool Pack id 数组
- `defaultResearchTier` — `"L1"` / `"L2"` / `"L3"`
- `complianceVersion` — 当前固定 `"1"`
- `defaultSessionTitle` — 可选

完整 JSON Schema：`packages/agent/src/experts/schemas/`。

## 新增专家

1. 新增 `experts/{id}.json`（完整定义，`official: true`，`source: "builtin"`）
2. 在 `catalog.json` 的 `experts` 数组追加**同 id 的元数据**（**不要**写 `persona`）
3. 本地校验：`node scripts/validate-experts.mjs`
4. 合并到 `main` 后 CI 自动同步 R2（见下）
5. （可选）同步更新 `packages/agent/src/experts/catalog.mock.json` 作为离线 fallback

## 本地校验

```bash
node scripts/validate-experts.mjs
```

校验项：id 唯一、catalog 与详情元数据一致、详情含合法 persona、无孤儿 JSON 文件。

## CI 同步到 R2

| 触发 | Workflow | 行为 |
|------|----------|------|
| `push` → `main`，且 `experts/**` 变更 | `.github/workflows/sync-experts.yml` | purge `experts/` 前缀 + 上传全部 `*.json` + CDN purge |
| 桌面发版 `release-desktop.yml` | 旁路 job | 仅当本次 tag 相对上一 tag 含 `experts/**` 变更时执行同一脚本 |

脚本：

- `apps/desktop/scripts/sync-experts-to-r2.mjs` — **仅**操作 R2 前缀 `experts/`，**禁止**动 `desktop/`
- `apps/desktop/scripts/purge-experts-cdn-cache.mjs` — purge `catalog.json` 与各 `{id}.json` 的 CDN URL

公开 URL 示例：

- `https://update.opptrix.org/experts/catalog.json`
- `https://update.opptrix.org/experts/macro-strategy.json`

## 与客户端 fallback 的关系

运行时 `ExpertCatalogService` 优先拉取远程目录（`StaticHttpExpertProvider`）；网络失败或未配置时降级到包内 `catalog.mock.json`（`LocalJsonExpertProvider`）。用户自建专家仍存本地 user-store，与远程目录合并展示。

环境变量（可选覆盖远程根 URL）：

```bash
OPPTRIX_EXPERT_CATALOG_BASE_URL=https://update.opptrix.org/experts
```
