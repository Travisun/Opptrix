/**
 * Agent Skills（工作流技能）REST API — 列表 / 详情 / 创建 / 导入 / 删除。
 */

import type { FastifyInstance } from 'fastify'
import {
  AgentSkillError,
  createSkill,
  deleteUserSkill,
  getSkill,
  installSkillFromMarkdown,
  listSkillIndex,
  toPublicDetail,
  toPublicIndexEntry,
} from '@opptrix/agent-skills'

function userError(e: unknown): { status: number; message: string } {
  if (e instanceof AgentSkillError) {
    switch (e.code) {
      case 'not_found':
        return { status: 404, message: e.message }
      case 'builtin_readonly':
        return { status: 403, message: e.message }
      case 'exists':
        return { status: 409, message: e.message }
      case 'path_escape':
      case 'invalid_name':
      case 'invalid_description':
      case 'invalid_frontmatter':
      case 'injection':
      case 'too_large':
        return { status: 400, message: e.message }
      default:
        return { status: 400, message: e.message }
    }
  }
  return { status: 500, message: '服务暂时不可用，请稍后重试' }
}

export async function registerAgentSkillRoutes(app: FastifyInstance) {
  app.get('/api/agent-skills', async () => {
    const skills = listSkillIndex().map(toPublicIndexEntry)
    return { skills }
  })

  app.get<{ Params: { name: string } }>('/api/agent-skills/:name', async (req, reply) => {
    const name = String(req.params.name ?? '').trim()
    const detail = getSkill(name)
    if (!detail) {
      return reply.code(404).send({ error: `未找到工作流技能「${name}」` })
    }
    return { skill: toPublicDetail(detail) }
  })

  app.post<{
    Body: {
      name?: string
      description?: string
      body?: string
      license?: string
      compatibility?: string
      metadata?: Record<string, string>
    }
  }>('/api/agent-skills', async (req, reply) => {
    const b = req.body ?? {}
    try {
      const skill = createSkill({
        name: String(b.name ?? ''),
        description: String(b.description ?? ''),
        body: String(b.body ?? ''),
        license: b.license,
        compatibility: b.compatibility,
        metadata: b.metadata,
        source: 'user',
      })
      return reply.code(201).send({ skill: toPublicDetail(skill) })
    } catch (e) {
      const { status, message } = userError(e)
      return reply.code(status).send({ error: message })
    }
  })

  app.post<{
    Body: { markdown?: string }
  }>('/api/agent-skills/import', async (req, reply) => {
    const markdown = String(req.body?.markdown ?? '')
    if (!markdown.trim()) {
      return reply.code(400).send({ error: '请粘贴完整的技能说明后再导入' })
    }
    try {
      const skill = installSkillFromMarkdown(markdown, { source: 'imported' })
      return reply.code(201).send({ skill: toPublicDetail(skill) })
    } catch (e) {
      const { status, message } = userError(e)
      return reply.code(status).send({ error: message })
    }
  })

  app.delete<{ Params: { name: string } }>('/api/agent-skills/:name', async (req, reply) => {
    const name = String(req.params.name ?? '').trim()
    try {
      const result = deleteUserSkill(name)
      return result
    } catch (e) {
      const { status, message } = userError(e)
      return reply.code(status).send({ error: message })
    }
  })
}
