/**
 * HTTP API for system hot-update + upgrade-mode lock hook.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import multipart from '@fastify/multipart'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { readState } from '@opptrix/system-update'
import { getUserDataStore } from '@opptrix/user-store'
import { requestPath } from './auth-cookies.js'
import {
  SYSTEM_UPDATE_LOCKED_CODE,
  SYSTEM_UPDATE_LOCKED_MESSAGE,
  isApiAllowedDuringUpgrade,
  isUpgradeLockPhase,
} from './system-update-allowlist.js'
import {
  applyPendingUpdate,
  BASE_REFRESH_CLI_COMMAND,
  BASE_REFRESH_HINT,
  buildSystemUpdateStatus,
  isSystemUpdateEnabled,
  NEEDS_BASE_REFRESH_CODE,
  NeedsBaseRefreshError,
  rollbackUpdate,
} from './system-update-service.js'
import {
  runUpdateCheck,
  startSystemUpdateBackground,
} from './system-update-checker.js'
import {
  importUpdateFromFiles,
  SystemUpdateImportError,
} from './system-update-import.js'

export {
  isApiAllowedDuringUpgrade,
  isUpgradeLockPhase,
  SYSTEM_UPDATE_LOCKED_CODE,
  SYSTEM_UPDATE_LOCKED_MESSAGE,
} from './system-update-allowlist.js'

export {
  setSystemUpdateProcessExit,
  resetSystemUpdateProcessExit,
  buildSystemUpdateStatus,
} from './system-update-service.js'

export {
  parseSelfhostTag,
  selfhostTagForVersion,
  compareSemver,
  hotCheckUpdateUrl,
  hotReleasesUrl,
  hotPackageUrls,
  parseHotLatestPayload,
  parseHotReleasesPayload,
  fetchHotReleases,
} from './system-update-channel.js'

async function upgradeLockOnRequest(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const path = requestPath(req)
  if (!path.startsWith('/api')) return
  let phase: string
  try {
    phase = readState().uiPhase
  } catch {
    return
  }
  if (!isUpgradeLockPhase(phase)) return
  if (isApiAllowedDuringUpgrade(path, phase)) return
  await reply.code(503).send({
    code: SYSTEM_UPDATE_LOCKED_CODE,
    error: SYSTEM_UPDATE_LOCKED_MESSAGE,
  })
}

export function registerSystemUpdateLockHook(app: FastifyInstance): void {
  app.addHook('onRequest', upgradeLockOnRequest)
}

async function requireAuthWhenClaimed(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  try {
    const claimed = getUserDataStore().appAuth.isClaimed()
    if (!claimed) return true
    if (req.auth) return true
    await reply.code(401).send({ error: '需要登录后再确认更新', code: 'auth_required' })
    return false
  } catch {
    return true
  }
}

export function registerSystemUpdateRoutes(app: FastifyInstance): void {
  app.get('/api/system-update/status', async () => {
    return buildSystemUpdateStatus()
  })

  app.post('/api/system-update/check', async (_req, reply) => {
    if (!isSystemUpdateEnabled()) {
      return reply.code(400).send({
        error: '当前环境未启用在线更新',
        code: 'update_disabled',
      })
    }
    return runUpdateCheck({ force: true })
  })

  app.post('/api/system-update/apply', async (req, reply) => {
    if (!isSystemUpdateEnabled()) {
      return reply.code(400).send({
        error: '当前环境未启用在线更新',
        code: 'update_disabled',
      })
    }
    if (!(await requireAuthWhenClaimed(req, reply))) return
    try {
      const result = await applyPendingUpdate()
      return {
        ok: true,
        message: '即将重启以完成更新，请稍候',
        exitCode: result.exitCode,
        status: buildSystemUpdateStatus(),
      }
    } catch (err) {
      if (err instanceof NeedsBaseRefreshError) {
        return reply.code(409).send({
          code: NEEDS_BASE_REFRESH_CODE,
          error: err.message || BASE_REFRESH_HINT,
          cliCommand: err.cliCommand || BASE_REFRESH_CLI_COMMAND,
        })
      }
      const msg =
        err instanceof Error && /no pending/i.test(err.message)
          ? '没有可应用的更新'
          : '无法开始更新，请稍后重试'
      return reply.code(400).send({ error: msg, code: 'apply_failed' })
    }
  })

  void app.register(async (scoped) => {
    await scoped.register(multipart, {
      limits: {
        files: 2,
        fileSize: 2 * 1024 * 1024 * 1024,
      },
    })

    scoped.post('/api/system-update/import', async (req, reply) => {
      if (!isSystemUpdateEnabled()) {
        return reply.code(400).send({
          error: '当前环境未启用在线更新',
          code: 'update_disabled',
        })
      }
      if (!(await requireAuthWhenClaimed(req, reply))) return

      let packagePath: string | null = null
      let packageName: string | null = null
      let shaPath: string | null = null
      let shaName: string | null = null
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-su-import-'))

      try {
        const parts = req.parts()
        for await (const part of parts) {
          if (part.type !== 'file') continue
          const field = part.fieldname
          if (field !== 'package' && field !== 'sha256') continue
          const safeName = path.basename(part.filename || field).replace(/[^\w.\-()+]/g, '_')
          const dest = path.join(tmpDir, safeName)
          await pipeline(part.file, createWriteStream(dest))
          if (field === 'package') {
            packagePath = dest
            packageName = part.filename || 'package.bin'
          } else {
            shaPath = dest
            shaName = part.filename || 'package.sha256'
          }
        }

        if (!packagePath || !shaPath || !packageName || !shaName) {
          return reply.code(400).send({
            error: '请同时上传更新包与校验文件',
            code: 'missing_sha',
          })
        }

        const result = await importUpdateFromFiles({
          packagePath,
          packageOriginalName: packageName,
          sha256Path: shaPath,
          sha256OriginalName: shaName,
        })
        return {
          ok: true,
          version: result.version,
          status: result.status,
        }
      } catch (err) {
        if (err instanceof SystemUpdateImportError) {
          return reply.code(err.status).send({
            error: err.message,
            code: err.code,
          })
        }
        return reply.code(400).send({
          error: '无法导入更新包，请稍后重试',
          code: 'import_failed',
        })
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })

  app.post('/api/system-update/rollback', async (req, reply) => {
    if (!isSystemUpdateEnabled()) {
      return reply.code(400).send({
        error: '当前环境未启用在线更新',
        code: 'update_disabled',
      })
    }
    if (!(await requireAuthWhenClaimed(req, reply))) return
    try {
      const result = await rollbackUpdate()
      return {
        ok: true,
        message: '即将重启以完成回退，请稍候',
        toVersion: result.toVersion,
        exitCode: result.exitCode,
        status: buildSystemUpdateStatus(),
      }
    } catch (err) {
      const msg =
        err instanceof Error && /schema incompatible/i.test(err.message)
          ? '当前数据与上一版本不兼容，暂时无法回退'
          : err instanceof Error && /no backup/i.test(err.message)
            ? '没有可回退的版本'
            : '无法回退，请稍后重试'
      return reply.code(400).send({ error: msg, code: 'rollback_failed' })
    }
  })
}

/** Call after listen — starts first-boot hooks + background check interval. */
export function startSystemUpdateAfterListen(): () => void {
  return startSystemUpdateBackground({ checkOnStart: true })
}
