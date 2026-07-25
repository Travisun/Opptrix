import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import type { AgentEngine } from '@opptrix/agent'
import {
  mimeToMediaKind,
  resolveModelMediaCapabilitiesAsync,
  saveAttachment,
  deleteAttachment,
  readAttachmentMeta,
  resolveAttachmentFilePath,
  validateAttachmentAgainstCapabilities,
  isAttachmentReferenced,
  parseNonNegativeIntHeader,
  resolveUploadMime,
} from '@opptrix/agent'

function sanitizeFilename(name: string): string {
  const base = path.basename(name.trim() || 'file')
  return base.replace(/[^\w.\-()\u4e00-\u9fff]/g, '_').slice(0, 180) || 'file'
}

async function resolveSessionMediaCaps(agent: AgentEngine, sessionId: string) {
  const session = agent.getSession(sessionId)
  if (!session) return null
  const modelRef = session.model?.trim() || ''
  const colon = modelRef.indexOf(':')
  const providerId = colon > 0 ? modelRef.slice(0, colon) : undefined
  const modelId = colon > 0 ? modelRef.slice(colon + 1) : modelRef
  if (!modelId) {
    return resolveModelMediaCapabilitiesAsync('default', providerId)
  }
  return resolveModelMediaCapabilitiesAsync(modelId, providerId)
}

export function registerSessionAttachmentRoutes(app: FastifyInstance, agent: AgentEngine) {
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_req, body, done) => { done(null, body) },
  )

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/attachments',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const contentType = typeof req.headers['content-type'] === 'string'
        ? req.headers['content-type']
        : undefined
      const attachmentMime = typeof req.headers['x-attachment-mime'] === 'string'
        ? req.headers['x-attachment-mime']
        : undefined
      const rawName = req.headers['x-attachment-name']
      const name = sanitizeFilename(typeof rawName === 'string' ? decodeURIComponent(rawName) : 'file')

      const mime = resolveUploadMime(contentType, attachmentMime, name)
      const kind = mimeToMediaKind(mime, name)
      if (!kind) return reply.code(400).send({ error: '不支持此文件类型' })

      const body = req.body
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({ error: '请上传有效文件' })
      }

      const caps = await resolveSessionMediaCaps(agent, req.params.id)
      if (!caps) return reply.code(404).send({ error: 'session not found' })

      const pinnedCount = parseNonNegativeIntHeader(req.headers['x-pinned-count'])
      const pinnedTotal = parseNonNegativeIntHeader(req.headers['x-pinned-total-bytes'])
      const validation = validateAttachmentAgainstCapabilities(
        kind,
        body.length,
        caps,
        pinnedCount,
        pinnedTotal,
      )
      if (!validation.ok) return reply.code(400).send({ error: validation.error })

      try {
        const meta = saveAttachment({
          sessionId: req.params.id,
          name,
          mime,
          data: body,
        })
        return { attachment: meta }
      } catch (e) {
        const message = e instanceof Error ? e.message : '上传失败'
        return reply.code(400).send({ error: message })
      }
    },
  )

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/api/sessions/:id/attachments/:attachmentId',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const meta = readAttachmentMeta(req.params.id, req.params.attachmentId)
      if (!meta) return reply.code(404).send({ error: 'attachment not found' })

      const filePath = resolveAttachmentFilePath(req.params.id, req.params.attachmentId)
      if (!filePath) return reply.code(404).send({ error: 'attachment not found' })

      reply.header('Content-Type', meta.mime)
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(meta.name)}"`)
      return reply.send(fs.createReadStream(filePath))
    },
  )

  app.delete<{ Params: { id: string; attachmentId: string } }>(
    '/api/sessions/:id/attachments/:attachmentId',
    async (req, reply) => {
      const session = agent.getSession(req.params.id)
      if (!session) return reply.code(404).send({ error: 'session not found' })

      const meta = readAttachmentMeta(req.params.id, req.params.attachmentId)
      if (!meta) return reply.code(404).send({ error: 'attachment not found' })

      if (isAttachmentReferenced(req.params.attachmentId, session.turns)) {
        return reply.code(409).send({ error: '该附件已在对话中使用，无法删除' })
      }

      const ok = deleteAttachment(req.params.id, req.params.attachmentId)
      return { ok }
    },
  )
}
