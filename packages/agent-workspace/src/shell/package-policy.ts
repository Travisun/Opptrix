import path from 'node:path'
import { WorkspaceError } from '../errors.js'

const ALLOWED_BINARIES = new Set([
  'python',
  'python3',
  'node',
  'npm',
  'npx',
  'pip',
  'pip3',
])

const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+(-[^\s]*\s+)*-[^\s]*r[^\s]*f[^\s]*\s+\//i,
  /\brm\s+(-[^\s]*\s+)*-[^\s]*f[^\s]*r[^\s]*\s+\//i,
  /\bformat\b/i,
  /\bdiskpart\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bsudo\b/i,
  /\bsu\s+-/i,
  /\bchmod\s+(-[^\s]*\s+)*777\b/i,
  /\bcurl\b[^\n|]*\|\s*(ba)?sh\b/i,
  /\bwget\b[^\n|]*\|\s*(ba)?sh\b/i,
]

const GLOBAL_INSTALL_FLAGS = new Set([
  '-g',
  '--global',
  '--user',
  '--system',
])

export function basenameOfArgv0(argv: string[]): string {
  const raw = argv[0]?.trim()
  if (!raw) return ''
  const base = path.basename(raw.replace(/\\/g, '/'))
  if (base.endsWith('.exe')) return base.slice(0, -4).toLowerCase()
  return base.toLowerCase()
}

export function assertAllowedShellArgv(argv: string[]): void {
  if (!argv.length || !argv[0]?.trim()) {
    throw new WorkspaceError('命令不能为空')
  }
  const bin = basenameOfArgv0(argv)
  if (!ALLOWED_BINARIES.has(bin)) {
    throw new WorkspaceError(`不允许运行「${bin || argv[0]}」；仅支持 python/node/npm/pip 等解释器与包管理器`)
  }
  const joined = argv.join(' ')
  for (const re of DANGEROUS_PATTERNS) {
    if (re.test(joined)) {
      throw new WorkspaceError('该命令存在安全风险，已被拒绝')
    }
  }
}

export function commandNeedsNetwork(argv: string[]): boolean {
  const bin = basenameOfArgv0(argv)
  const rest = argv.slice(1).map(a => a.toLowerCase())
  if (bin === 'pip' || bin === 'pip3') {
    return rest.includes('install') || rest.includes('download')
  }
  if (bin === 'npm' || bin === 'npx') {
    return rest.includes('install') || rest.includes('ci') || rest.includes('update')
  }
  if (bin === 'node' && rest[0] === '-e') return false
  return false
}

export function assertPackageInstallPolicy(
  argv: string[],
  cwdAbs: string,
  grantRootAbs: string,
): string[] {
  const bin = basenameOfArgv0(argv)
  if (bin !== 'pip' && bin !== 'pip3' && bin !== 'npm' && bin !== 'npx') {
    return argv
  }

  const lowerArgs = argv.map(a => a.toLowerCase())
  const installIdx = lowerArgs.findIndex(a =>
    a === 'install' || a === 'ci' || a === 'update',
  )
  if (installIdx < 0) return argv

  for (const flag of GLOBAL_INSTALL_FLAGS) {
    if (lowerArgs.includes(flag)) {
      throw new WorkspaceError('禁止全局或用户目录安装；包只能装进当前授权工作区')
    }
  }

  if (bin === 'npm' || bin === 'npx') {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]
      if (a === '--prefix' || a === '-C') {
        const target = argv[i + 1]
        if (target && !isUnderGrant(path.resolve(cwdAbs, target), grantRootAbs)) {
          throw new WorkspaceError('npm 安装目标必须在授权工作区内')
        }
      }
    }
    return argv
  }

  // pip: 若无 --target / -t / -d，注入 --target 到工作区 vendor
  const hasTarget = lowerArgs.some(a => a === '--target' || a === '-t' || a === '-d' || a.startsWith('--target='))
  if (hasTarget) {
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--target' || argv[i] === '-t') {
        const target = argv[i + 1]
        if (target && !isUnderGrant(path.resolve(cwdAbs, target), grantRootAbs)) {
          throw new WorkspaceError('pip 安装目标必须在授权工作区内')
        }
      }
      if (argv[i]?.startsWith('--target=')) {
        const target = argv[i].slice('--target='.length)
        if (target && !isUnderGrant(path.resolve(cwdAbs, target), grantRootAbs)) {
          throw new WorkspaceError('pip 安装目标必须在授权工作区内')
        }
      }
    }
    return argv
  }

  const vendorDir = '.opptrix-packages'
  return [...argv.slice(0, installIdx + 1), '--target', vendorDir, ...argv.slice(installIdx + 1)]
}

export function buildPipInstallArgv(packages: readonly string[]): string[] {
  return ['pip3', 'install', '--target', '.opptrix-packages', ...packages]
}

export function buildNpmInstallArgv(packages: readonly string[]): string[] {
  if (packages.length === 0) {
    return ['npm', 'install']
  }
  return ['npm', 'install', ...packages]
}

function isUnderGrant(target: string, grantRoot: string): boolean {
  const rel = path.relative(grantRoot, path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function escapeShellArg(arg: string): string {
  if (!/[\s"'\\$`!]/.test(arg)) return arg
  return `"${arg.replace(/(["\\$`!])/g, '\\$1')}"`
}

export function argvToCommandString(argv: readonly string[]): string {
  return argv.map(escapeShellArg).join(' ')
}
