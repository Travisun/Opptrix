import fs from 'node:fs'
import path from 'node:path'
import { resolvePluginDataDir } from '@opptrix/shared'
import { SqlitePluginKvStore } from './kv-store.js'

export type PluginDataExport = {
  version: 1
  pluginId: string
  exportedAt: string
  kv: Record<string, unknown>
}

export function exportPluginData(
  pluginId: string,
  opts?: { dataRoot?: string },
): PluginDataExport {
  const store = new SqlitePluginKvStore({ pluginId, dataRoot: opts?.dataRoot })
  try {
    const kv: Record<string, unknown> = {}
    for (const key of store.keys()) {
      kv[key] = store.get(key)
    }
    return {
      version: 1,
      pluginId,
      exportedAt: new Date().toISOString(),
      kv,
    }
  } finally {
    store.close()
  }
}

export function importPluginData(
  pluginId: string,
  payload: PluginDataExport,
  opts?: { merge?: boolean; dataRoot?: string },
): void {
  if (payload.version !== 1) {
    throw new Error(`unsupported export version: ${payload.version}`)
  }
  if (payload.pluginId !== pluginId) {
    throw new Error('export pluginId mismatch')
  }
  const store = new SqlitePluginKvStore({ pluginId, dataRoot: opts?.dataRoot })
  try {
    if (!opts?.merge) {
      for (const key of store.keys()) {
        store.delete(key)
      }
    }
    store.transaction(tx => {
      for (const [key, value] of Object.entries(payload.kv)) {
        tx.set(key, value)
      }
    })
  } finally {
    store.close()
  }
}

export function removePluginDataDir(pluginId: string): void {
  const dir = resolvePluginDataDir(pluginId)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
