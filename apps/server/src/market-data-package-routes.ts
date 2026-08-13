import type { FastifyInstance } from 'fastify'
import { createReadStream } from 'node:fs'
import { isSupplementPackId, type SupplementPackId } from '@opptrix/shared'
import {
  startPackageExportJob,
  getPackageExportJob,
  getPackageExportJobFilePath,
  PACKAGE_MIME,
  getMarketDataService,
  suggestPackageFilename,
} from '@opptrix/market-data-store'

function readOctetBody(body: unknown): Buffer | null {
  if (Buffer.isBuffer(body)) return body
  if (body instanceof Uint8Array) return Buffer.from(body)
  return null
}

export function registerMarketDataPackageRoutes(app: FastifyInstance): void {
  /** 启动导出 job（立即返回，后台打包） */
  app.post<{ Body: { pack?: string } }>('/api/market-data/export/jobs', async (req, reply) => {
    try {
      const job = startPackageExportJob({ pack: req.body?.pack ?? null })
      return { success: true, data: job }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return reply.status(400).send({ success: false, error: msg })
    }
  })

  /** 查询导出进度 */
  app.get<{ Params: { id: string } }>('/api/market-data/export/jobs/:id', async (req, reply) => {
    const job = getPackageExportJob(req.params.id)
    if (!job) {
      return reply.status(404).send({ success: false, error: '导出任务不存在或已过期' })
    }
    return { success: true, data: job }
  })

  /** 就绪后短超时下载临时文件 */
  app.get<{ Params: { id: string } }>('/api/market-data/export/jobs/:id/download', async (req, reply) => {
    const file = getPackageExportJobFilePath(req.params.id)
    if (!file) {
      const job = getPackageExportJob(req.params.id)
      if (!job) {
        return reply.status(404).send({ success: false, error: '导出任务不存在或已过期' })
      }
      if (job.status !== 'ready') {
        return reply.status(409).send({
          success: false,
          error: '导出尚未就绪',
          data: job,
        })
      }
      return reply.status(404).send({ success: false, error: '导出文件已失效，请重新导出' })
    }

    reply.header('Content-Type', PACKAGE_MIME)
    reply.header('Content-Disposition', `attachment; filename="${file.filename}"`)
    reply.header('Content-Length', String(file.bytes))
    return reply.send(createReadStream(file.filePath))
  })

  /**
   * 兼容旧客户端：同步导出（仍可能较长）。
   * 新 UI 应走 /export/jobs。
   */
  app.get<{ Querystring: { pack?: string } }>('/api/market-data/export', async (req, reply) => {
    try {
      const rawPack = req.query.pack?.trim()
      let pack: SupplementPackId | undefined
      if (rawPack) {
        if (!isSupplementPackId(rawPack)) {
          return reply.status(400).send({ success: false, error: `无效的市场包：${rawPack}` })
        }
        pack = rawPack
      }
      const svc = getMarketDataService()
      const buffer = await svc.exportPackage(pack)
      const filename = suggestPackageFilename()
      reply.header('Content-Type', PACKAGE_MIME)
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(buffer)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return reply.status(409).send({ success: false, error: msg })
    }
  })

  app.post('/api/market-data/package/inspect', async (req, reply) => {
    try {
      const buf = readOctetBody(req.body)
      if (!buf) {
        return reply.status(400).send({ success: false, error: '请上传二进制数据包' })
      }
      const data = getMarketDataService().inspectPackage(buf)
      return { success: true, data }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return reply.status(400).send({ success: false, error: msg })
    }
  })

  app.post('/api/market-data/import', async (req, reply) => {
    try {
      const buf = readOctetBody(req.body)
      if (!buf) {
        return reply.status(400).send({ success: false, error: '请上传二进制数据包' })
      }
      const svc = getMarketDataService()
      const metadata = svc.importPackage(buf)
      return {
        success: true,
        message: '数据包已导入',
        data: { metadata, status: svc.status() },
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return reply.status(409).send({ success: false, error: msg })
    }
  })
}
