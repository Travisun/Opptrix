/**
 * ManifestBuilder — fluent builder for `opptrix.plugin.json`.
 *
 * Usage:
 *   const manifest = new ManifestBuilder('com.example.my-ext', '1.0.0')
 *     .setName('My Extension')
 *     .setPermissions('storage', 'events.subscribe')
 *     .setActivation('catalog_only')
 *     .build()
 */

import type {
  ExtensionManifest,
  ExtensionPermission,
  ExtensionActivationMode,
} from './types.js'

export class ManifestBuilder {
  private manifest: ExtensionManifest

  constructor(id: string, version = '1.0.0') {
    this.manifest = { id, version }
  }

  setName(name: string): this {
    this.manifest.name = name
    return this
  }

  setDescription(desc: string): this {
    this.manifest.description = desc
    return this
  }

  setPermissions(...permissions: ExtensionPermission[]): this {
    this.manifest.permissions = permissions
    return this
  }

  setActivation(mode: ExtensionActivationMode): this {
    this.manifest.activation = mode
    return this
  }

  setEntry(entry: string): this {
    this.manifest.entry = entry
    return this
  }

  addHook(hook: 'session.messageCommitted' | 'agent.toolPreExecute'): this {
    if (!this.manifest.contributes) this.manifest.contributes = {}
    if (!this.manifest.contributes.hooks) this.manifest.contributes.hooks = []
    this.manifest.contributes.hooks.push(hook)
    return this
  }

  setEngines(engines: { opptrix?: string; node?: string }): this {
    this.manifest.engines = engines
    return this
  }

  build(): ExtensionManifest {
    return { ...this.manifest }
  }

  toJSON(space?: number): string {
    return JSON.stringify(this.build(), null, space ?? 2)
  }
}
