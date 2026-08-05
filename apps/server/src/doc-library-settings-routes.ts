/**
 * 语义检索模型 + 解析引擎安装/卸载 API（设置页钩子）。
 * 用户文案：语义检索 / 扫描件识别；勿暴露引擎专名与路径。
 * 「版面增强」已移除；保留 layout 路由以兼容旧客户端（返回已停用）。
 */
import type { FastifyInstance } from 'fastify'
import {
  getParseEnginesStatus,
  getSemanticModelStatus,
  installSemanticModel,
  markDeepEngineReady,
  prepareDeepEngine,
  uninstallDeepEngine,
  uninstallSemanticModel,
} from '@opptrix/doc-library'

export async function registerDocLibrarySettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings/semantic-model', async () => {
    const status = getSemanticModelStatus()
    return {
      installed: status.installed,
      label: status.label,
      source: status.source,
    }
  })

  app.post('/api/settings/semantic-model/install', async (_req, reply) => {
    try {
      const status = await installSemanticModel()
      return {
        ok: true,
        installed: status.installed,
        label: status.label,
        source: status.source,
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
      const status = await uninstallSemanticModel()
      return {
        ok: true,
        installed: status.installed,
        label: status.label,
        source: status.source,
      }
    } catch {
      return reply.status(500).send({
        ok: false,
        error: '卸下失败，请稍后重试',
      })
    }
  })

  app.get('/api/settings/parse-engines', async () => {
    const status = getParseEnginesStatus()
    return {
      deep: {
        available: status.deep.available,
        installed: status.deep.installed,
        label: status.deep.label,
        hint: status.deep.hint,
        source: status.deep.source,
      },
      semantic: {
        installed: status.semantic.installed,
        label: status.semantic.label,
        source: status.semantic.source,
      },
    }
  })

  /** @deprecated 版面增强已停用 */
  app.post('/api/settings/parse-engines/layout/prepare', async () => {
    return {
      ok: false,
      error: '该能力已停用',
      layout: {
        available: false,
        installed: false,
        label: '版面增强',
        hint: '该能力已停用，基础整理与扫描件识别已覆盖常见研报',
        source: 'missing',
      },
    }
  })

  /** @deprecated */
  app.post('/api/settings/parse-engines/layout/uninstall', async () => {
    return { ok: true }
  })

  app.post('/api/settings/parse-engines/deep/prepare', async (_req, reply) => {
    try {
      const deep = await prepareDeepEngine()
      return {
        ok: true,
        deep,
        message: deep.available
          ? '扫描件识别已就绪'
          : '扫描件识别尚未就绪，请稍后重试',
      }
    } catch {
      return reply.status(500).send({
        ok: false,
        error: '暂时无法完成扫描件识别，请稍后重试',
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
        error: '无法标记扫描件识别就绪',
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
