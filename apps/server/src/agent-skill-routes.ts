/**
 * Agent Skills（工作流技能）REST API — 列表 / 详情 / 创建 / 导入 / 删除 / fork / 更新 / 文件预览。
 */

import type { FastifyInstance } from 'fastify'
import {
  AgentSkillError,
  createSkill,
  deleteUserSkill,
  forkBuiltinSkill,
  getSkill,
  installSkillFromMarkdown,
  listSkillIndex,
  readSkillFile,
  toPublicDetail,
  toPublicIndexEntry,
  updateUserSkill,
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

function isStringRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter((x): x is string => typeof x === 'string')
}

function asAttachmentFiles(v: unknown): Array<{ path: string; content: string }> | undefined {
  if (!Array.isArray(v)) return undefined
  const out: Array<{ path: string; content: string }> = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const pathVal = (raw as { path?: unknown }).path
    const contentVal = (raw as { content?: unknown }).content
    if (typeof pathVal !== 'string' || typeof contentVal !== 'string') continue
    out.push({ path: pathVal, content: contentVal })
  }
  return out.length ? out : undefined
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
      references?: unknown
      files?: unknown
    }
  }>('/api/agent-skills', async (req, reply) => {
    const b = req.body ?? {}
    try {
      const files = asAttachmentFiles(b.files)
      const skill = createSkill({
        name: String(b.name ?? ''),
        description: String(b.description ?? ''),
        body: String(b.body ?? ''),
        license: b.license,
        compatibility: b.compatibility,
        metadata: isStringRecord(b.metadata) ? b.metadata as Record<string, string> : undefined,
        references: asStringArray(b.references),
        files,
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

  app.post<{ Params: { name: string } }>(
    '/api/agent-skills/:name/fork',
    async (req, reply) => {
      const name = String(req.params.name ?? '').trim()
      if (!name) {
        return reply.code(400).send({ error: '请指定要复制的工作流技能' })
      }
      try {
        const skill = forkBuiltinSkill(name)
        return reply.code(201).send({ skill: toPublicDetail(skill) })
      } catch (e) {
        const { status, message } = userError(e)
        return reply.code(status).send({ error: message })
      }
    },
  )

  app.put<{
    Params: { name: string }
    Body: {
      description?: string
      body?: string
      license?: string
      compatibility?: string
      metadata?: Record<string, string>
      references?: unknown
      confirmed?: boolean
    }
  }>('/api/agent-skills/:name', async (req, reply) => {
    const name = String(req.params.name ?? '').trim()
    if (!name) {
      return reply.code(400).send({ error: '请指定要更新的工作流技能' })
    }
    const b = req.body ?? {}
    const description = String(b.description ?? '').trim()
    const body = String(b.body ?? '')
    if (!description || !body) {
      return reply.code(400).send({ error: '请补充技能说明与步骤正文后再保存' })
    }
    try {
      const skill = updateUserSkill(name, {
        name,
        description,
        body,
        license: b.license,
        compatibility: b.compatibility,
        metadata: isStringRecord(b.metadata) ? b.metadata as Record<string, string> : undefined,
        references: asStringArray(b.references),
        source: 'user',
      })
      return { skill: toPublicDetail(skill) }
    } catch (e) {
      const { status, message } = userError(e)
      return reply.code(status).send({ error: message })
    }
  })

  app.get<{ Params: { name: string }; Querystring: { path?: string } }>(
    '/api/agent-skills/:name/file',
    async (req, reply) => {
      const name = String(req.params.name ?? '').trim()
      const rel = String(req.query?.path ?? '').trim()
      if (!name) {
        return reply.code(400).send({ error: '请指定工作流技能' })
      }
      if (!rel) {
        return reply.code(400).send({ error: '请指定要预览的文件路径' })
      }
      try {
        const content = readSkillFile(name, rel)
        return { skill_name: name, path: rel, content }
      } catch (e) {
        const { status, message } = userError(e)
        return reply.code(status).send({ error: message })
      }
    },
  )

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
