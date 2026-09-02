/**
 * Docker self-host HTTPS (self-signed) — port 8712 alongside HTTP 8711.
 *
 * Certs live under `$OPPTRIX_SYSTEM_DIR/tls` (or `$OPPTRIX_HOME/system/tls`) so they
 * survive container recreate on the named volume. Generation uses `openssl` when
 * available (Debian runtime installs it).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import type { Server as HttpServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const DEFAULT_HTTPS_PORT = 8712

export type SelfSignedTlsMaterials = {
  key: Buffer
  cert: Buffer
  dir: string
  created: boolean
}

/**
 * Resolve HTTPS listen port.
 * - Docker (`OPPTRIX_DOCKER=1`): default 8712 unless explicitly disabled (`0` / `off`)
 * - Non-Docker: only when `OPPTRIX_HTTPS_PORT` is a positive integer
 */
export function resolveHttpsPort(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.OPPTRIX_HTTPS_PORT?.trim().toLowerCase()
  if (raw === '0' || raw === 'off' || raw === 'false' || raw === 'no') return null
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw)
    return n > 0 ? n : null
  }
  if (env.OPPTRIX_DOCKER === '1') return DEFAULT_HTTPS_PORT
  return null
}

export function resolveTlsDir(env: NodeJS.ProcessEnv = process.env): string {
  const system = env.OPPTRIX_SYSTEM_DIR?.trim()
  if (system) return path.join(path.resolve(system), 'tls')
  const home = env.OPPTRIX_HOME?.trim()
  if (home) return path.join(path.resolve(home), 'system', 'tls')
  return path.join(process.cwd(), 'data', 'tls')
}

function opensslAvailable(): boolean {
  const r = spawnSync('openssl', ['version'], { encoding: 'utf8', shell: false })
  return (r.status ?? 1) === 0
}

/**
 * Ensure key.pem + cert.pem exist (create self-signed RSA if missing).
 */
export function ensureSelfSignedTlsMaterials(
  env: NodeJS.ProcessEnv = process.env,
): SelfSignedTlsMaterials {
  const dir = resolveTlsDir(env)
  const keyPath = path.join(dir, 'key.pem')
  const certPath = path.join(dir, 'cert.pem')
  fs.mkdirSync(dir, { recursive: true })

  let created = false
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    if (!opensslAvailable()) {
      throw new Error(
        '无法生成自签名证书：未找到 openssl。Docker 镜像应已安装 openssl；'
          + '或预先放入 key.pem / cert.pem 到 TLS 目录。',
      )
    }
    const r = spawnSync(
      'openssl',
      [
        'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '3650', '-nodes',
        '-keyout', keyPath,
        '-out', certPath,
        '-subj', '/CN=Opptrix/O=Opptrix Self-Host',
        '-addext', 'subjectAltName=DNS:localhost,DNS:opptrix,IP:127.0.0.1',
      ],
      { encoding: 'utf8', shell: false },
    )
    if ((r.status ?? 1) !== 0) {
      const err = (r.stderr || r.stdout || '').trim()
      throw new Error(`openssl 生成自签名证书失败: ${err.slice(0, 400)}`)
    }
    try {
      fs.chmodSync(keyPath, 0o600)
    } catch {
      /* ignore */
    }
    created = true
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    dir,
    created,
  }
}

/**
 * Bind HTTPS on `port` using the same Fastify HTTP server request pipeline.
 */
export async function listenHttpsAlongsideHttp(opts: {
  httpServer: HttpServer
  host: string
  port: number
  key: Buffer
  cert: Buffer
}): Promise<https.Server> {
  const handler = (
    req: IncomingMessage,
    res: ServerResponse,
  ): void => {
    opts.httpServer.emit('request', req, res)
  }
  const server = https.createServer({ key: opts.key, cert: opts.cert }, handler)
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening)
      reject(err)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(opts.port, opts.host)
  })
  return server
}

export async function closeHttpsServer(server: https.Server | null | undefined): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
}
