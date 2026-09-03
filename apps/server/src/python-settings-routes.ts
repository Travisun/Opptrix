import type { FastifyInstance } from 'fastify'
import {
  getPythonPlatformStatus,
  getPythonSettings,
  savePythonSettings,
} from '@opptrix/agent-workspace'
import type { PythonSettings } from '@opptrix/shared'

export function registerPythonSettingsRoutes(app: FastifyInstance): void {
  app.get('/api/settings/python', async () => ({
    settings: getPythonSettings(),
  }))

  app.get('/api/settings/python/status', async () => ({
    status: await getPythonPlatformStatus(),
  }))

  app.put<{ Body: Partial<PythonSettings> }>('/api/settings/python', async (req, reply) => {
    const result = savePythonSettings(req.body ?? {})
    if (!result.ok) {
      return reply.status(400).send({ error: result.error, invalid_lines: result.invalid_lines })
    }
    return { settings: result.settings }
  })
}
