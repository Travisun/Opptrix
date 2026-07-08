import type { FastifyInstance } from 'fastify'
import type { AgentEngine } from '@opptrix/agent'
import type { ResearchHub } from '@opptrix/research-hub'
import { SearchHub } from '@opptrix/search-hub'

export function registerSearchRoutes(
  app: FastifyInstance,
  hub: ResearchHub,
  agent: AgentEngine,
) {
  const searchHub = new SearchHub(hub, agent.sessions)

  app.get<{ Querystring: { q?: string; limit?: string } }>('/api/search', async (req) => {
    const q = req.query.q ?? ''
    const limit = Number(req.query.limit ?? 20)
    searchHub.ensureIndexes()
    return searchHub.search(q, Number.isFinite(limit) ? limit : 20)
  })

  app.get('/api/search/browse', async () => {
    searchHub.ensureIndexes()
    return {
      recent: searchHub.listRecentSessions(16),
      archived: searchHub.listArchivedByFolder(),
    }
  })

  app.get('/api/sessions/archive-folders', async () => ({
    folders: agent.listSessionArchiveFolders(),
  }))

  app.post<{ Body: { title?: string } }>('/api/sessions/archive-folders', async (req, reply) => {
    const title = String(req.body?.title ?? '').trim()
    if (!title) return reply.code(400).send({ error: 'title required' })
    const folder = agent.createSessionArchiveFolder(title)
    return { folder }
  })

  app.patch<{ Params: { id: string }; Body: { title?: string } }>(
    '/api/sessions/archive-folders/:id',
    async (req, reply) => {
      const title = String(req.body?.title ?? '').trim()
      if (!title) return reply.code(400).send({ error: 'title required' })
      const folder = agent.renameSessionArchiveFolder(req.params.id, title)
      if (!folder) return reply.code(400).send({ error: 'cannot rename folder' })
      return { folder }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/sessions/archive-folders/:id',
    async (req, reply) => {
      const result = agent.deleteSessionArchiveFolder(req.params.id)
      if (!result.ok) return reply.code(400).send({ error: 'cannot delete folder' })
      return result
    },
  )

  app.post<{ Params: { id: string } }>(
    '/api/sessions/archive-folders/:id/clear',
    async (req, reply) => {
      const result = agent.clearSessionArchiveFolder(req.params.id)
      if (!result.ok) return reply.code(404).send({ error: 'folder not found' })
      return result
    },
  )

  app.post<{ Params: { id: string }; Body: { folderId?: string } }>(
    '/api/sessions/:id/archive',
    async (req, reply) => {
      const folderId = req.body?.folderId?.trim()
      if (!folderId) return reply.code(400).send({ error: 'folderId required' })
      const record = agent.archiveSession(req.params.id, folderId)
      if (!record) return reply.code(404).send({ error: 'session not found' })
      return {
        session: {
          id: record.id,
          title: record.title,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          archivedAt: record.archivedAt,
          archiveFolderId: record.archiveFolderId,
        },
      }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/unarchive',
    async (req, reply) => {
      const record = agent.unarchiveSession(req.params.id)
      if (!record) return reply.code(404).send({ error: 'session not found' })
      return {
        session: {
          id: record.id,
          title: record.title,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          archivedAt: record.archivedAt,
          archiveFolderId: record.archiveFolderId,
        },
      }
    },
  )

  app.get('/api/sessions/archived', async () => ({
    groups: agent.listAllArchivedByFolder().map(g => ({
      folder: g.folder,
      sessions: g.sessions,
    })),
  }))
}
