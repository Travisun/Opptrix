---
name: desktop-release
description: >-
  Desktop release hard checklist: version bump, release notes, onboarding
  activation, git tags desktop-v, CI. Also covers onboarding flow activation
  parameters. Use before any desktop publish, tag, or version bump.
---

# 桌面端发版 + Onboarding 激活（硬性）

用户要求 **发布桌面版、打标签、bump 版本、推送 `desktop-v*`** 时，**必须**按本 skill 与 `docs/DESKTOP-RELEASE.md` **逐步完成**，不得跳过。

配套：skill `schema-migration`（兼容）；原文 `.cursor/rules/desktop-release.mdc`、`onboarding.mdc`。

## 执行顺序

1. **先 Read** 本 skill + `docs/DESKTOP-RELEASE.md` §4–§9 + `docs/releases/README.md` + onboarding 节
2. 建立任务清单展开 Phase A–F，逐项验证
3. 每项附证据（命令输出 / 字段值）
4. 本地构建 / `check:ui` / **`audit:desktop-pack`** 能跑则跑；失败禁止打标签
5. 打标签前向用户汇报；未明确「直接发布」则待确认
6. **禁止**：未改 version / 未写更新日志 / 未跑通打包预检 / 标签与 version 不一致就 tag

## 更新日志（硬性）

| 项 | 说明 |
|----|------|
| 路径 | `docs/releases/{version}.md`（= `apps/desktop/package.json` version） |
| 模板 | `docs/releases/TEMPLATE.md` |
| 必需 | `## 新功能`、`## 修复`（无内容写 `- 无`） |
| 文风 | 面向投资者；避免内部文件名/PR 号 |
| 组装 | `node scripts/assemble-release-notes.mjs {version}` / `npm run release:notes` |
| CI | `OPPTRIX_RELEASE_STRICT=1`；缺文件或缺章节 → 失败 |
| 提交 | 日志须与 version bump **一并 commit push**，再打标签 |

## Phase A — 代码就绪

| # | 检查项 |
|---|--------|
| A1 | 目标分支、工作区干净；与用户确认范围 |
| A2 | 含 client-ui → `npm run check:ui` = 0 |
| A3 | 含 packages/server → `npm run build:packages` |
| A4 | `npm run build -w opptrix-client` 冒烟 |
| **A5** | **`OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop` = 0**（硬性） |

## Phase B — 版本 / 日志 / onboarding

| # | 检查项 |
|---|--------|
| B1 | `apps/desktop/package.json` version 已 bump（真源） |
| B2 | 发 Web UI 则 bump `client-ui/package.json` version |
| B3 | `ONBOARDING_RELEASE_BY_VERSION` 匹配新版本前缀 |
| B4 | 改版引导 → 两处同步 bump `ONBOARDING_FLOW_VERSION` |
| B5 | 协议变更 → 两处同步 bump `LEGAL_AGREEMENTS_VERSION` |
| B6 | `docs/releases/{version}.md` 存在且 assemble 退出 0 |
| B7 | 相关变更已 commit |

## Phase C — 兼容（按需）

C1 schema/存储迁移；C2 API 双读/版本化；C3 更新源不断链；C4 日志覆盖用户可见修复；C5 Electron 升级说明；**C6** Windows 更新签名 secrets + 内置 CA；**C7** sidecar `deps/` + updater nested `fs-extra`。

## Phase D — 打标签前

| # | 检查项 |
|---|--------|
| D1 | 标签 `desktop-v{version}` = package.json version |
| D2 | 标签尚不存在 |
| D3 | `docs/releases/{version}.md` 已在远程 main |
| D4 | 已向用户汇报 A–C |

```bash
node -p "require('./apps/desktop/package.json').version"
OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop
OPPTRIX_RELEASE_STRICT=1 node scripts/assemble-release-notes.mjs "$(node -p "require('./apps/desktop/package.json').version")" | head -30
git push origin main
git tag desktop-vX.Y.Z
git push origin desktop-vX.Y.Z
```

## Phase E — CI（推送后）

E1 workflow 成功；E2 三端产物 + `latest-*.yml`；E3 `audit-desktop-pack` + `verify-packaged-updater` + `verify-packaged-runtime`；E4 Release 正文；E5 R2；E6 Windows Authenticode（自签或商业）。**禁止**手动改名产物或 yml 内 url/version。

## Phase F — 冒烟（建议）

旧版→检查更新→新版；onboarding 按预期；登录/LLM/行情/聊天可用。

## 打包不变量（勿回归）

| 坑 | 要求 |
|----|------|
| EB 跳过顶层 `node_modules` | sidecar → `runtime-stage/deps/`；updater → `build/updater-deps/packages/` |
| nested `fs-extra` | `stage-updater-deps` 从 parent 解析；桌面包直接依赖 `fs-extra` |
| Windows 自签更新 | 内置根 CA + `update-signature` 自定义验签；旧客户端需手动装一次 |
| 预检门禁 | `ci.yml` / `release-desktop.yml` / `prebuild` 均跑 `audit-desktop-pack` |

---

# 启动引导（Onboarding）激活

状态：`preference-store` → `onboarding_state`（`GET/PUT /api/preferences/onboarding_state`）。

## 步骤顺序（勿擅自调整）

1. 介绍 — `OnboardingIntroCarousel`
2. 模型 — `ProviderWizard`
3. 行情 — `OnboardingDataList`
4. 协议 — `OnboardingLegalPanel`；链接 `openExternalUrl`

## 发版激活决策表

| 目的 | 必须更新 | 触发 |
|------|---------|------|
| 常规版本发布 | 桌面 `version` +（Web）client-ui `version` + `ONBOARDING_RELEASE_BY_VERSION` | lastCompletedVersion ≠ 当前版本 |
| 仅改版引导 | 两处 bump `ONBOARDING_FLOW_VERSION` | flow 版本不一致 |
| 协议变更 | 两处 bump `LEGAL_AGREEMENTS_VERSION` + aboutLinks | agreements 版本不一致 |
| 首次安装 | — | 无 completedAt |

**只改文案不 bump 任何参数 → 老用户不会重走引导。**

## 双写同步（硬性）

以下两文件必须完全一致：

- `packages/shared/src/onboarding.ts`
- `client-ui/src/onboarding/constants.ts`

同步项：`ONBOARDING_STATE_KEY`、`LEGAL_AGREEMENTS_VERSION`、`ONBOARDING_FLOW_VERSION`、`OnboardingState`、`shouldShowOnboarding` / `normalizeAppVersion`。

`client-ui` **禁止**从 `@opptrix/shared` **主入口**导入（会拖入 `node:path` 导致 Vite 白屏）。

## 本地重置引导

```bash
curl -sS -X PUT 'http://127.0.0.1:8711/api/preferences/onboarding_state' \
  -H 'Content-Type: application/json' \
  -d '{"value":null}'
```

## 禁止

- 未 Read 本规则与用户确认就 push 标签
- 未撰写 `docs/releases/{version}.md` 就打标签
- **跳过 `audit:desktop-pack`** 就打标签
- 硬编码引导文案不进 `manifest.ts`
- 只改 shared 不同步 client-ui constants
- 跳过 preference 持久化；协议步 iframe 内跳转代替系统浏览器

快速命令：

```bash
node -p "require('./apps/desktop/package.json').version"
npm run release:notes
OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop
npm run build:packages && npm run check:ui && npm run build -w opptrix-client
git tag -l 'desktop-v*' --sort=-v:refname | head
gh release view desktop-vX.Y.Z
```
