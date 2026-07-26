import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)

let ensurePromise: Promise<string> | null = null

function resolveWhisperCppPath(): string {
  const pkgJson = require.resolve('nodejs-whisper/package.json')
  return path.join(path.dirname(pkgJson), 'cpp', 'whisper.cpp')
}

function candidateExecPaths(cppRoot: string): string[] {
  const execName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  return [
    path.join(cppRoot, 'build', 'bin', execName),
    path.join(cppRoot, 'build', 'bin', 'Release', execName),
    path.join(cppRoot, 'build', 'bin', 'Debug', execName),
    path.join(cppRoot, 'build', execName),
    path.join(cppRoot, execName),
  ]
}

export function findWhisperCliExecutable(cppRoot = resolveWhisperCppPath()): string | null {
  for (const p of candidateExecPaths(cppRoot)) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function resolveCmakeBin(): string {
  const fromEnv = process.env.CMAKE_PATH?.trim()
  if (fromEnv) return fromEnv
  const candidates = [
    'cmake',
    '/opt/homebrew/bin/cmake',
    '/usr/local/bin/cmake',
  ]
  for (const c of candidates) {
    if (c === 'cmake') return c
    if (fs.existsSync(c)) return c
  }
  return 'cmake'
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: {
        ...process.env,
        PATH: [
          '/opt/homebrew/bin',
          '/usr/local/bin',
          process.env.PATH ?? '',
        ].filter(Boolean).join(path.delimiter),
      },
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `${cmd} exited ${code}`))
    })
  })
}

/**
 * nodejs-whisper 在 constructCommand 时就会要求 whisper-cli 已存在，
 * 而其内部 auto-build 发生在之后，因此需在调用前主动编译一次。
 */
export async function ensureWhisperCliBuilt(): Promise<string> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const cppRoot = resolveWhisperCppPath()
      const existing = findWhisperCliExecutable(cppRoot)
      if (existing) return existing

      const buildDir = path.join(cppRoot, 'build')
      const cmakeCache = path.join(buildDir, 'CMakeCache.txt')
      const cmake = resolveCmakeBin()
      if (!fs.existsSync(cmakeCache)) {
        const configureArgs = ['-B', 'build']
        const extra = process.env.NODEJS_WHISPER_CMAKE_ARGS?.trim()
        if (extra) configureArgs.push(extra)
        await run(cmake, configureArgs, cppRoot)
      }
      await run(cmake, ['--build', 'build', '--config', 'Release'], cppRoot)

      const built = findWhisperCliExecutable(cppRoot)
      if (!built) {
        throw new Error('语音识别引擎编译完成但仍未找到可执行文件，请确认已安装 CMake 与编译工具')
      }
      return built
    })().catch((err) => {
      ensurePromise = null
      throw err
    })
  }
  return ensurePromise
}
