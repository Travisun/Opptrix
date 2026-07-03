import type { ProviderManifest } from '@opptrix/shared'

export type ManifestSource = 'builtin' | 'installed'

interface ManifestEntry {
  manifest: ProviderManifest
  source: ManifestSource
}

export class ManifestRegistry {
  private entries = new Map<string, ManifestEntry>()

  register(manifest: ProviderManifest, source: ManifestSource): void {
    this.entries.set(manifest.providerId, { manifest, source })
  }

  unregister(providerId: string): void {
    this.entries.delete(providerId)
  }

  list(): ProviderManifest[] {
    return [...this.entries.values()].map(e => e.manifest)
  }

  get(providerId: string): ProviderManifest | undefined {
    return this.entries.get(providerId)?.manifest
  }

  getSource(providerId: string): ManifestSource | undefined {
    return this.entries.get(providerId)?.source
  }

  clearInstalled(): void {
    for (const [id, entry] of this.entries) {
      if (entry.source === 'installed') this.entries.delete(id)
    }
  }
}

let sharedRegistry: ManifestRegistry | null = null

export function getManifestRegistry(): ManifestRegistry {
  if (!sharedRegistry) sharedRegistry = new ManifestRegistry()
  return sharedRegistry
}

export function resetManifestRegistry(): void {
  sharedRegistry = null
}
