import { makeStyles, Text, mergeClasses } from '@fluentui/react-components'
import {
  NavigationRegular, SettingsRegular,
} from '@fluentui/react-icons'
import { ChatAddRegular } from './chatIcons'
import type { AvailableModel } from '../types/chat'
import ModelSelector from './ModelSelector'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive, hairlineBottom } from '../theme/mixins'
import OpptrixButton from '../components/opptrix/OpptrixButton'

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 8px',
    paddingTop: 'max(6px, env(safe-area-inset-top))',
    backgroundColor: opptrixCssVars.surface,
    ...hairlineBottom,
    flexShrink: 0,
    zIndex: 10,
    minHeight: '44px',
  },
  menuBtn: {...ghostInteractive,
minWidth: '44px',
    height: '44px',
    color: opptrixCssVars.textPrimary,
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
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subtitle: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  actionBtn: {...ghostInteractive,
minWidth: '44px',
    height: '44px',
    color: opptrixCssVars.textSecondary,
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: opptrixTokens.radiusFull,
    flexShrink: 0,
  },
  statusOk: { backgroundColor: opptrixCssVars.success },
  statusErr: { backgroundColor: opptrixCssVars.error },
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
      <OpptrixButton
        className={s.menuBtn}
        variant="ghost"
        icon={<NavigationRegular fontSize={22} />}
        onClick={onOpenDrawer}
        aria-label="打开对话列表"
      />
      <div className={s.center}>
        <Text className={s.title}>{title || '新对话'}</Text>
        <div className={s.statusRow}>
          <span
            className={mergeClasses(s.statusDot, backendOk ? s.statusOk : s.statusErr)}
            aria-label={backendOk ? '服务已连接' : '服务未连接'}
          />
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
        <OpptrixButton
          className={s.actionBtn}
          variant="ghost"
          icon={<ChatAddRegular fontSize={22} />}
          onClick={onNewChat}
          aria-label="新对话"
        />
        <OpptrixButton
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
