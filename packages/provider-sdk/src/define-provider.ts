import { Capability } from '@opptrix/market-data-core'
import type {
  MarketGroup,
  ProviderBinding,
  ProviderManifest,
  ProviderSettingsDefinition,
} from '@opptrix/shared'
import { isAssetClass, isMarket } from '@opptrix/shared'
import type {
  OpptrixProviderModule,
  ProviderRuntimeContext,
  ProviderValidationResult,
} from './types.js'

export const SDK_VERSION = '0.1.0'

export const VALID_PROVIDER_JSON_SCHEMA_VERSION = 1

const MARKET_GROUPS: MarketGroup[] = ['CN', 'US', 'HK', 'CRYPTO', 'JP', 'KR', 'GLOBAL']

const CAPABILITY_VALUES = new Set<string>(Object.values(Capability))

export interface DefineProviderInput {
  id: string
  title: string
  subtitle?: string
  marketGroup: MarketGroup
  defaultPriority: number
  capabilities: Capability[]
  bindings: ProviderBinding[] | ((priority: number) => ProviderBinding[])
  settings?: ProviderSettingsDefinition
  createDriver?: (ctx: ProviderRuntimeContext) => import('@opptrix/market-data-core').RegistryProvider
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function pushNonEmptyString(errors: string[], value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} must be a non-empty string`)
  }
}

function validateMarketGroup(value: unknown, errors: string[], field = 'marketGroup') {
  if (typeof value !== 'string' || !MARKET_GROUPS.includes(value as MarketGroup)) {
    errors.push(`${field} must be one of: ${MARKET_GROUPS.join(', ')}`)
  }
}

function validatePriority(value: unknown, errors: string[], field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push(`${field} must be a positive number`)
  }
}

function validateBindings(bindings: unknown, errors: string[], field = 'bindings') {
  if (!Array.isArray(bindings)) {
    errors.push(`${field} must be an array`)
    return
  }
  bindings.forEach((binding, index) => {
    if (!isRecord(binding)) {
      errors.push(`${field}[${index}] must be an object`)
      return
    }
    if (typeof binding.market !== 'string' || !isMarket(binding.market)) {
      errors.push(`${field}[${index}].market is invalid`)
    }
    if (typeof binding.assetClass !== 'string' || !isAssetClass(binding.assetClass)) {
      errors.push(`${field}[${index}].assetClass is invalid`)
    }
    pushNonEmptyString(errors, binding.capability, `${field}[${index}].capability`)
    validatePriority(binding.defaultPriority, errors, `${field}[${index}].defaultPriority`)
  })
}

function validateCapabilities(capabilities: unknown, errors: string[], field = 'capabilities') {
  if (!Array.isArray(capabilities)) {
    errors.push(`${field} must be an array`)
    return
  }
  if (capabilities.length === 0) {
    errors.push(`${field} must not be empty`)
  }
  capabilities.forEach((cap, index) => {
    if (typeof cap !== 'string' || !CAPABILITY_VALUES.has(cap)) {
      errors.push(`${field}[${index}] is not a known capability`)
    }
  })
}

function validateSettings(settings: unknown, providerId: string | undefined, errors: string[]) {
  if (settings == null) return
  if (!isRecord(settings)) {
    errors.push('settings must be an object')
    return
  }
  pushNonEmptyString(errors, settings.providerId, 'settings.providerId')
  pushNonEmptyString(errors, settings.title, 'settings.title')
  validateMarketGroup(settings.marketGroup, errors, 'settings.marketGroup')
  if (providerId && typeof settings.providerId === 'string' && settings.providerId !== providerId) {
    errors.push('settings.providerId must match providerId')
  }
  if (!Array.isArray(settings.fields)) {
    errors.push('settings.fields must be an array')
  }
}

function validateCoreManifestFields(m: Record<string, unknown>, errors: string[]) {
  pushNonEmptyString(errors, m.providerId, 'providerId')
  pushNonEmptyString(errors, m.title, 'title')
  validateMarketGroup(m.marketGroup, errors)
  validatePriority(m.defaultPriority, errors, 'defaultPriority')

  if ('capabilities' in m) {
    validateCapabilities(m.capabilities, errors)
  }
  if ('bindings' in m) {
    validateBindings(m.bindings, errors)
  }
  if ('settings' in m) {
    validateSettings(m.settings, typeof m.providerId === 'string' ? m.providerId : undefined, errors)
  }
}

function validateJsonManifestFields(m: Record<string, unknown>, errors: string[]) {
  const schemaVersion = m.schemaVersion
  if (
    schemaVersion == null
    || (typeof schemaVersion !== 'number' && typeof schemaVersion !== 'string')
    || String(schemaVersion).trim().length === 0
  ) {
    errors.push('schemaVersion must be a non-empty number or string')
  }

  pushNonEmptyString(errors, m.entry, 'entry')

  if (!isRecord(m.engine)) {
    errors.push('engine must be an object')
  } else {
    pushNonEmptyString(errors, m.engine.minAppVersion, 'engine.minAppVersion')
    pushNonEmptyString(errors, m.engine.sdkVersion, 'engine.sdkVersion')
  }

  if ('publisher' in m && m.publisher != null) {
    if (!isRecord(m.publisher)) {
      errors.push('publisher must be an object')
    } else {
      pushNonEmptyString(errors, m.publisher.name, 'publisher.name')
    }
  }

  if ('trust' in m && m.trust != null && !isRecord(m.trust)) {
    errors.push('trust must be an object')
  }
}

/** Basic schema checks for ProviderManifest or provider.json payloads */
export function validateProviderManifest(input: unknown): ProviderValidationResult {
  const errors: string[] = []

  if (!isRecord(input)) {
    return { valid: false, errors: ['manifest must be an object'] }
  }

  validateCoreManifestFields(input, errors)

  if ('schemaVersion' in input || 'engine' in input || 'entry' in input) {
    validateJsonManifestFields(input, errors)
    if (!('capabilities' in input)) {
      errors.push('capabilities is required')
    }
    if (!('bindings' in input)) {
      errors.push('bindings is required')
    }
  }

  return { valid: errors.length === 0, errors }
}

export function defineProvider(input: DefineProviderInput): OpptrixProviderModule {
  const bindings = typeof input.bindings === 'function'
    ? input.bindings(input.defaultPriority)
    : input.bindings

  const manifest: ProviderManifest = {
    providerId: input.id,
    title: input.title,
    subtitle: input.subtitle,
    marketGroup: input.marketGroup,
    defaultPriority: input.defaultPriority,
    settings: input.settings,
  }

  const validation = validateProviderManifest({
    ...manifest,
    capabilities: input.capabilities,
    bindings,
  })
  if (!validation.valid) {
    throw new Error(`Invalid provider manifest: ${validation.errors.join('; ')}`)
  }

  return {
    manifest,
    capabilities: input.capabilities,
    bindings,
    settings: input.settings,
    createDriver: input.createDriver,
  }
}
