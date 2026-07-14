/**
 * 启动引导文案 — 面向投资者，发版时更新。
 * 维护说明见 `.cursor/rules/onboarding.mdc`
 *
原则：强调「替你完成什么 / 带来什么价值」；**禁止**在引导文案中写桌面/Web、技术栈、工具数量等实现细节。发版差异写在 `ONBOARDING_RELEASE_BY_VERSION` 的价值句里，而非渠道形态。
 */

export interface OnboardingFeatureSlide {
  /** 短标题，一屏一句 */
  title: string
  /** 面向用户的价值说明 */
  desc: string
  /** 可选补充，更轻的次要行 */
  note?: string
  /** 轮播顶栏短标签；缺省为「亮点 N」 */
  kicker?: string
}

export interface OnboardingReleaseContent {
  welcomeTitle: string
  welcomeSubtitle: string
  /** 老用户回归时替代 welcomeSubtitle */
  updateLine?: string
  features: OnboardingFeatureSlide[]
}

const DEFAULT_RELEASE: OnboardingReleaseContent = {
  welcomeTitle: '全球市场的投研，一句话说清楚',
  welcomeSubtitle:
    '你用日常中文提问，Opptrix 替你查证、整理、呈现——把分散在各处的行情与观点，收束成读得懂的报告。',
  features: [
    {
      kicker: '替你查证',
      title: '问一句，得来一份完整报告',
      desc:
        '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
      note: '不必亲手在十几个页面之间拼资料。',
    },
    {
      kicker: '替你拓宽',
      title: '跨市场研究，不再割裂',
      desc:
        'A 股、美股、港股、日股、韩股与加密货币，标的搜索与分析在同一条对话里完成。',
      note: '一个助手，覆盖你的全球关注。',
    },
    {
      kicker: '替你聚焦',
      title: '关注标的，关键变化一屏可见',
      desc:
        '自选列表、个股详情、策略发现与决策洞察收在同一投研视野，更快抓住值得跟进的信号。',
      note: '少切换，多判断。',
    },
    {
      kicker: '替你理清',
      title: '要闻与市况，按你的节奏送达',
      desc:
        '订阅关心的信息源，透过摘要掌握要闻与盘面动态，再决定要不要深读。',
      note: '重要的事，不会被信息洪流淹没。',
    },
  ],
}

export const ONBOARDING_RELEASE_BY_VERSION: Record<string, OnboardingReleaseContent> = {
  '0.6.0': {
    welcomeTitle: '全球市场的投研，一句话说清楚',
    welcomeSubtitle:
      '新版本已就绪：更顺的启程体验、更完整的行情接入、更丰满的个股视野。',
    updateLine: '欢迎回来。你的会话与关注列表已保留，可直接继续投研。',
    features: [
      {
        kicker: '替你查证',
        title: '问一句，得来一份完整报告',
        desc:
          '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
        note: '不必亲手在十几个页面之间拼资料。',
      },
      {
        kicker: '替你拓宽',
        title: '跨市场研究，不再割裂',
        desc:
          'A 股、美股、港股、日股、韩股与加密货币，标的搜索与分析在同一条对话里完成。',
        note: '一个助手，覆盖你的全球关注。',
      },
      {
        kicker: '替你聚焦',
        title: '关注标的，关键变化一屏可见',
        desc:
          '自选列表、个股详情、策略发现与决策洞察收在同一投研视野，更快抓住值得跟进的信号。',
        note: '少切换，多判断。',
      },
      {
        kicker: '这一版',
        title: '个股洞察，更集中、更完整',
        desc:
          '评分、筹码、研报观点与走势摘要尽量同屏呈现；常用行情开箱即用，专业数据源可按需接入。',
        note: '把精力留给判断，而不是找入口。',
      },
    ],
  },
  '0.6.28': {
    welcomeTitle: '全球市场的投研，一句话说清楚',
    welcomeSubtitle:
      '更顺的启程引导、更稳的聊天体验、更清爽的市场动态看板，帮你更快进入投研状态。',
    updateLine: '欢迎回来。你的会话、关注列表与配置已保留，可直接继续投研。',
    features: [
      {
        kicker: '这一版',
        title: '升级后，先带你走完启程引导',
        desc:
          '连接大模型、确认行情来源、阅读协议——几步即可进入状态，不必自己摸索入口。',
        note: '几步完成配置，即可继续投研。',
      },
      {
        kicker: '替你查证',
        title: '问一句，得来一份完整报告',
        desc:
          '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
        note: '不必亲手在十几个页面之间拼资料。',
      },
      {
        kicker: '替你聚焦',
        title: '市场动态，一屏看清盘面',
        desc:
          '主要指数、涨跌榜、美股龙头与关注标的报价集中展示，快速把握当下市况。',
        note: '常用行情开箱即用。',
      },
      {
        kicker: '更顺手',
        title: '聊天与界面更稳、更静',
        desc:
          '对话时页面不再来回跳动；设置、新闻等日常操作也更顺畅。',
        note: '把精力留给判断，而不是和界面对抗。',
      },
    ],
  },
  '0.6.29': {
    welcomeTitle: '全球市场的投研，一句话说清楚',
    welcomeSubtitle:
      '这一版让 A 股本地研究更顺畅：整理资料时其他功能照常可用，按条件找股、看行业也更快。',
    updateLine: '欢迎回来。你的会话、关注列表与已保存的资料都还在，可直接继续投研。',
    features: [
      {
        kicker: '更流畅',
        title: '整理资料时，不再整页卡住',
        desc:
          '下载或更新 A 股历史数据时，你仍可以改设置、看行情、继续聊天。',
        note: '不用干等，思路不断线。',
      },
      {
        kicker: '替你筛选',
        title: '按条件找股票，更快出结果',
        desc:
          '行业、评分、估值等条件组合筛选，名单更快出来；各行业涨跌与代表股也可一眼浏览。',
        note: '资料准备好后，不必联网也能先做一轮初选。',
      },
      {
        kicker: '替你掌控',
        title: '基础资料进度，随时能看清',
        desc:
          '在设置里即可查看基础数据的准备情况，哪些已完成、哪些还在进行，一眼明了。',
        note: '心里有数，再决定要不要深入筛股。',
      },
      {
        kicker: '替你查证',
        title: '问一句，得来一份完整报告',
        desc:
          '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
        note: '不必亲手在十几个页面之间拼资料。',
      },
    ],
  },
  '0.6.30': {
    welcomeTitle: '全球市场的投研，一句话说清楚',
    welcomeSubtitle:
      '这一版让 A 股本地研究更顺畅：整理资料时其他功能照常可用，按条件找股、看行业也更快。',
    updateLine: '欢迎回来。你的会话、关注列表与已保存的资料都还在，可直接继续投研。',
    features: [
      {
        kicker: '更流畅',
        title: '整理资料时，不再整页卡住',
        desc:
          '下载或更新 A 股历史数据时，你仍可以改设置、看行情、继续聊天。',
        note: '不用干等，思路不断线。',
      },
      {
        kicker: '替你筛选',
        title: '按条件找股票，更快出结果',
        desc:
          '行业、评分、估值等条件组合筛选，名单更快出来；各行业涨跌与代表股也可一眼浏览。',
        note: '资料准备好后，不必联网也能先做一轮初选。',
      },
      {
        kicker: '替你掌控',
        title: '基础资料进度，随时能看清',
        desc:
          '在设置里即可查看基础数据的准备情况，哪些已完成、哪些还在进行，一眼明了。',
        note: '心里有数，再决定要不要深入筛股。',
      },
      {
        kicker: '替你查证',
        title: '问一句，得来一份完整报告',
        desc:
          '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
        note: '不必亲手在十几个页面之间拼资料。',
      },
    ],
  },
  '0.6.31': {
    welcomeTitle: '全球市场的投研，一句话说清楚',
    welcomeSubtitle:
      '这一版让本地行情资料更稳：同步与导出更可靠，更新安装也更干净。',
    updateLine: '欢迎回来。你的会话、关注列表与已保存的资料都还在，可直接继续投研。',
    features: [
      {
        kicker: '更可靠',
        title: '本地资料同步，少卡死、真落盘',
        desc:
          '整理或导出 A 股基础资料时，进度更不容易卡住，完成状态也会真正写入本地。',
        note: '资料准备好，心里才有底。',
      },
      {
        kicker: '更顺手',
        title: '按条件找股、看行业，沿用上一版体验',
        desc:
          '行业、评分等筛选与行业涨跌一览继续保持更快响应；整理资料时仍可同时使用其他功能。',
        note: '研究节奏不被打断。',
      },
      {
        kicker: '替你查证',
        title: '问一句，得来一份完整报告',
        desc:
          '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
        note: '不必亲手在十几个页面之间拼资料。',
      },
    ],
  },
  '0.6.32': {
    welcomeTitle: '全球市场的投研，一句话说清楚',
    welcomeSubtitle:
      '这一版修好了 Windows 安装包构建，本地行情与同步体验继续沿用上一版。',
    updateLine: '欢迎回来。你的会话、关注列表与已保存的资料都还在，可直接继续投研。',
    features: [
      {
        kicker: '更可靠',
        title: 'Windows 安装与更新更顺畅',
        desc:
          '修复了影响 Windows 打包的问题，后续安装与自动更新可以正常产出。',
        note: '三端安装包重新可用。',
      },
      {
        kicker: '替你查证',
        title: '问一句，得来一份完整报告',
        desc:
          '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
        note: '不必亲手在十几个页面之间拼资料。',
      },
    ],
  },
  '0.6.33': {
    welcomeTitle: '全球市场的投研，一句话说清楚',
    welcomeSubtitle:
      '这一版修好了安装后无法启动的问题，升级后即可正常进入投研。',
    updateLine: '欢迎回来。你的会话、关注列表与已保存的资料都还在，可直接继续投研。',
    features: [
      {
        kicker: '更可靠',
        title: '安装与更新后，应用可正常启动',
        desc:
          '修复了安装包缺少运行组件导致无法打开的问题，重新安装或更新后即可使用。',
        note: '不必再手动补装依赖。',
      },
      {
        kicker: '替你查证',
        title: '问一句，得来一份完整报告',
        desc:
          '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
        note: '不必亲手在十几个页面之间拼资料。',
      },
    ],
  },
  '0.6.34': {
    welcomeTitle: '全球市场的投研，一句话说清楚',
    welcomeSubtitle:
      '这一版修好了 Windows 自动更新校验，安装与后续升级更稳妥。',
    updateLine: '欢迎回来。你的会话、关注列表与已保存的资料都还在，可直接继续投研。',
    features: [
      {
        kicker: '更可靠',
        title: 'Windows 自动更新可正常安装',
        desc:
          '修复了更新包签名校验失败导致无法升级的问题。若你仍在更早版本，请先手动安装本版一次。',
        note: '之后即可继续使用应用内检查更新。',
      },
      {
        kicker: '替你查证',
        title: '问一句，得来一份完整报告',
        desc:
          '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
        note: '不必亲手在十几个页面之间拼资料。',
      },
    ],
  },
  '0.6.35': {
    welcomeTitle: '全球市场的投研，一句话说清楚',
    welcomeSubtitle:
      '这一版加固了桌面安装包与后台服务启动校验，三端发布更可靠。',
    updateLine: '欢迎回来。你的会话、关注列表与已保存的资料都还在，可直接继续投研。',
    features: [
      {
        kicker: '更可靠',
        title: '安装包后台服务可正常启动',
        desc:
          '修复了打包校验阶段依赖解析冲突，确保应用内服务与本地行情组件按正确版本加载。',
        note: '安装或更新后可直接使用。',
      },
      {
        kicker: '替你查证',
        title: '问一句，得来一份完整报告',
        desc:
          '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
        note: '不必亲手在十几个页面之间拼资料。',
      },
    ],
  },
  '0.6.36': {
    welcomeTitle: '全球市场的投研，一句话说清楚',
    welcomeSubtitle:
      '这一版修好了安装后本地服务无法启动的问题，打开即可使用。',
    updateLine: '欢迎回来。你的会话、关注列表与已保存的资料都还在，可直接继续投研。',
    features: [
      {
        kicker: '更可靠',
        title: '安装后本地服务可正常连接',
        desc:
          '修复了安装包内依赖目录未正确就位导致接口无法启动的问题。',
        note: '重新安装或更新到本版后即可正常使用。',
      },
      {
        kicker: '替你查证',
        title: '问一句，得来一份完整报告',
        desc:
          '按你的问题调取行情、财务、新闻与观点摘要，整理成中文可读结论。执行过程清晰可见，有据可查。',
        note: '不必亲手在十几个页面之间拼资料。',
      },
    ],
  },
}

export function resolveOnboardingRelease(appVersion: string): OnboardingReleaseContent {
  const normalized = appVersion.replace(/^v/i, '').trim()
  if (!normalized) return DEFAULT_RELEASE

  let bestKey = ''
  for (const key of Object.keys(ONBOARDING_RELEASE_BY_VERSION)) {
    if (normalized.startsWith(key) && key.length > bestKey.length) {
      bestKey = key
    }
  }
  if (bestKey) return ONBOARDING_RELEASE_BY_VERSION[bestKey]!
  return DEFAULT_RELEASE
}

export function isReturningUser(state: { completedAt: string | null } | null | undefined): boolean {
  return Boolean(state?.completedAt)
}

/** 各配置步的用户文案 */
export const ONBOARDING_COPY = {
  llm: {
    title: '连接你的大模型',
    desc: '添加大模型服务后即可开始对话。现在跳过也没关系，随时可在设置里更换。',
    readyLead: '你已配置好大模型，对话与分析将使用以下模型。',
  },
  data: {
    title: '行情来源',
    desc: '以下是已为你准备的行情渠道。免费来源可直接使用；专业数据需在设置中填入账号后启用。',
  },
  fuyao: {
    title: '获取历史K线',
    desc: '现在支持从同花顺扶摇 API 免费下载和同步所有 A 股标的的历史日 K 数据。',
    readyLead: '扶摇 API 已就绪，可开始下载并同步历史日 K。',
    readyBadge: '已连接同花顺扶摇',
    readyEnabled: '数据源已启用，全市场历史日 K 可在本地同步与查询。',
    readyDisabled: '密钥已保存。点「继续」后将自动启用，并开始同步历史日 K。',
    apiGuideTitle: '获取 API Key（免费）',
    apiGuideSteps: [
      '打开扶摇开放平台（见下方链接），注册或登录你的账号',
      '在控制台新建应用，复制以 sk-fuyao- 开头的 API Key',
      '粘贴到下方输入框，点「继续」——我们会先验证，通过后自动开始同步',
    ],
    apiPortalLinkLabel: '前往扶摇开放平台',
    apiFieldLabel: 'API Key',
    apiFieldHint: '仅保存在你的电脑上，不会上传云端',
    apiPlaceholder: '粘贴以 sk-fuyao- 开头的密钥',
    emptyKeyError: '请先填写 API Key，或点「稍后配置」跳过',
    testFailedError: '密钥验证未通过，请检查是否复制完整',
  },
  legal: {
    title: '开始使用前',
    desc: '请阅读下方用户协议。勾选即表示同意用户协议与隐私政策。本软件仅供学习与研究参考，不构成任何投资建议。',
  },
} as const
