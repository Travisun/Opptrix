const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MODEL_PREFERENCE = [
  /hy[-_]?mt/i,
]

const NON_TRANSLATION_PATTERNS = [
  /smolvlm/i,
]

function isTranslationModelPath(modelPath) {
  const name = path.basename(modelPath ?? '')
  if (NON_TRANSLATION_PATTERNS.some(pattern => pattern.test(name))) return false
  return MODEL_PREFERENCE.some(pattern => pattern.test(name))
}

function listGgufFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(name => name.toLowerCase().endsWith('.gguf'))
      .map(name => path.join(dir, name))
  } catch {
    return []
  }
}

function pickPreferredModel(paths) {
  if (!paths.length) return null

  const explicitName = String(process.env.OPPTRIX_TRANSLATION_MODEL ?? '').trim().toLowerCase()
  if (explicitName) {
    const explicit = paths.find(p => path.basename(p).toLowerCase().includes(explicitName))
    if (explicit) return explicit
  }

  for (const pattern of MODEL_PREFERENCE) {
    const preferred = paths.find(p => pattern.test(path.basename(p)))
    if (preferred) return preferred
  }

  return [...paths].sort((a, b) => {
    try {
      return fs.statSync(a).size - fs.statSync(b).size
    } catch {
      return 0
    }
  })[0]
}

function detectModelFamily(modelPath) {
  const name = path.basename(modelPath ?? '').toLowerCase()
  if (/hy[-_]?mt/i.test(name)) return 'hy-mt'
  return 'generic'
}

/**
 * Resolve local translation GGUF model path.
 * Search order: OPPTRIX_LLM_DIR → repo/apps/server/llms → repo/llms → ~/.opptrix/llms
 */
function resolveTranslationModelPath(repoRoot, preferredModel = '__auto__') {
  const dirs = [
    process.env.OPPTRIX_LLM_DIR,
    path.join(repoRoot, 'apps/server/llms'),
    path.join(repoRoot, 'llms'),
    path.join(os.homedir(), '.opptrix', 'llms'),
  ].filter(Boolean)

  const found = []
  for (const dir of dirs) {
    found.push(...listGgufFiles(dir))
  }

  const translationCandidates = found.filter(isTranslationModelPath)

  const preferred = String(preferredModel ?? '__auto__').trim()
  if (preferred && preferred !== '__auto__') {
    const exact = translationCandidates.find(p => path.basename(p) === preferred)
    if (exact) return exact
    const fuzzy = translationCandidates.find(p => path.basename(p).toLowerCase().includes(preferred.toLowerCase()))
    if (fuzzy) return fuzzy
  }

  return pickPreferredModel(translationCandidates)
}

module.exports = {
  resolveTranslationModelPath,
  detectModelFamily,
}
