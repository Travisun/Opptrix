/**
 * 离线网页 vendor 静态服务：GET /api/opptrix-vendor/* 与 /opptrix-vendor/*
 * （后者与静态 UI 同源相对路径一致，供 iframe 内 /opptrix-vendor/... 引用）
 */
import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import {
  readWebVendorManifest,
  resolveSafeVendorRelativePath,
  resolveWebVendorRoot,
} from '@opptrix/agent'

const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'application/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.map':
      return 'application/json'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.ttf':
      return 'font/ttf'
    case '.wasm':
      return 'application/wasm'
    default:
      return 'application/octet-stream'
  }
}

function sendVendorFile(
  reply: { header: (k: string, v: string) => unknown; code: (n: number) => { send: (b?: unknown) => unknown }; send: (b: unknown) => unknown },
  filePath: string,
) {
  reply.header('Content-Type', guessMime(filePath))
  reply.header('Cache-Control', 'public, max-age=86400')
  reply.header('X-Content-Type-Options', 'nosniff')
  return reply.send(fs.createReadStream(filePath))
}

export function registerOpptrixVendorRoutes(app: FastifyInstance): void {
  const serveManifest = async (
    _req: unknown,
    reply: { code: (n: number) => { send: (b: unknown) => unknown }; header: (k: string, v: string) => unknown; send: (b: unknown) => unknown },
  ) => {
    const manifest = readWebVendorManifest()
    if (!manifest) {
      return reply.code(404).send({ error: 'web vendor not found' })
    }
    reply.header('Content-Type', 'application/json; charset=utf-8')
    reply.header('Cache-Control', 'public, max-age=60')
    return reply.send(manifest)
  }

  const serveFile = async (
    req: { params: { '*': string } },
    reply: {
      code: (n: number) => { send: (b?: unknown) => unknown }
      header: (k: string, v: string) => unknown
      send: (b: unknown) => unknown
    },
  ) => {
    const star = String(req.params['*'] ?? '').trim()
    if (!star || star === 'manifest') {
      return serveManifest(req, reply)
    }
    const filePath = resolveSafeVendorRelativePath(star)
    if (!filePath) {
      return reply.code(404).send({ error: 'vendor file not found' })
    }
    return sendVendorFile(reply, filePath)
  }

  app.get('/api/opptrix-vendor/manifest', serveManifest)
  app.get('/opptrix-vendor/manifest', serveManifest)

  app.get<{ Params: { '*': string } }>('/api/opptrix-vendor/*', serveFile)
  app.get<{ Params: { '*': string } }>('/opptrix-vendor/*', serveFile)

  // 开发诊断：无文件时仍可查根路径
  app.get('/api/opptrix-vendor', async (_req, reply) => {
    const root = resolveWebVendorRoot()
    if (!root) return reply.code(404).send({ error: 'web vendor not found' })
    return { ok: true, rootHint: 'configured', manifest: '/api/opptrix-vendor/manifest' }
  })
}

export { WEB_CSP, guessMime as guessWebAssetMime }
