const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/** 国内默认走 hf-mirror；设 OPPTRIX_HF_MIRROR= 可改回官方 Hugging Face */
const HF_MIRROR = String(process.env.OPPTRIX_HF_MIRROR ?? 'https://hf-mirror.com').replace(/\/$/, '')
const HF_OFFICIAL = 'https://huggingface.co'

function buildHfResolveUrl(base, repo, filename) {
  return `${base}/${repo}/resolve/main/${filename}?download=true`
}

function buildHfDownloadUrls(repo, filename) {
  return [
    {
      source: 'hf-mirror',
      label: 'HF 镜像',
      url: buildHfResolveUrl(HF_MIRROR, repo, filename),
    },
    {
      source: 'huggingface',
      label: 'Hugging Face',
      url: buildHfResolveUrl(HF_OFFICIAL, repo, filename),
    },
  ]
}

/** @type {Array<{ id: string; name: string; filename: string; urls: ReturnType<typeof buildHfDownloadUrls>; sizeBytes: number; family: string; purpose: 'translation' | 'vision'; recommended?: boolean }>} */
const TRANSLATION_MODEL_CATALOG = [
  {
    id: 'hy-mt-q4',
    name: 'HY-MT1.5-1.8B Q4_K_M',
    filename: 'HY-MT1.5-1.8B-Q4_K_M.gguf',
    urls: buildHfDownloadUrls('tencent/HY-MT1.5-1.8B-GGUF', 'HY-MT1.5-1.8B-Q4_K_M.gguf'),
    sizeBytes: 1_133_080_512,
    family: 'hy-mt',
    purpose: 'translation',
    recommended: true,
  },
  {
    id: 'hy-mt-q8',
    name: 'HY-MT1.5-1.8B Q8_0',
    filename: 'HY-MT1.5-1.8B-Q8_0.gguf',
    urls: buildHfDownloadUrls('tencent/HY-MT1.5-1.8B-GGUF', 'HY-MT1.5-1.8B-Q8_0.gguf'),
    sizeBytes: 1_908_528_288,
    family: 'hy-mt',
    purpose: 'translation',
  },
  {
    id: 'smolvlm-q8',
    name: 'SmolVLM-256M-Instruct Q8_0',
    filename: 'SmolVLM-256M-Instruct-Q8_0.gguf',
    urls: buildHfDownloadUrls('ggml-org/SmolVLM-256M-Instruct-GGUF', 'SmolVLM-256M-Instruct-Q8_0.gguf'),
    sizeBytes: 175_054_528,
    family: 'smolvlm',
    purpose: 'vision',
  },
]

/** 应用启动时后台预拉取的默认模型（翻译 + 视觉备用） */
const BOOTSTRAP_MODEL_IDS = ['hy-mt-q4', 'smolvlm-q8']

function listSearchDirs(repoRoot) {
  return [
    process.env.OPPTRIX_LLM_DIR,
    path.join(repoRoot, 'apps/server/llms'),
    path.join(repoRoot, 'llms'),
    path.join(os.homedir(), '.opptrix', 'llms'),
  ].filter(Boolean)
}

function getDefaultDownloadDir() {
  return path.resolve(os.homedir(), '.opptrix', 'llms')
}

function listInstalledModels(repoRoot) {
  const dirs = listSearchDirs(repoRoot)
  const seen = new Set()
  /** @type {Array<{ filename: string; path: string; sizeBytes: number }>} */
  const installed = []

  for (const dir of dirs) {
    let names = []
    try {
      names = fs.readdirSync(dir).filter(name => name.toLowerCase().endsWith('.gguf'))
    } catch {
      continue
    }
    for (const name of names) {
      const fullPath = path.join(dir, name)
      if (seen.has(fullPath)) continue
      seen.add(fullPath)
      let sizeBytes = 0
      try {
        sizeBytes = fs.statSync(fullPath).size
      } catch { /* ignore */ }
      installed.push({ filename: name, path: fullPath, sizeBytes })
    }
  }

  return installed.sort((a, b) => a.filename.localeCompare(b.filename, 'zh-CN'))
}

function isCatalogModelInstalled(item, installedNames) {
  const { filename, family } = item
  if (installedNames.has(filename)) return true

  if (family === 'hy-mt') {
    if (/Q4_K_M/i.test(filename)) {
      return [...installedNames].some(name => /hy[-_]?mt/i.test(name) && /Q4_K_M/i.test(name))
    }
    if (/Q8_0/i.test(filename)) {
      return [...installedNames].some(name => /hy[-_]?mt/i.test(name) && /Q8_0/i.test(name))
    }
  }

  if (family === 'smolvlm') {
    return [...installedNames].some(name => /smolvlm/i.test(name))
  }

  return false
}

function getCatalogModel(modelId) {
  return TRANSLATION_MODEL_CATALOG.find(item => item.id === modelId) ?? null
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '未知大小'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function getDefaultDownloadSourceLabel() {
  return HF_MIRROR.includes('hf-mirror') ? 'HF 镜像（hf-mirror）' : HF_MIRROR
}

function getCatalogPurposeLabel(purpose) {
  if (purpose === 'vision') return '视觉理解'
  return '文本翻译'
}

module.exports = {
  TRANSLATION_MODEL_CATALOG,
  BOOTSTRAP_MODEL_IDS,
  getCatalogModel,
  listInstalledModels,
  isCatalogModelInstalled,
  listSearchDirs,
  getDefaultDownloadDir,
  formatBytes,
  getDefaultDownloadSourceLabel,
  getCatalogPurposeLabel,
  buildHfDownloadUrls,
}
