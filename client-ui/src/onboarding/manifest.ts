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
      'v0.6.28 已就绪：更顺的启程引导、更稳的聊天体验、更清爽的市场动态看板。',
    updateLine: '欢迎回来。你的会话、关注列表与配置已保留，可直接继续投研。',
    features: [
      {
        kicker: '这一版',
        title: '升级后，先带你走完启程引导',
        desc:
          '连接大模型、确认行情来源、阅读协议——几步即可进入状态，不必自己摸索入口。',
        note: '老用户升级后也会看到本版亮点说明。',
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
          '流式对话时布局不再抖动；设置、新闻与桌面壳层细节打磨，日常操作更顺畅。',
        note: '把精力留给判断，而不是和界面对抗。',
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
  legal: {
    title: '开始使用前',
    desc: '请阅读下方用户协议。勾选即表示同意用户协议与隐私政策。本软件仅供学习与研究参考，不构成任何投资建议。',
  },
} as const
