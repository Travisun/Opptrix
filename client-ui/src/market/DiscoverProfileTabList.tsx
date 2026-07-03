import { Tab, TabList, Text, makeStyles } from '@fluentui/react-components'
import {
  DISCOVER_PROFILE_DESCRIPTIONS,
  DISCOVER_PROFILE_LABELS,
  DISCOVER_PROFILE_ORDER,
  isDiscoverProfileMiningReady,
  type DiscoverStrategyProfile,
} from './discoverProfiles'
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
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
})

type Props = {
  selected: DiscoverStrategyProfile
  onSelect: (profile: DiscoverStrategyProfile) => void
  disabled?: boolean
  compact?: boolean
}

export default function DiscoverProfileTabList({ selected, onSelect, disabled, compact }: Props) {
  const s = useStyles()
  const hint = DISCOVER_PROFILE_DESCRIPTIONS[selected]
  const miningReady = isDiscoverProfileMiningReady(selected)

  return (
    <div className={s.root}>
      <TabList
        className={s.tabList}
        size="small"
        selectedValue={selected}
        onTabSelect={(_, data) => onSelect(data.value as DiscoverStrategyProfile)}
      >
        {DISCOVER_PROFILE_ORDER.map(id => (
          <Tab key={id} value={id} disabled={disabled}>
            {DISCOVER_PROFILE_LABELS[id]}
          </Tab>
        ))}
      </TabList>
      {!compact && (
        <Text className={s.hint} block>
          {hint}
          {!miningReady ? ' · 策略库筹备中，暂无可运行策略' : ''}
        </Text>
      )}
    </div>
  )
}

export { DISCOVER_PROFILE_LABELS, isDiscoverProfileMiningReady }
