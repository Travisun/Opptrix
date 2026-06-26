import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import yaml from 'js-yaml'

const CONFIG_DIR = path.join(os.homedir(), '.a_stock_layer')
const CONFIG_PATH = path.join(CONFIG_DIR, 'writer-config.yaml')

export interface WechatConfig {
  appid?: string
  secret?: string
  author?: string
}

export interface WriterRuntimeConfig {
  wechat?: WechatConfig
  theme?: string
  skip_publish?: boolean
}

const DEFAULTS: WriterRuntimeConfig = {
  theme: 'minimal-clean',
  skip_publish: true,
  wechat: { author: '' },
}

export function writerConfigPath() {
  return CONFIG_PATH
}

export function loadWriterConfig(): WriterRuntimeConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8')) as WriterRuntimeConfig
      return { ...DEFAULTS, ...raw, wechat: { ...DEFAULTS.wechat, ...raw.wechat } }
    }
  } catch { /* defaults */ }
  return { ...DEFAULTS }
}

export function saveWriterConfig(partial: WriterRuntimeConfig) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const next = { ...loadWriterConfig(), ...partial, wechat: { ...loadWriterConfig().wechat, ...partial.wechat } }
  fs.writeFileSync(CONFIG_PATH, yaml.dump(next), 'utf8')
  return next
}

export function wechatConfigured(cfg = loadWriterConfig()) {
  return !!(cfg.wechat?.appid && cfg.wechat?.secret && !cfg.skip_publish)
}
