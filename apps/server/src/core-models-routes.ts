import multipart from '@fastify/multipart'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getUserDataStore } from '@opptrix/user-store'
import {
  buildCoreModelsStatusDto,
  getCoreModelsEnsureJobStatus,
  importCoreModelFiles,
  persistSourceOrder,
  startCoreModelsEnsureJob,
} from './core-models-service.js'

async function requireAuthWhenClaimed(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  try {
    const claimed = getUserDataStore().appAuth.isClaimed()
    if (!claimed) return true
    if (req.auth) return true
    await reply.code(401).send({ error: '需要登录', code: 'auth_required' })
    return false
  } catch {
    return true
  }
}

export function registerCoreModelsRoutes(app: FastifyInstance): void {
  app.get('/api/system/core-models/status', async () => {
    const status = await buildCoreModelsStatusDto()
    const job = getCoreModelsEnsureJobStatus()
    return { ...status, job }
  })

  app.put<{ Body: { order?: string[] } }>(
    '/api/system/core-models/source-order',
    async (req, reply) => {
      if (!(await requireAuthWhenClaimed(req, reply))) return
      const result = await persistSourceOrder(req.body?.order ?? [])
      if ('error' in result) {
        return reply.code(400).send({ error: result.error })
      }
      const status = await buildCoreModelsStatusDto()
      return { order: result.order, sourceOrder: status.sourceOrder }
    },
  )

  app.post('/api/system/core-models/ensure', async (req, reply) => {
    if (!(await requireAuthWhenClaimed(req, reply))) return
    const job = startCoreModelsEnsureJob()
    const status = await buildCoreModelsStatusDto()
    return { job, status }
  })

  app.get('/api/system/core-models/ensure', async () => {
    const job = getCoreModelsEnsureJobStatus()
    const status = await buildCoreModelsStatusDto()
    return { job, status }
  })

  void app.register(async (scoped) => {
    await scoped.register(multipart, {
      limits: {
        files: 8,
        fileSize: 2 * 1024 * 1024 * 1024,
      },
    })

    scoped.post('/api/system/core-models/import', async (req, reply) => {
      if (!(await requireAuthWhenClaimed(req, reply))) return

      let modelId = ''
      const files: Array<{ filename: string; buffer: Buffer }> = []

      const parts = req.parts()
      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'modelId') {
          modelId = String(part.value ?? '').trim()
          continue
        }
        if (part.type !== 'file') continue
        const chunks: Buffer[] = []
        for await (const chunk of part.file) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        files.push({
          filename: part.filename || 'upload.bin',
          buffer: Buffer.concat(chunks),
        })
      }

      if (!modelId) {
        return reply.code(400).send({ error: '请指定要导入的组件', code: 'missing_model_id' })
      }

      const result = await importCoreModelFiles(modelId, files)
      if (!result.ok) {
        return reply.code(400).send({ error: result.error, code: 'import_invalid' })
      }

      const status = await buildCoreModelsStatusDto()
      return { ok: true, status }
    })
  })
}
