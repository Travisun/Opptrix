import { Tab, TabList, Text, makeStyles } from '@fluentui/react-components'
import {
  DISCOVER_PROFILE_DESCRIPTIONS,
  DISCOVER_PROFILE_LABELS,
  DISCOVER_PROFILE_ORDER,
  isDiscoverProfileMiningReady,
  isProfileTabBlocked,
  type DiscoverStrategyProfile,
} from './discoverProfiles'
import type { DiscoverProfileReadiness } from '../types/schemas'
import { opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  tabList: {
    minHeight: '32px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
})

type Props = {
  selected: DiscoverStrategyProfile
  onSelect: (profile: DiscoverStrategyProfile) => void
  disabled?: boolean
  compact?: boolean
  readinessByProfile?: Partial<Record<DiscoverStrategyProfile, DiscoverProfileReadiness>>
}

export default function DiscoverProfileTabList({
  selected,
  onSelect,
  disabled,
  compact,
  readinessByProfile,
}: Props) {
  const s = useStyles()
  const hint = DISCOVER_PROFILE_DESCRIPTIONS[selected]
  const miningReady = isDiscoverProfileMiningReady(selected)
  const selectedReadiness = readinessByProfile?.[selected]

  return (
    <div className={s.root}>
      <TabList
        className={s.tabList}
        size="small"
        selectedValue={selected}
        onTabSelect={(_, data) => onSelect(data.value as DiscoverStrategyProfile)}
      >
        {DISCOVER_PROFILE_ORDER.map(id => {
          const blocked = isProfileTabBlocked(id, readinessByProfile ?? {})
          const tabDisabled = disabled || blocked
          const label = blocked ? `${DISCOVER_PROFILE_LABELS[id]} · 未就绪` : DISCOVER_PROFILE_LABELS[id]
          return (
            <Tab key={id} value={id} disabled={tabDisabled} title={readinessByProfile?.[id]?.message}>
              {label}
            </Tab>
          )
        })}
      </TabList>
      {!compact && (
        <Text className={s.hint} block>
          {selectedReadiness?.message ?? hint}
          {!miningReady ? ' · 策略库筹备中，暂无可运行策略' : ''}
          {selectedReadiness?.action && !selectedReadiness.ready ? ` ${selectedReadiness.action}` : ''}
        </Text>
      )}
    </div>
  )
}

export { DISCOVER_PROFILE_LABELS, isDiscoverProfileMiningReady }
