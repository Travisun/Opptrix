import type { SettingsSection } from './settingsTypes'

export interface SettingsSearchEntry {
  section: SettingsSection
  group?: string
  title: string
  desc?: string
  keywords?: string[]
}

function fold(text: string): string {
  return text.toLowerCase().trim()
}

function haystack(entry: SettingsSearchEntry): string {
  return fold([
    entry.group,
    entry.title,
    entry.desc,
    ...(entry.keywords ?? []),
  ].filter(Boolean).join(' '))
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  // 分类
  { section: 'general', title: '常规', desc: '管理默认评分卡与后端连接状态' },
  { section: 'models', title: '模型', desc: '配置 LLM 提供商与可用模型' },
  { section: 'data_providers', title: '数据源', desc: '管理行情与资讯数据提供商、拖拽回退顺序', keywords: ['priority', '回退', '拖拽', '排序'] },
  { section: 'news_feed', title: '新闻订阅', desc: '管理 RSS 订阅与资讯更新频率' },
  { section: 'translation', title: '翻译', desc: '配置新闻阅读的离线翻译与远程大模型回退' },
  { section: 'multimodal', title: '多模态', desc: '配置图片 OCR、语音转写与文章媒体自动提取策略' },
  { section: 'about', title: '关于 Opptrix', desc: '产品说明、版本更新、法律条款与帮助反馈' },
  { section: 'about', title: '应用更新', desc: '检查更新与重启安装', keywords: ['版本', '升级', '热更新'] },
  { section: 'about', title: '检查更新', keywords: ['更新', 'upgrade'] },
  { section: 'about', title: '官方网站', desc: 'Opptrix 官网', keywords: ['官网', 'opptrix.org', '网站'] },
  { section: 'about', title: '用户协议', keywords: ['条款', 'legal', 'agreement'] },
  { section: 'about', title: '隐私政策', keywords: ['privacy', '隐私'] },
  { section: 'about', title: '免责声明', keywords: ['免责', 'disclaimer', '风险'] },
  { section: 'about', title: '项目主页', desc: 'GitHub 仓库与文档', keywords: ['github', '主页', '源代码'] },
  { section: 'about', title: '反馈问题', desc: '报告缺陷或提议功能', keywords: ['bug', 'issue', '建议', '功能缺陷'] },
  { section: 'about', title: '安全漏洞', desc: '按安全政策报告安全问题', keywords: ['漏洞', 'security', '安全政策'] },

  // 常规
  { section: 'general', group: '外观', title: '主题', desc: '浅色深色跟随系统', keywords: ['theme', 'dark', 'light', '暗黑', '深色', '浅色', '外观'] },
  { section: 'general', group: '偏好', title: '评分卡', desc: '因子评估默认使用的评分模板', keywords: ['scorecard', 'G=B+M', '因子'] },
  { section: 'general', group: '连接', title: '后端连接', desc: '检查 API 服务与 LLM 提供商配置', keywords: ['测试', 'health', '连接'] },

  // 模型
  { section: 'models', title: '模型提供商', desc: '配置 Base URL 与 API Key', keywords: ['LLM', 'OpenAI', 'API', '密钥', '提供商'] },
  { section: 'models', title: '添加模型提供商', keywords: ['新增', '添加'] },
  { section: 'models', title: '编辑模型提供商', keywords: ['修改'] },

  // 数据源
  { section: 'data_providers', group: 'A 股', title: 'Tushare Pro', keywords: ['tushare', '行情源', 'token'] },
  { section: 'data_providers', group: 'A 股', title: 'API Token', desc: '粘贴 Token', keywords: ['token', '密钥'] },
  { section: 'data_providers', title: '能力绑定', keywords: ['binding', 'override'] },

  // 新闻订阅
  { section: 'news_feed', title: 'RSS 订阅', desc: '添加订阅源', keywords: ['订阅', 'RSSHub', 'Atom', '资讯', '新闻中心'] },
  { section: 'news_feed', title: '订阅分组', keywords: ['分组', '文件夹'] },
  { section: 'news_feed', title: '导出订阅', keywords: ['导出'] },
  { section: 'news_feed', title: '导入订阅', keywords: ['导入'] },
  { section: 'news_feed', group: '本地存储', title: '保留年限', desc: '历史文章保留时间', keywords: ['清理', '归档'] },
  { section: 'news_feed', group: '本地存储', title: '文章数量上限', desc: '超出后自动清理旧文章', keywords: ['上限', '容量'] },
  { section: 'news_feed', group: '更新', title: '自动刷新间隔', desc: '打开新闻中心时后台拉取', keywords: ['刷新', '间隔'] },
  { section: 'news_feed', group: '更新', title: '上次更新', keywords: ['拉取时间'] },

  // 翻译
  { section: 'translation', group: '翻译服务', title: '服务类型', desc: '离线优先或远程大模型', keywords: ['离线', '远程', 'offline', 'remote'] },
  { section: 'translation', group: '离线翻译', title: '离线翻译模型', desc: '本地下载 HY-MT 等模型', keywords: ['HY-MT', 'GGUF', '下载', '腾讯'] },
  { section: 'translation', group: '远程翻译', title: '提供商', desc: '远程翻译 API 提供商' },
  { section: 'translation', group: '远程翻译', title: '模型名称', desc: '远程翻译使用的模型' },

  // 多模态
  { section: 'multimodal', group: '处理策略', title: '启用媒体提取', desc: '图片音频视频提取文字', keywords: ['OCR', '提取'] },
  { section: 'multimodal', group: '处理策略', title: '处理时机', desc: '按需或后台自动处理', keywords: ['后台', '按需'] },
  { section: 'multimodal', group: '处理策略', title: '提取范围', desc: '图片音频视频', keywords: ['图片', '音频', '视频'] },
  { section: 'multimodal', group: '图片理解', title: '提供商', desc: '远程视觉多模态模型', keywords: ['GPT-4o', 'Qwen-VL', 'GLM-4V', '视觉'] },
  { section: 'multimodal', group: '图片理解', title: '视觉模型', desc: '支持 image_url 的模型' },
  { section: 'multimodal', group: '音视频转写', title: '媒体下载', keywords: ['缓存'] },
  { section: 'multimodal', group: '音视频转写', title: 'ffmpeg', desc: '音视频解码' },
  { section: 'multimodal', group: '音视频转写', title: 'Whisper', desc: '语音转写模型', keywords: ['语音', '转写', 'ASR'] },

  // 关于
]

const SECTION_LABEL: Record<SettingsSection, string> = {
  general: '常规',
  models: '模型',
  data_providers: '数据源',
  news_feed: '新闻订阅',
  translation: '翻译',
  multimodal: '多模态',
  about: '关于 Opptrix',
}

export function settingsSectionLabel(section: SettingsSection): string {
  return SECTION_LABEL[section]
}

export function searchSettingsEntries(
  query: string,
  dynamic: SettingsSearchEntry[] = [],
): SettingsSearchEntry[] {
  const q = fold(query)
  if (!q) return []
  const tokens = q.split(/\s+/).filter(Boolean)
  const seen = new Set<string>()
  const hits: SettingsSearchEntry[] = []

  for (const entry of [...SETTINGS_SEARCH_INDEX, ...dynamic]) {
    const hay = haystack(entry)
    if (!tokens.every(token => hay.includes(token))) continue
    const key = `${entry.section}\0${entry.group ?? ''}\0${entry.title}`
    if (seen.has(key)) continue
    seen.add(key)
    hits.push(entry)
  }

  return hits
}

export function matchingSettingsSections(
  query: string,
  dynamic: SettingsSearchEntry[] = [],
): SettingsSection[] {
  const sections = new Set<SettingsSection>()
  for (const hit of searchSettingsEntries(query, dynamic)) {
    sections.add(hit.section)
  }
  return [...sections]
}
