# 桌面端更新日志（Release Notes）

GitHub Release 页面正文由 **`docs/releases/{version}.md`** 与安装说明自动组装（见 `scripts/assemble-release-notes.mjs`、CI `release-desktop.yml`）。

`{version}` 必须与 `apps/desktop/package.json` 的 `version` **完全一致**（含 `-dev.N` 预发布号）。

## 发版前必做

1. 复制 [`TEMPLATE.md`](./TEMPLATE.md) 为 `{version}.md`（例如 `0.6.1.md`）
2. 填写 **新功能**、**修复** 两节（面向投资者/用户，简要条目即可；某节无内容可写 `- 无`）
3. 与 `client-ui/src/onboarding/manifest.ts` 的 `ONBOARDING_RELEASE_BY_VERSION` 亮点保持一致（引导偏价值句，此处偏变更清单）
4. **commit 并 push 到 main 后再打** `desktop-v{version}` 标签

## 本地预览 Release 正文

```bash
node scripts/assemble-release-notes.mjs 0.6.1
# 或读取 package.json 当前版本
npm run release:notes
```

CI 创建 Release 时设置 `OPPTRIX_RELEASE_STRICT=1`，**缺少更新日志文件或缺少必需章节会导致 workflow 失败**。

## 维护规则

细则见 [`.cursor/rules/desktop-release.mdc`](../../.cursor/rules/desktop-release.mdc) Phase B7、E4。
