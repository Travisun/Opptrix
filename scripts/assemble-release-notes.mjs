#!/usr/bin/env node
/**
 * 组装 GitHub Release 正文：更新日志 + 各平台安装说明。
 * 用法：node scripts/assemble-release-notes.mjs [version]
 * 默认 version 读取 apps/desktop/package.json。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function readVersion() {
  const arg = process.argv[2]?.trim()
  if (arg) return arg
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/desktop/package.json'), 'utf8'),
  )
  return String(pkg.version ?? '').trim()
}

function readChangelog(version) {
  const changelogPath = path.join(root, 'docs/releases', `${version}.md`)
  if (!fs.existsSync(changelogPath)) {
    if (process.env.OPPTRIX_RELEASE_STRICT === '1') {
      console.error(`缺少更新日志：docs/releases/${version}.md`)
      process.exit(1)
    }
    return [
      '> ⚠️ 本版本未提交 `docs/releases/' + version + '.md` 更新日志。',
      '> 发版前应撰写「新功能」「修复」清单并提交仓库。',
    ].join('\n')
  }
  const text = fs.readFileSync(changelogPath, 'utf8').trim()
  if (!text.includes('## 新功能') || !text.includes('## 修复')) {
    if (process.env.OPPTRIX_RELEASE_STRICT === '1') {
      console.error(`更新日志须包含「## 新功能」与「## 修复」两节：docs/releases/${version}.md`)
      process.exit(1)
    }
  }
  return text
}

function installSection(version) {
  return `### macOS 安装说明
- **Apple Silicon (M 系列)** 下载 \`Opptrix-${version}-MacOS-arm64-M-CPU.dmg\`
- **Intel Mac** 下载 \`Opptrix-${version}-MacOS-x64-Intel-CPU.dmg\`
- 若提示「已损坏，无法打开」（未签名/dev 包常见），在终端执行后重新打开：
  \`\`\`bash
  xattr -cr /Applications/Opptrix.app
  \`\`\`
- 或在 Finder 中 **右键 → 打开** 一次

### Windows
运行 \`Opptrix-${version}-Windows.exe\`；未签名包可能触发 SmartScreen，选「仍要运行」

### Linux
\`chmod +x Opptrix-${version}-Linux.AppImage && ./Opptrix-${version}-Linux.AppImage\``
}

const version = readVersion()
if (!version) {
  console.error('无法确定版本号')
  process.exit(1)
}

const changelog = readChangelog(version)
const body = [
  `## Opptrix Desktop ${version}`,
  '',
  changelog,
  '',
  installSection(version),
  '',
].join('\n')

process.stdout.write(body)
