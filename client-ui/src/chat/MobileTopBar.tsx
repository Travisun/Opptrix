import { makeStyles, Text, mergeClasses } from '@fluentui/react-components'
import {
  NavigationRegular, SettingsRegular,
} from '@fluentui/react-icons'
import { ChatAddRegular } from './chatIcons'
import type { AvailableModel } from '../types/chat'
import ModelSelector from './ModelSelector'
import { innoTokens } from '../theme/tokens'
import { ghostInteractive, hairlineBottom } from '../theme/mixins'
import InnoButton from '../components/inno/InnoButton'

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 8px',
    paddingTop: 'max(6px, env(safe-area-inset-top))',
    backgroundColor: innoTokens.surface,
    ...hairlineBottom,
    flexShrink: 0,
    zIndex: 10,
    minHeight: '44px',
  },
  menuBtn: {
    ...ghostInteractive,
    minWidth: '44px',
    height: '44px',
    color: innoTokens.textPrimary,
    flexShrink: 0,
  },
  center: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: '0 4px',
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subtitle: {
    fontSize: '12px',
    color: innoTokens.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  actionBtn: {
    ...ghostInteractive,
    minWidth: '44px',
    height: '44px',
    color: innoTokens.textSecondary,
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: innoTokens.radiusFull,
    flexShrink: 0,
  },
  statusOk: { backgroundColor: innoTokens.success },
  statusErr: { backgroundColor: innoTokens.error },
})

interface MobileTopBarProps {
  title: string
  llmLabel: string
  backendOk: boolean
  availableModels?: AvailableModel[]
  sessionModel?: string
  onModelChange?: (ref: string) => void
  onOpenDrawer: () => void
  onNewChat: () => void
  onOpenSettings: () => void
}

export default function MobileTopBar({
  title, llmLabel, backendOk,
  availableModels = [],
  sessionModel,
  onModelChange,
  onOpenDrawer, onNewChat, onOpenSettings,
}: MobileTopBarProps) {
  const s = useStyles()

  return (
    <header className={s.bar}>
      <InnoButton
        className={s.menuBtn}
        variant="ghost"
        icon={<NavigationRegular fontSize={22} />}
        onClick={onOpenDrawer}
        aria-label="打开对话列表"
      />
      <div className={s.center}>
        <Text className={s.title}>{title || '新对话'}</Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span className={mergeClasses(s.statusDot, backendOk ? s.statusOk : s.statusErr)} />
          {onModelChange && availableModels.length > 0 ? (
            <ModelSelector
              models={availableModels}
              value={sessionModel}
              isMobile
              onChange={onModelChange}
            />
          ) : (
            <Text className={s.subtitle}>{llmLabel}</Text>
          )}
        </div>
      </div>
      <div className={s.actions}>
        <InnoButton
          className={s.actionBtn}
          variant="ghost"
          icon={<ChatAddRegular fontSize={22} />}
          onClick={onNewChat}
          aria-label="新对话"
        />
        <InnoButton
          className={s.actionBtn}
          variant="ghost"
          icon={<SettingsRegular fontSize={22} />}
          onClick={onOpenSettings}
          aria-label="设置"
        />
      </div>
    </header>
  )
}
