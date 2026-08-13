/**
 * 语义检索模型 + 解析引擎安装/卸载 API（设置页钩子）。
 * 用户文案：语义检索 / 扫描件识别；勿暴露引擎专名与路径。
 * 「版面增强」已移除；保留 layout 路由以兼容旧客户端（返回已停用）。
 */
import type { FastifyInstance } from 'fastify'
import {
  getParseEnginesStatus,
  getSemanticModelStatus,
  getSemanticModelInstallJobStatus,
  startSemanticModelInstallJob,
  getOcrDeepPrepareJobStatus,
  startOcrDeepPrepareJob,
  markDeepEngineReady,
  uninstallDeepEngine,
  uninstallSemanticModel,
} from '@opptrix/doc-library'

function semanticModelPublicStatus() {
  const status = getSemanticModelStatus()
  const job = getSemanticModelInstallJobStatus()
  return {
    installed: status.installed,
    label: status.label,
    source: status.source,
    phase: job.phase,
    progress: {
      file: job.file,
      receivedBytes: job.receivedBytes,
      totalBytes: job.totalBytes,
      percent: job.percent,
    },
    message: job.message,
    error: job.error,
    job,
  }
}

function parseEnginesPublicStatus() {
  const status = getParseEnginesStatus()
  const job = getOcrDeepPrepareJobStatus()
  return {
    deep: {
      available: status.deep.available,
      installed: status.deep.installed,
      label: status.deep.label,
      hint: status.deep.hint,
      source: status.deep.source,
      phase: job.phase,
      progress: {
        file: job.file,
        receivedBytes: job.receivedBytes,
        totalBytes: job.totalBytes,
        percent: job.percent,
      },
      message: job.message,
      error: job.error,
      job,
    },
    semantic: {
      installed: status.semantic.installed,
      label: status.semantic.label,
      source: status.semantic.source,
    },
  }
}

export async function registerDocLibrarySettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings/semantic-model', async () => semanticModelPublicStatus())

  /** 与 GET /semantic-model 同源；便于对照 Python /install 轮询 */
  app.get('/api/settings/semantic-model/install', async () => ({
    job: getSemanticModelInstallJobStatus(),
  }))

  app.post('/api/settings/semantic-model/install', async () => {
    const job = startSemanticModelInstallJob()
    return {
      ok: true,
      started: job.started || job.phase === 'downloading' || job.phase === 'enabling' || job.phase === 'ready',
      job,
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

  app.get('/api/settings/parse-engines', async () => parseEnginesPublicStatus())

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

  /** 与 GET /parse-engines 中 deep.job 同源 */
  app.get('/api/settings/parse-engines/deep/prepare', async () => ({
    job: getOcrDeepPrepareJobStatus(),
  }))

  app.post('/api/settings/parse-engines/deep/prepare', async () => {
    const job = startOcrDeepPrepareJob()
    return {
      ok: true,
      started: job.started || job.phase === 'downloading' || job.phase === 'ready',
      job,
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
