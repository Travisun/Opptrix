#!/usr/bin/env node
/**
 * Validate experts/ static catalog: unique ids, persona in detail files,
 * catalog entries match detail metadata (without persona).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXPERTS_DIR = path.join(REPO_ROOT, 'experts')
const ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/

function fail(message) {
  console.error(`[validate-experts] ${message}`)
  process.exit(1)
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    fail(`Invalid JSON in ${path.relative(REPO_ROOT, filePath)}: ${msg}`)
  }
}

function catalogEntryWithoutPersona(entry) {
  const { persona: _persona, defaultPacks: _dp, defaultResearchTier: _tier, defaultSessionTitle: _title, complianceVersion: _cv, ...rest } = entry
  return rest
}

function assertCatalogEntryShape(entry, label) {
  for (const key of ['id', 'title', 'summary', 'icon', 'tags']) {
    if (!(key in entry)) fail(`${label} missing field: ${key}`)
  }
  if (!ID_PATTERN.test(entry.id)) fail(`${label} has invalid id: ${entry.id}`)
  if (!Array.isArray(entry.tags) || entry.tags.length === 0) {
    fail(`${label} must have at least one tag`)
  }
  if ('persona' in entry) {
    fail(`${label} must not include persona (use per-id JSON files)`)
  }
}

function assertExpertDefinition(def, label) {
  for (const key of ['id', 'title', 'summary', 'icon', 'tags', 'persona']) {
    if (!(key in def)) fail(`${label} missing field: ${key}`)
  }
  if (!ID_PATTERN.test(def.id)) fail(`${label} has invalid id: ${def.id}`)
  if (!Array.isArray(def.tags) || def.tags.length === 0) {
    fail(`${label} must have at least one tag`)
  }
  if (typeof def.persona !== 'string' || !def.persona.trim()) {
    fail(`${label} missing persona`)
  }
  if (!Array.isArray(def.defaultPacks) || def.defaultPacks.length === 0) {
    fail(`${label} missing defaultPacks`)
  }
  if (!['L1', 'L2', 'L3'].includes(def.defaultResearchTier)) {
    fail(`${label} invalid defaultResearchTier`)
  }
  if (def.complianceVersion !== '1') {
    fail(`${label} complianceVersion must be "1"`)
  }
  if (def.source !== 'builtin') {
    fail(`${label} official remote experts must use source "builtin"`)
  }
  if (def.official !== true) {
    fail(`${label} official remote experts must set official: true`)
  }
}

function main() {
  const catalogPath = path.join(EXPERTS_DIR, 'catalog.json')
  if (!fs.existsSync(catalogPath)) fail('Missing experts/catalog.json')

  const catalog = readJson(catalogPath)
  if (!Array.isArray(catalog.experts) || catalog.experts.length === 0) {
    fail('catalog.json must contain a non-empty experts array')
  }

  const seen = new Set()
  for (const entry of catalog.experts) {
    assertCatalogEntryShape(entry, `catalog entry ${entry?.id ?? '(unknown)'}`)
    if (seen.has(entry.id)) fail(`Duplicate id in catalog.json: ${entry.id}`)
    seen.add(entry.id)

    const detailPath = path.join(EXPERTS_DIR, `${entry.id}.json`)
    if (!fs.existsSync(detailPath)) {
      fail(`Missing detail file for catalog id ${entry.id}: experts/${entry.id}.json`)
    }

    const detail = readJson(detailPath)
    assertExpertDefinition(detail, `experts/${entry.id}.json`)
    if (detail.id !== entry.id) {
      fail(`Detail id mismatch for ${entry.id}: ${detail.id}`)
    }

    const catalogSlice = catalogEntryWithoutPersona(detail)
    const entryJson = JSON.stringify(entry)
    const detailJson = JSON.stringify(catalogSlice)
    if (entryJson !== detailJson) {
      fail(`catalog.json entry for ${entry.id} does not match detail metadata`)
    }
  }

  const jsonFiles = fs.readdirSync(EXPERTS_DIR).filter(name => name.endsWith('.json') && name !== 'catalog.json')
  for (const file of jsonFiles) {
    const id = file.replace(/\.json$/, '')
    if (!seen.has(id)) {
      fail(`Orphan detail file without catalog entry: experts/${file}`)
    }
  }

  console.log(`[validate-experts] OK — ${seen.size} expert(s)`)
}

main()
