/**
 * 公共复用区布局 — packages / data / docs + README 模板。
 * clearSession 只删 sessions/<id>，永不删除 shared。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDirectory } from './path-gate.js'
import { resolveSharedWorkspaceRoot } from './paths.js'

const SHARED_README = `# Opptrix Agent 公共复用区

跨对话共享的代码包、离线数据与文档。会话结束不会清理本目录。

## 目录

| 路径 | 用途 |
|------|------|
| \`packages/<name>/\` | 可复用脚本/包（须含 README） |
| \`data/dumps/\` | 扶摇 Parquet 等离线大数据（经 prepare_fuyao_dump） |
| \`data/exports/\` | 导出 CSV/JSON 等结果 |
| \`data/cache/\` | 可删中间缓存 |
| \`docs/\` | 公共约定与 API 摘要（含 \`package-readme-template.md\`） |

## 包 README 模板

完整模板见 \`docs/package-readme-template.md\`；新建 \`packages/<name>/\` 时复制并改写。

每个 \`packages/<name>/\` 须含 README.md：

1. **目的**（一句话）
2. **入口**（CLI / 主函数）
3. **入参 / 出参**
4. **依赖**（npm / pip）
5. **最小示例**
6. **勿存密钥**

## 编程协议（摘要）

1. \`list_local_data_apis\` → \`get_local_data_catalog\` 了解能力
2. 扫 \`packages/*/README\`，能复用则复用
3. 缺依赖先 \`shell_install\`（npm/pip），勿盲造
4. 最后自写；可复用产物写入 \`packages/<name>/\` + README
5. 离线大数据 → \`prepare_fuyao_dump\`；行情优先标准工具，勿平行造数据源
6. 沙盒无 TOKEN/API_KEY；扶摇仅经 \`prepare_fuyao_dump\`
7. 需局域网 → \`ask_user\` / \`request_session_lan_access\`（本对话授权）
`

const PACKAGE_README_TEMPLATE = `# 包名

## 目的

（一句话说明本包做什么）

## 入口

\`\`\`bash
# 示例
node src/main.js
# 或
python -m src.main
\`\`\`

## 入参 / 出参

| 参数 | 类型 | 说明 |
|------|------|------|
| … | … | … |

## 依赖

- npm: …
- pip: …

## 最小示例

\`\`\`js
// …
\`\`\`

## 注意

- 勿将 API Key / Token 写入本目录或代码
`

let ensuredRoots = new Set<string>()

/** 幂等初始化 shared 目录树与 README */
export async function ensureSharedWorkspaceLayout(): Promise<string> {
  const root = resolveSharedWorkspaceRoot()
  if (ensuredRoots.has(root)) return root

  await ensureDirectory(root)
  await ensureDirectory(path.join(root, 'packages'))
  await ensureDirectory(path.join(root, 'data', 'dumps'))
  await ensureDirectory(path.join(root, 'data', 'exports'))
  await ensureDirectory(path.join(root, 'data', 'cache'))
  await ensureDirectory(path.join(root, 'docs'))

  const readmePath = path.join(root, 'README.md')
  try {
    await fs.access(readmePath)
  } catch {
    await fs.writeFile(readmePath, SHARED_README, 'utf8')
  }

  const templatePath = path.join(root, 'docs', 'package-readme-template.md')
  try {
    await fs.access(templatePath)
  } catch {
    await fs.writeFile(templatePath, PACKAGE_README_TEMPLATE, 'utf8')
  }

  ensuredRoots.add(root)
  return root
}

export function resetSharedWorkspaceLayoutCacheForTests(): void {
  ensuredRoots = new Set()
}

export function sharedDumpsDir(): string {
  return path.join(resolveSharedWorkspaceRoot(), 'data', 'dumps')
}
