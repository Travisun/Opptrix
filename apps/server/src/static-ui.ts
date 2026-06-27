import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function resolveUiDist(): string {
  if (process.env.UI_DIST_PATH) return path.resolve(process.env.UI_DIST_PATH)
  return path.resolve(__dirname, '../../../client-ui/dist')
}

export function shouldServeUi(): boolean {
  return process.env.SERVE_UI === '1'
    || process.env.INNO_DESKTOP === '1'
    || process.env.NODE_ENV === 'desktop'
}

export async function registerStaticUi(app: FastifyInstance): Promise<boolean> {
  const uiDist = resolveUiDist()
  if (!fs.existsSync(uiDist)) {
    app.log.warn(`UI dist not found (${uiDist}); static hosting disabled`)
    return false
  }

  await app.register(fastifyStatic, {
    root: uiDist,
    prefix: '/',
    wildcard: false,
  })

  app.log.info(`Serving UI from ${uiDist}`)
  return true
}

export function isApiPath(url: string): boolean {
  return url.startsWith('/api')
}
