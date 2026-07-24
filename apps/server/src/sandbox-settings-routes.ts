import type { FastifyInstance } from 'fastify'
import {
  getSandboxSettings,
  getShellPlatformStatus,
  saveSandboxSettings,
} from '@opptrix/agent-workspace'
import type { SandboxSettings } from '@opptrix/shared'

export function registerSandboxSettingsRoutes(app: FastifyInstance): void {
  app.get('/api/settings/sandbox', async () => ({
    settings: getSandboxSettings(),
  }))

  app.get('/api/settings/sandbox/status', async () => ({
    status: await getShellPlatformStatus(),
  }))

  app.put<{ Body: Partial<SandboxSettings> }>('/api/settings/sandbox', async (req, reply) => {
    const result = saveSandboxSettings(req.body ?? {})
    if (!result.ok) {
      return reply.status(400).send({ error: result.error, invalid_lines: result.invalid_lines })
    }
    return { settings: result.settings }
  })
}
