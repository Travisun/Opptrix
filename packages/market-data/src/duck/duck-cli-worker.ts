/**
 * DuckDB CLI 专用 Worker — 所有 duck-cli spawn 在此线程执行，
 * 避免主进程 execFileSync / spawnSync 阻塞 Node 事件循环（Hub / 设置页 API）。
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parentPort } from 'node:worker_threads'

const CLI_PATH = fileURLToPath(new URL('../kline/duck-cli.js', import.meta.url))

export type DuckCliWorkerRequest = {
  id: number
  args: string[]
  maxBuffer: number
}

export type DuckCliWorkerResponse = {
  id: number
  ok: boolean
  stdout?: string
  stderr?: string
  error?: string
}

function runCli(args: string[], maxBuffer: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('exit', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `duck-cli exit ${code}`))
        return
      }
      if (stdout.length > maxBuffer) {
        reject(new Error('duck-cli stdout exceeded maxBuffer'))
        return
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

if (!parentPort) {
  throw new Error('duck-cli-worker must run inside worker_threads')
}

parentPort.on('message', (msg: DuckCliWorkerRequest) => {
  void runCli(msg.args, msg.maxBuffer)
    .then(({ stdout, stderr }) => {
      const res: DuckCliWorkerResponse = { id: msg.id, ok: true, stdout, stderr }
      parentPort!.postMessage(res)
    })
    .catch((err: unknown) => {
      const res: DuckCliWorkerResponse = {
        id: msg.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
      parentPort!.postMessage(res)
    })
})
