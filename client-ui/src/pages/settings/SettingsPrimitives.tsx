import { useEffect, useRef, useState } from 'react'
import {
  Input, Text,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
  makeStyles, mergeClasses,
} from '@fluentui/react-components'
import { EyeRegular, EyeOffRegular } from '@fluentui/react-icons'
import type { ReactNode } from 'react'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { inputShellInteractive, motion, nativeIconInteractive } from '../../theme/mixins'
import OpptrixButton from '../../components/opptrix/OpptrixButton'

const useStyles = makeStyles({
  group: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '20px',
    padding: '10px 18px',
    minHeight: '44px',
    '@media (max-width: 720px)': {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: '12px',
    },
  },
  rowStack: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: '10px',
    '@media (max-width: 640px)': {
      flexDirection: 'column',
    },
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  rowTitle: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  rowDesc: {
    fontSize: '13px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
  },
  rowControl: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    '@media (min-width: 721px)': {
      width: 'auto',
    },
  },
  rowControlStack: {
    width: '100%',
    justifyContent: 'stretch',
    '@media (min-width: 721px)': {
      width: '100%',
    },
  },
  rowTopBorder: {
    borderTop: `1px solid ${opptrixCssVars.gray200}`,
  },
  rowDivider: {
    height: '1px',
    backgroundColor: opptrixCssVars.separator,
    margin: '0 18px',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 18px',
    minHeight: '44px',
  },
  panelHeaderTitle: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  inlineInput: {
    ...inputShellInteractive,
    width: '100%',
    minWidth: '160px',
    maxWidth: '240px',
    minHeight: '32px',
    padding: '0 11px',
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    '@media (max-width: 720px)': {
      maxWidth: 'none',
    },
  },
  inlineInputWide: {
    maxWidth: 'none',
    width: '100%',
  },
  staticBlock: {
    padding: '12px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  providerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    width: '100%',
  },
  providerAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.gray200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 650,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  modelsDialogSurface: {
    maxWidth: '400px',
    width: 'calc(100vw - 40px)',
  },
  modelsDialogTitle: {
    fontSize: '16px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
  },
  modelsDialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '2px',
  },
  modelPopoverTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  modelPopoverList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: 'min(50vh, 320px)',
    overflowY: 'auto',
  },
  modelPopoverItem: {
    fontSize: '13px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  credentialCombo: {
    ...inputShellInteractive,
    width: '100%',
    minWidth: 0,
    minHeight: '32px',
    display: 'flex',
    alignItems: 'stretch',
    padding: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  credentialInput: {
    flex: '1 1 0',
    minWidth: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
    paddingLeft: '11px',
  },
  credentialSegment: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    borderLeft: `1px solid ${opptrixCssVars.separator}`,
  },
  credentialActionBtn: {
    minHeight: '30px',
    height: '100%',
    borderRadius: 0,
    fontSize: '12px',
    fontWeight: 500,
    paddingLeft: '12px',
    paddingRight: '12px',
  },
  credentialSaveBtn: {
    minHeight: '30px',
    height: '100%',
    borderRadius: 0,
    fontSize: '12px',
    fontWeight: 600,
    paddingLeft: '12px',
    paddingRight: '12px',
  },
  actionRow: {
    display: 'flex',
    width: '100%',
    ...nativeIconInteractive,
    backgroundColor: 'transparent',
    textAlign: 'left',
    borderRadius: 0,
    border: 'none',
    borderTop: `1px solid ${opptrixCssVars.gray200}`,
    transitionProperty: 'background-color, color, border-color',
    transitionDuration: motion.fast,
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ':hover': {
      backgroundColor: opptrixCssVars.gray100,
      color: opptrixCssVars.textPrimary,
      borderTopColor: opptrixCssVars.borderStrong,
    },
    ':focus-visible': {
      borderTopColor: opptrixCssVars.borderStrong,
    },
  },
  actionRowFlush: {
    borderTop: 'none',
  },
})

export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  const s = useStyles()
  return <div className={mergeClasses(s.group, className)}>{children}</div>
}

export function SettingsRow({
  title,
  desc,
  control,
  last = false,
  stack = false,
}: {
  title: string
  desc?: ReactNode
  control?: ReactNode
  last?: boolean
  stack?: boolean
}) {
  const s = useStyles()
  return (
    <>
      <div className={mergeClasses(s.row, stack && s.rowStack)}>
        <div className={s.rowMain}>
          <Text className={s.rowTitle} block>{title}</Text>
          {desc != null && (
            typeof desc === 'string'
              ? <Text className={s.rowDesc} block>{desc}</Text>
              : <div className={s.rowDesc}>{desc}</div>
          )}
        </div>
        {control != null && (
          <div className={mergeClasses(s.rowControl, stack && s.rowControlStack)}>{control}</div>
        )}
      </div>
      {!last && <div className={s.rowDivider} aria-hidden />}
    </>
  )
}

export function SettingsStaticBlock({ children }: { children: ReactNode }) {
  const s = useStyles()
  return <div className={s.staticBlock}>{children}</div>
}

export function SettingsInlineInput({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  const s = useStyles()
  return (
    <div className={mergeClasses(s.inlineInput, wide && s.inlineInputWide, 'opptrix-input-shell', 'opptrix-settings-inline-input')}>
      {children}
    </div>
  )
}

export function SettingsTextField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <SettingsInlineInput>
      <Input
        className="opptrix-settings-field-input"
        appearance="filled-darker"
        size="medium"
        value={value}
        placeholder={placeholder}
        onChange={(_, d) => onChange(d.value ?? '')}
      />
    </SettingsInlineInput>
  )
}

export function SettingsCredentialRow({
  value,
  onChange,
  placeholder = '粘贴 Token',
  onTest,
  onSave,
  testing = false,
  saving = false,
  saveDisabled = false,
  testDisabled = false,
  revealWhenFilled = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onTest: () => void
  onSave: () => void
  testing?: boolean
  saving?: boolean
  saveDisabled?: boolean
  testDisabled?: boolean
  /** 为 true 时，加载已有密钥后自动明文展示 */
  revealWhenFilled?: boolean
}) {
  const s = useStyles()
  const userToggledVisibility = useRef(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (revealWhenFilled && value && !userToggledVisibility.current) {
      setVisible(true)
    }
  }, [value, revealWhenFilled])

  return (
    <div className={mergeClasses(s.credentialCombo, 'opptrix-input-shell', 'opptrix-settings-inline-input', 'opptrix-credential-combo')}>
      <Input
        className={mergeClasses(s.credentialInput, 'opptrix-settings-field-input')}
        appearance="filled-darker"
        size="medium"
        type={visible ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        onChange={(_, d) => onChange(d.value ?? '')}
      />
      <div className={s.credentialSegment}>
        <OpptrixButton
          variant="icon"
          aria-label={visible ? '隐藏密钥' : '显示密钥'}
          icon={visible ? <EyeOffRegular fontSize={16} /> : <EyeRegular fontSize={16} />}
          onClick={() => {
            userToggledVisibility.current = true
            setVisible(v => !v)
          }}
        />
      </div>
      <div className={s.credentialSegment}>
        <OpptrixButton
          variant="ghost"
          className={s.credentialActionBtn}
          disabled={testing || testDisabled}
          onClick={onTest}
        >
          {testing ? '测试中…' : '测试'}
        </OpptrixButton>
      </div>
      <div className={s.credentialSegment}>
        <OpptrixButton
          variant="primary"
          className={s.credentialSaveBtn}
          disabled={saving || saveDisabled}
          onClick={onSave}
        >
          {saving ? '保存中…' : '保存'}
        </OpptrixButton>
      </div>
    </div>
  )
}

export function SettingsActionRow({
  title,
  desc,
  onClick,
  icon,
  separated = true,
}: {
  title: string
  desc?: string
  onClick: () => void
  icon?: ReactNode
  separated?: boolean
}) {
  const s = useStyles()
  return (
    <button
      type="button"
      className={mergeClasses(s.actionRow, !separated && s.actionRowFlush, 'opptrix-focusable')}
      onClick={onClick}
    >
      <SettingsRow title={title} desc={desc} control={icon} last />
    </button>
  )
}

export function SettingsDivider() {
  const s = useStyles()
  return <div className={s.rowDivider} aria-hidden />
}

export function SettingsPanelHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  const s = useStyles()
  return (
    <>
      <div className={s.panelHeader}>
        <Text className={s.panelHeaderTitle} block>{title}</Text>
        {action}
      </div>
      <SettingsDivider />
    </>
  )
}

function ProviderModelsViewer({ name, models }: { name: string; models: string[] }) {
  const s = useStyles()
  const [open, setOpen] = useState(false)

  return (
    <>
      <OpptrixButton
        variant="icon"
        icon={<EyeRegular fontSize={16} />}
        aria-label={`查看 ${name} 的模型`}
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
        <DialogSurface className={mergeClasses(s.modelsDialogSurface, 'opptrix-dialog-surface')}>
          <DialogBody>
            <DialogTitle className={s.modelsDialogTitle}>{name}</DialogTitle>
            <DialogContent className={s.modelsDialogContent}>
              <Text className={s.modelPopoverTitle} block>
                已启用模型 · {models.length}
              </Text>
              <div className={mergeClasses(s.modelPopoverList, 'opptrix-scroll')}>
                {models.map(m => (
                  <span key={m} className={s.modelPopoverItem}>{m}</span>
                ))}
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  )
}

export function SettingsProviderRow({
  name,
  baseUrl,
  models,
  avatar,
  action,
  first = false,
}: {
  name: string
  baseUrl: string
  models: string[]
  avatar: string
  action?: ReactNode
  first?: boolean
}) {
  const s = useStyles()
  return (
    <div className={mergeClasses(s.row, !first && s.rowTopBorder)}>
      <div className={s.rowMain}>
        <div className={s.providerRow}>
          <div className={s.providerAvatar}>{avatar}</div>
          <div className={s.rowMain}>
            <Text className={s.rowTitle} block>{name}</Text>
            <Text className={s.rowDesc} block style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {baseUrl}
            </Text>
          </div>
        </div>
      </div>
      <div className={s.rowControl}>
        <div className={s.rowActions}>
          {models.length > 0 && <ProviderModelsViewer name={name} models={models} />}
          {action}
        </div>
      </div>
    </div>
  )
}
