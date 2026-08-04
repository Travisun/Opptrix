/**
 * 语义检索模型 + 解析引擎安装/卸载 API（设置页钩子）。
 * 用户文案：语义检索 / 版面增强 / 深度整理；勿暴露引擎专名与路径。
 */
import type { FastifyInstance } from 'fastify'
import {
  getParseEnginesStatus,
  getSemanticModelStatus,
  installSemanticModel,
  markDeepEngineReady,
  prepareDeepEngine,
  prepareLayoutEngine,
  uninstallDeepEngine,
  uninstallLayoutEngine,
  uninstallSemanticModel,
} from '@opptrix/doc-library'

export async function registerDocLibrarySettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings/semantic-model', async () => {
    const status = getSemanticModelStatus()
    return {
      installed: status.installed,
      label: status.label,
    }
  })

  app.post('/api/settings/semantic-model/install', async (_req, reply) => {
    try {
      const status = await installSemanticModel()
      return {
        ok: true,
        installed: status.installed,
        label: status.label,
      }
    } catch {
      return reply.status(500).send({
        ok: false,
        error: '语义检索模型下载失败，请稍后重试',
      })
    }
  })

  app.post('/api/settings/semantic-model/uninstall', async (_req, reply) => {
    try {
      await uninstallSemanticModel()
      return { ok: true, installed: false, label: '语义检索模型' }
    } catch {
      return reply.status(500).send({
        ok: false,
        error: '卸载失败，请稍后重试',
      })
    }
  })

  app.get('/api/settings/parse-engines', async () => {
    const status = getParseEnginesStatus()
    return {
      layout: {
        available: status.layout.available,
        installed: status.layout.installed,
        label: status.layout.label,
        hint: status.layout.hint,
      },
      deep: {
        available: status.deep.available,
        installed: status.deep.installed,
        label: status.deep.label,
        hint: status.deep.hint,
      },
      semantic: {
        installed: status.semantic.installed,
        label: status.semantic.label,
      },
    }
  })

  app.post('/api/settings/parse-engines/layout/prepare', async (_req, reply) => {
    try {
      const layout = await prepareLayoutEngine()
      return { ok: true, layout }
    } catch {
      return reply.status(500).send({
        ok: false,
        error: '版面增强准备失败，请稍后重试',
      })
    }
  })

  app.post('/api/settings/parse-engines/layout/uninstall', async (_req, reply) => {
    try {
      await uninstallLayoutEngine()
      return { ok: true }
    } catch {
      return reply.status(500).send({
        ok: false,
        error: '卸载失败，请稍后重试',
      })
    }
  })

  app.post('/api/settings/parse-engines/deep/prepare', async (_req, reply) => {
    try {
      const deep = await prepareDeepEngine()
      return {
        ok: true,
        deep,
        message: '已准备深度整理目录；配置模型后即可启用',
      }
    } catch {
      return reply.status(500).send({
        ok: false,
        error: '深度整理准备失败，请稍后重试',
      })
    }
  })

  app.post('/api/settings/parse-engines/deep/mark-ready', async (_req, reply) => {
    try {
      const deep = await markDeepEngineReady()
      return { ok: true, deep }
    } catch {
      return reply.status(500).send({
        ok: false,
        error: '无法标记深度整理就绪',
      })
    }
  })

  app.post('/api/settings/parse-engines/deep/uninstall', async (_req, reply) => {
    try {
      await uninstallDeepEngine()
      return { ok: true }
    } catch {
      return reply.status(500).send({
        ok: false,
        error: '卸载失败，请稍后重试',
      })
    }
  })
}
