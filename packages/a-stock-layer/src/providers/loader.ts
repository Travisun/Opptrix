import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { InstalledProviderRecord } from '@opptrix/shared'
import { resolveProvidersDir } from '@opptrix/shared'
import type { RegistryProvider } from '../core/registry.js'
import { DriverRegistry } from '../core/registry.js'
import { registerAllDrivers } from './register.js'
import { TUSHARE_MANIFEST } from './tushare/manifest.js'
import { TICKFLOW_MANIFEST } from './tickflow/manifest.js'
import { BINANCE_MANIFEST } from './binance/manifest.js'
import { OKX_MANIFEST } from './okx/manifest.js'
import { BAOSTOCK_MANIFEST } from './baostock/manifest.js'
import { ZZSHARE_MANIFEST } from './zzshare/manifest.js'
import { TONGHUASHUN_MANIFEST } from './tonghuashun/manifest.js'
import { WEBFEED_MANIFEST } from './webfeed/manifest.js'
import { TENCENT_MANIFEST } from './tencent/manifest.js'
import { testTushareConnection } from './tushare/api/client.js'
import { testTickflowConnection } from './tickflow/api/client.js'
import { testBaostockConnection } from './baostock/api/client.js'
import { testZzshareConnection } from './zzshare/api/client.js'
import { testTonghuashunConnection } from './tonghuashun/api/client.js'
import { testWebfeedConnection } from './webfeed/api/probe.js'
import { testTencentConnection } from './tencent/api/probe.js'
import type { ProviderConfigStore } from './config-store.js'
import { getManifestRegistry, type ManifestRegistry } from './manifest-registry.js'
import {
  type OpptrixProviderModule,
  type ProviderJsonManifest,
  type ProviderTestConnectionHook,
  providerJsonToManifest,
  validateProviderJson,
} from './provider-module-types.js'

const BUILTIN_MANIFESTS = [
  TUSHARE_MANIFEST,
  TICKFLOW_MANIFEST,
  BINANCE_MANIFEST,
  OKX_MANIFEST,
  BAOSTOCK_MANIFEST,
  ZZSHARE_MANIFEST,
  TONGHUASHUN_MANIFEST,
  TENCENT_MANIFEST,
  WEBFEED_MANIFEST,
]

function resolveDriverExport(mod: OpptrixProviderModule): RegistryProvider {
  const raw = mod.driver
  if (typeof raw !== 'function') return raw
  if (raw.prototype && typeof raw.prototype.capabilities === 'function') {
    return new (raw as new () => RegistryProvider)()
  }
  return (raw as () => RegistryProvider)()
}

function statInstalledAt(installDir: string): string {
  try {
    return fs.statSync(installDir).mtime.toISOString()
  } catch {
    return new Date(0).toISOString()
  }
}

export class ProviderLoader {
  private installed = new Map<string, InstalledProviderRecord>()
  private testHooks = new Map<string, ProviderTestConnectionHook>()

  constructor(
    private registry: DriverRegistry,
    private configStore: ProviderConfigStore,
    private manifestRegistry: ManifestRegistry = getManifestRegistry(),
  ) {}

  registerBuiltins(): number {
    const count = registerAllDrivers(this.registry)
    for (const manifest of BUILTIN_MANIFESTS) {
      this.manifestRegistry.register(manifest, 'builtin')
    }
    this.registerBuiltinTestHooks()
    return count
  }

  private registerBuiltinTestHooks(): void {
    this.testHooks.set('tushare', async ({ overrides, extra }) => {
      const token = String(
        overrides?.token ?? extra.token ?? process.env.TUSHARE_TOKEN ?? '',
      ).trim()
      return testTushareConnection(token)
    })
    this.testHooks.set('tickflow', async ({ overrides, extra }) => {
      const apiKey = String(
        overrides?.apiKey ?? extra.apiKey ?? process.env.TICKFLOW_API_KEY ?? process.env.OPPTRIX_TICKFLOW_API_KEY ?? '',
      ).trim()
      return testTickflowConnection(apiKey)
    })
    this.testHooks.set('baostock', async () => testBaostockConnection())
    this.testHooks.set('zzshare', async ({ overrides, extra }) => {
      const apiKey = String(
        overrides?.apiKey ?? extra.apiKey ?? process.env.ZZSHARE_TOKEN ?? process.env.OPPTRIX_ZZSHARE_API_KEY ?? '',
      ).trim()
      return testZzshareConnection(apiKey || undefined)
    })
    this.testHooks.set('tonghuashun', async ({ overrides, extra }) => {
      const apiKey = String(
        overrides?.apiKey ?? extra.apiKey ?? process.env.FUYAO_TOKEN ?? process.env.OPPTRIX_FUYAO_API_KEY ?? process.env.OPPTRIX_TONGHUASHUN_API_KEY ?? '',
      ).trim()
      return testTonghuashunConnection(apiKey)
    })
    this.testHooks.set('webfeed', async () => testWebfeedConnection())
    this.testHooks.set('tencent', async () => testTencentConnection())
  }

  getTestConnectionHook(providerId: string): ProviderTestConnectionHook | undefined {
    return this.testHooks.get(providerId)
  }

  async loadInstalled(): Promise<InstalledProviderRecord[]> {
    this.manifestRegistry.clearInstalled()
    this.unloadInstalledDrivers()

    const providersDir = resolveProvidersDir()
    if (!fs.existsSync(providersDir)) return []

    const loaded: InstalledProviderRecord[] = []
    for (const ent of fs.readdirSync(providersDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue
      const installDir = path.join(providersDir, ent.name)
      const manifestPath = path.join(installDir, 'provider.json')
      if (!fs.existsSync(manifestPath)) continue

      try {
        const record = await this.loadFromDirectory(installDir)
        loaded.push(record)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[ProviderLoader] skip ${ent.name}: ${msg}`)
      }
    }

    this.registry.refreshPriorities(this.configStore)
    return loaded
  }

  private unloadInstalledDrivers(): void {
    for (const id of [...this.installed.keys()]) {
      this.registry.unregister(id)
      this.testHooks.delete(id)
    }
    this.installed.clear()
  }

  private async loadFromDirectory(installDir: string): Promise<InstalledProviderRecord> {
    const manifestPath = path.join(installDir, 'provider.json')
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
    const json = validateProviderJson(raw)

    if (this.manifestRegistry.getSource(json.providerId) === 'builtin') {
      throw new Error(`与内置数据源 ${json.providerId} 冲突`)
    }

    const entryPath = path.resolve(installDir, json.entry)
    if (!fs.existsSync(entryPath)) {
      throw new Error(`入口文件不存在: ${json.entry}`)
    }

    const mod = await import(pathToFileURL(entryPath).href) as OpptrixProviderModule & { default?: OpptrixProviderModule }
    const bundle = mod.default ?? mod
    if (!bundle?.driver) throw new Error('模块未导出 driver')

    const driver = resolveDriverExport(bundle)
    if (driver.name !== json.providerId) {
      throw new Error(`driver.name (${driver.name}) 与 providerId (${json.providerId}) 不一致`)
    }

    const manifest = bundle.manifest ?? providerJsonToManifest(json)
    this.manifestRegistry.register(manifest, 'installed')
    this.registry.register(driver)

    if (typeof bundle.testConnection === 'function') {
      this.testHooks.set(json.providerId, bundle.testConnection.bind(bundle))
    }

    const record: InstalledProviderRecord = {
      providerId: json.providerId,
      version: json.version ?? '0.0.0',
      title: json.title,
      subtitle: json.subtitle,
      marketGroup: json.marketGroup,
      defaultPriority: json.defaultPriority,
      installDir,
      entry: json.entry,
      installedAt: statInstalledAt(installDir),
      loaded: true,
    }
    this.installed.set(json.providerId, record)
    return record
  }

  async activate(providerId: string): Promise<void> {
    const runtime = this.configStore.getRuntime(providerId)
    this.configStore.save(providerId, { enabled: true, extra: runtime.extra })

    if (!this.registry.get(providerId)) {
      const record = this.installed.get(providerId)
      if (record) {
        await this.loadFromDirectory(record.installDir)
      } else {
        const installDir = path.join(resolveProvidersDir(), providerId)
        if (fs.existsSync(path.join(installDir, 'provider.json'))) {
          await this.loadFromDirectory(installDir)
        }
      }
    }

    this.registry.refreshPriorities(this.configStore)
  }

  deactivate(providerId: string): void {
    const runtime = this.configStore.getRuntime(providerId)
    this.configStore.save(providerId, { enabled: false, extra: runtime.extra })

    if (this.installed.has(providerId)) {
      this.registry.unregister(providerId)
      const record = this.installed.get(providerId)!
      this.installed.set(providerId, { ...record, loaded: false })
    }

    this.registry.refreshPriorities(this.configStore)
  }

  async rescan(): Promise<InstalledProviderRecord[]> {
    return this.loadInstalled()
  }

  uninstall(providerId: string): boolean {
    if (this.manifestRegistry.getSource(providerId) === 'builtin') {
      throw new Error('无法移除内置数据源')
    }
    const installDir = this.installed.get(providerId)?.installDir
      ?? path.join(resolveProvidersDir(), providerId)
    if (!fs.existsSync(installDir)) return false

    if (this.registry.get(providerId)) this.registry.unregister(providerId)
    this.manifestRegistry.unregister(providerId)
    this.testHooks.delete(providerId)
    this.installed.delete(providerId)
    fs.rmSync(installDir, { recursive: true, force: true })
    this.registry.refreshPriorities(this.configStore)
    return true
  }

  async reload(providerId: string): Promise<InstalledProviderRecord | null> {
    const record = this.installed.get(providerId)
    const installDir = record?.installDir ?? path.join(resolveProvidersDir(), providerId)

    if (this.registry.get(providerId)) this.registry.unregister(providerId)
    this.manifestRegistry.unregister(providerId)
    this.testHooks.delete(providerId)
    this.installed.delete(providerId)

    if (!fs.existsSync(path.join(installDir, 'provider.json'))) return null

    const next = await this.loadFromDirectory(installDir)
    this.registry.refreshPriorities(this.configStore)
    return next
  }

  listInstalled(): InstalledProviderRecord[] {
    return [...this.installed.values()]
  }

  /** Read provider.json without loading the driver module */
  readProviderJson(installDir: string): ProviderJsonManifest {
    const manifestPath = path.join(installDir, 'provider.json')
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
    return validateProviderJson(raw)
  }
}

let sharedLoader: ProviderLoader | null = null

export function createProviderLoader(
  registry: DriverRegistry,
  configStore: ProviderConfigStore,
): ProviderLoader {
  sharedLoader = new ProviderLoader(registry, configStore)
  return sharedLoader
}

export function getProviderLoader(): ProviderLoader | null {
  return sharedLoader
}

export function resetProviderLoader(): void {
  sharedLoader = null
}
