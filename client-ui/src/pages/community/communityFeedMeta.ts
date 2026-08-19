import type { CommunityFeedKind } from '../../types/schemas'

export const COMMUNITY_TAB_OPTIONS: { value: CommunityFeedKind; label: string }[] = [
  { value: 'latest', label: '最新' },
  { value: 'hot', label: '本周热议' },
  { value: 'research_strategy', label: '投研策略' },
  { value: 'lounge', label: '茶馆闲聊' },
]

const TAB_STORAGE_KEY = 'opptrix.community.feed.kind'

const EMPTY_HINTS: Partial<Record<CommunityFeedKind, { title: string; hint: string }>> = {
  latest: {
    title: '还没有社区帖子',
    hint: '去社区看看最新讨论，或稍后再来',
  },
  hot: {
    title: '本周还没有热议帖子',
    hint: '参与讨论或改看「最新」',
  },
  research_strategy: {
    title: '投研策略板块还没有帖子',
    hint: '欢迎去社区分享你的方法论',
  },
  lounge: {
    title: '茶馆还没有新闲聊',
    hint: '轻松聊聊，或改看其他板块',
  },
}

export function readStoredCommunityFeedKind(): CommunityFeedKind {
  if (typeof sessionStorage === 'undefined') return 'latest'
  try {
    const raw = sessionStorage.getItem(TAB_STORAGE_KEY)
    if (raw && COMMUNITY_TAB_OPTIONS.some(opt => opt.value === raw)) {
      return raw as CommunityFeedKind
    }
  } catch {
    // sessionStorage unavailable
  }
  return 'latest'
}

export function persistCommunityFeedKind(kind: CommunityFeedKind): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(TAB_STORAGE_KEY, kind)
  } catch {
    // ignore quota / privacy mode
  }
}

export function emptyStateForKind(kind: CommunityFeedKind): { title: string; hint: string } {
  return EMPTY_HINTS[kind] ?? {
    title: '还没有可展示的帖子',
    hint: '前往社区看看，或稍后再来',
  }
}

export function isCategoryFeedKind(kind: CommunityFeedKind): kind is 'research_strategy' | 'lounge' {
  return kind === 'research_strategy' || kind === 'lounge'
}
