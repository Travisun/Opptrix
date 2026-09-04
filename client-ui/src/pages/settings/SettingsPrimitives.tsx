import { useEffect, useRef, useState } from 'react'
import {
  Input, Text,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
  makeStyles, mergeClasses,
} from '@fluentui/react-components'
import {
  EyeRegular, EyeOffRegular,
  Wifi1Regular, CheckmarkRegular,
  OpenRegular,
} from '@fluentui/react-icons'
import type { ReactNode } from 'react'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { designTokens } from '../../theme/design-tokens'
import { inputShellInteractive, motion, nativeIconInteractive } from '../../theme/mixins'
import OpptrixButton from '../../components/opptrix/OpptrixButton'

/** Cursor settings sub-section tint (`--cursor-bg-quinary` ≈ ink 4%). */
export const settingsSurfaceTint = 'color-mix(in srgb, var(--opptrix-text-primary) 4%, transparent)'
export const settingsHairlineBorder = `1px solid ${settingsSurfaceTint}`
/** Group / list panel corner radius (Cursor sub-section-list). */
export const settingsSurfaceRadius = '12px'

const useStyles = makeStyles({
  group: {
    border: settingsHairlineBorder,
    borderRadius: designTokens.semantic.radiusCard, // 12px — matches settingsSurfaceRadius
    backgroundColor: settingsSurfaceTint,
    overflow: 'hidden',
    transitionProperty: 'border-color, background-color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    '@media (prefers-reduced-motion: reduce)': {
      transitionProperty: 'none',
    },
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: designTokens.SPACING.xxl + 'px',
    padding: '12px 14px',
    minHeight: '42px',
    '@media (max-width: 660px)': {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: '8px',
      padding: '12px 14px',
    },
  },
  rowStack: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: '8px',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  rowTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 400,
    color: opptrixCssVars.textPrimary,
    lineHeight: '18px',
  },
  rowDesc: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: '18px',
  },
  rowControl: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    width: '100%',
    '@media (min-width: 661px)': {
      width: 'auto',
    },
  },
  rowControlStack: {
    width: '100%',
    justifyContent: 'stretch',
    '@media (min-width: 661px)': {
      width: '100%',
    },
  },
  rowTopBorder: {
    borderTop: `1px solid ${opptrixCssVars.separator}`,
  },
  rowDivider: {
    height: '1px',
    backgroundColor: opptrixCssVars.separator,
    margin: '0 14px',
  },
  rowDividerFull: {
    margin: '0',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: designTokens.SPACING.md + 'px',
    padding: '8px 14px',
    minHeight: '32px',
  },
  panelHeaderTitle: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: '16px',
  },
  inlineInput: {...inputShellInteractive,
    width: '100%',
    minWidth: '120px',
    maxWidth: '160px',
    minHeight: '30px',
    padding: '0 10px',
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
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  providerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
  },
  providerAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.gray200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  /** 可点的「N 个模型」副标题 — 打开模型列表 Dialog */
  modelCountTrigger: {
    alignSelf: 'flex-start',
    margin: 0,
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: '18px',
    textAlign: 'left',
    transitionProperty: 'color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    ':hover': {
      color: opptrixCssVars.textPrimary,
      textDecoration: 'underline',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionProperty: 'none',
    },
  },
  modelsDialogSurface: {
    maxWidth: '400px',
    width: 'calc(100vw - 40px)',
  },
  modelsDialogTitle: {
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 600,
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
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: '16px',
  },
  modelPopoverList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: 'min(50vh, 320px)',
    overflowY: 'auto',
  },
  modelPopoverItem: {
    fontSize: 'var(--opptrix-font-base)',
    fontFamily: 'var(--opptrix-font-mono)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  credentialCombo: {...inputShellInteractive,
    width: '100%',
    minWidth: 0,
    minHeight: '30px',
    display: 'flex',
    alignItems: 'stretch',
    padding: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  credentialWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  credentialHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    paddingLeft: '2px',
  },
  credentialInput: {
    flex: '1 1 0',
    minWidth: 0,
    fontFamily: 'var(--opptrix-font-mono)',
    fontSize: 'var(--opptrix-font-md)',
    paddingLeft: '10px',
  },
  credentialSegment: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    borderLeft: `1px solid ${opptrixCssVars.separator}`,
  },
  credentialActionBtn: {
    minHeight: '28px',
    height: '100%',
    borderRadius: 0,
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    paddingLeft: '10px',
    paddingRight: '10px',
  },
  credentialSaveBtn: {
    minHeight: '28px',
    height: '100%',
    borderRadius: 0,
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    paddingLeft: '10px',
    paddingRight: '10px',
  },
  actionRow: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    ...nativeIconInteractive,
    backgroundColor: 'transparent',
    textAlign: 'left',
    borderRadius: 0,
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  actionRowBody: {
    width: '100%',
  },
  actionRowIcon: {
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
  },
  /** 外链行：单层可点，trailing 为外开图标（勿用 Chevron 冒充） */
  externalLinkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    minHeight: '42px',
    margin: 0,
    border: 'none',
    borderRadius: 0,
    backgroundColor: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'inherit',
    font: 'inherit',
    transitionProperty: 'background-color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionProperty: 'none',
    },
  },
  externalLinkLeading: {
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
  },
  externalLinkMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  externalLinkTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 400,
    color: opptrixCssVars.textPrimary,
    lineHeight: '18px',
  },
  externalLinkDesc: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: '18px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  externalLinkTrailing: {
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
  },
  card: {
    border: settingsHairlineBorder,
    borderRadius: settingsSurfaceRadius,
    backgroundColor: settingsSurfaceTint,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflow: 'hidden',
    transitionProperty: 'border-color, background-color',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
  },
  sectionHeader: {
    padding: '0 2px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionKicker: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: '16px',
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: '16px',
  },
  sectionSubtitle: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: '16px',
  },
  emptyState: {
    padding: '24px 14px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    textAlign: 'center',
  },
  emptyStateIcon: {
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
    marginBottom: '4px',
  },
  emptyStateTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 400,
    color: opptrixCssVars.textPrimary,
    lineHeight: '18px',
  },
  emptyStateDesc: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: '18px',
    maxWidth: '240px',
  },
  /** Group 上方页级 section 标签（对齐 SettingsPage sectionLabel） */
  sectionLabel: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: '16px',
    paddingLeft: '2px',
  },
  sectionLabelSpaced: {
    padding: '0 2px 8px',
  },
  listPanel: {
    border: settingsHairlineBorder,
    borderRadius: settingsSurfaceRadius,
    backgroundColor: settingsSurfaceTint,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 14px',
    minHeight: '44px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  listHeaderMeta: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    flex: 1,
    minWidth: 0,
  },
  listHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '8px 14px',
    minHeight: '38px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  listRowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  listRowTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 400,
    color: opptrixCssVars.textPrimary,
    lineHeight: '18px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  listRowMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  listRowControls: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
})

export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  const s = useStyles()
  return <div className={mergeClasses(s.group, className)}>{children}</div>
}

export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  const s = useStyles()
  return <div className={mergeClasses(s.card, className)}>{children}</div>
}

export function SettingsSectionHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker?: string
  title: string
  subtitle?: string
}) {
  const s = useStyles()
  return (
    <div className={s.sectionHeader}>
      {kicker && <span className={s.sectionKicker}>{kicker}</span>}
      <h2 className={s.sectionTitle}>{title}</h2>
      {subtitle && <span className={s.sectionSubtitle}>{subtitle}</span>}
    </div>
  )
}

export function SettingsEmptyState({
  icon,
  title,
  desc,
}: {
  icon?: ReactNode
  title: string
  desc?: string
}) {
  const s = useStyles()
  return (
    <div className={s.emptyState}>
      {icon && <span className={s.emptyStateIcon}>{icon}</span>}
      <span className={s.emptyStateTitle}>{title}</span>
      {desc && <span className={s.emptyStateDesc}>{desc}</span>}
    </div>
  )
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
        size="small"
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
  placeholder = '粘贴密钥',
  onTest,
  onSave,
  testing = false,
  saving = false,
  saveDisabled = false,
  testDisabled = false,
  revealWhenFilled = false,
  configured = false,
  preview,
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
  revealWhenFilled?: boolean
  configured?: boolean
  preview?: string
}) {
  const s = useStyles()
  const userToggledVisibility = useRef(false)
  const [visible, setVisible] = useState(false)
  const showConfiguredHint = configured && !value.trim()

  useEffect(() => {
    if (revealWhenFilled && value && !userToggledVisibility.current) {
      setVisible(true)
    }
  }, [value, revealWhenFilled])

  return (
    <div className={s.credentialWrap}>
      <div className={mergeClasses(s.credentialCombo, 'opptrix-input-shell', 'opptrix-settings-inline-input', 'opptrix-credential-combo')}>
        <Input
          className={mergeClasses(s.credentialInput, 'opptrix-settings-field-input')}
          appearance="filled-darker"
          size="small"
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={(_, d) => onChange(d.value ?? '')}
        />
        <div className={s.credentialSegment}>
          <OpptrixButton
            variant="icon"
            aria-label={visible ? '隐藏密钥' : '显示密钥'}
            icon={visible ? <EyeOffRegular fontSize={14} /> : <EyeRegular fontSize={14} />}
            onClick={() => {
              userToggledVisibility.current = true
              setVisible(v => !v)
            }}
          />
        </div>
        <div className={s.credentialSegment}>
          <OpptrixButton
            variant="icon"
            aria-label="测试连接"
            icon={<Wifi1Regular fontSize={14} />}
            disabled={testing || testDisabled || saving}
            onClick={onTest}
          />
        </div>
        <div className={s.credentialSegment}>
          <OpptrixButton
            variant="icon"
            aria-label="保存"
            icon={<CheckmarkRegular fontSize={14} />}
            disabled={saving || saveDisabled}
            onClick={onSave}
          />
        </div>
      </div>
      {showConfiguredHint && (
        <Text className={s.credentialHint} block>
          {preview ? `当前密钥：${preview}。如需更换，输入新密钥后保存。` : '密钥已保存在本机，如需更换请输入新密钥后保存。'}
        </Text>
      )}
    </div>
  )
}

export function SettingsActionRow({
  title,
  desc,
  onClick,
  icon,
  last = false,
  dividerAbove = false,
  dividerFullWidth = false,
}: {
  title: string
  desc?: string
  onClick: () => void
  icon?: ReactNode
  last?: boolean
  /** 分割线画在行上方（用于组内末行操作入口） */
  dividerAbove?: boolean
  dividerFullWidth?: boolean
}) {
  const s = useStyles()
  return (
    <>
      {dividerAbove && <SettingsDivider fullWidth={dividerFullWidth} />}
      <OpptrixButton
        variant="ghost"
        block
        className={mergeClasses(s.actionRow, 'opptrix-focusable')}
        onClick={onClick}
      >
        <div className={s.actionRowBody}>
          <SettingsRow
            title={title}
            desc={desc}
            control={icon != null ? <span className={s.actionRowIcon}>{icon}</span> : undefined}
            last
          />
        </div>
      </OpptrixButton>
      {!last && <SettingsDivider fullWidth={dividerFullWidth} />}
    </>
  )
}

/**
 * 外链行 — 在浏览器/系统中打开 URL。
 * trailing 固定为外开图标；勿用 ChevronRight 冒充页内导航。
 */
export function SettingsExternalLinkRow({
  title,
  desc,
  onClick,
  icon,
  last = false,
  dividerFullWidth = true,
}: {
  title: string
  desc?: string
  onClick: () => void
  icon?: ReactNode
  last?: boolean
  dividerFullWidth?: boolean
}) {
  const s = useStyles()
  return (
    <>
      <button
        type="button"
        className={mergeClasses(s.externalLinkRow, 'opptrix-focusable')}
        onClick={onClick}
      >
        {icon != null && <span className={s.externalLinkLeading}>{icon}</span>}
        <span className={s.externalLinkMain}>
          <Text className={s.externalLinkTitle} block>{title}</Text>
          {desc != null && desc !== '' && (
            <Text className={s.externalLinkDesc} block>{desc}</Text>
          )}
        </span>
        <span className={s.externalLinkTrailing} aria-hidden>
          <OpenRegular fontSize={16} />
        </span>
      </button>
      {!last && <SettingsDivider fullWidth={dividerFullWidth} />}
    </>
  )
}

export function SettingsDivider({ fullWidth = false }: { fullWidth?: boolean } = {}) {
  const s = useStyles()
  return <div className={mergeClasses(s.rowDivider, fullWidth && s.rowDividerFull)} aria-hidden />
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

/** Group 上方页级标签 — font-md / 400 / textSecondary（禁止 base+600） */
export function SettingsSectionLabel({
  children,
  spaced = false,
}: {
  children: ReactNode
  spaced?: boolean
}) {
  const s = useStyles()
  return (
    <Text className={mergeClasses(s.sectionLabel, spaced && s.sectionLabelSpaced)} block>
      {children}
    </Text>
  )
}

/** 列表面板容器（订阅 / 任务 / 状态列表等） */
export function SettingsListPanel({
  children,
  className,
  height,
}: {
  children: ReactNode
  className?: string
  /** 固定高度列表面板（如订阅列表 360px） */
  height?: string | number
}) {
  const s = useStyles()
  return (
    <div
      className={mergeClasses(s.listPanel, className)}
      style={height != null ? { height } : undefined}
    >
      {children}
    </div>
  )
}

/** 列表可滚动区 — 置于 AddBar 与 ListRow 之间 */
export function SettingsListScroll({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const s = useStyles()
  return (
    <div className={mergeClasses(s.listScroll, 'opptrix-scroll', 'opptrix-scroll-hover', className)}>
      {children}
    </div>
  )
}

/**
 * 列表顶栏 — 左侧说明 + 右侧添加/导入等操作。
 * 与 `SettingsPanelHeader`（Group 内小标题）互补：本组件用于独立 listPanel。
 */
export function SettingsAddBar({
  meta,
  actions,
}: {
  meta?: ReactNode
  actions?: ReactNode
}) {
  const s = useStyles()
  return (
    <div className={s.listHeader}>
      {meta != null && (
        typeof meta === 'string'
          ? <Text className={s.listHeaderMeta} block>{meta}</Text>
          : <div className={s.listHeaderMeta}>{meta}</div>
      )}
      {actions != null && <div className={s.listHeaderActions}>{actions}</div>}
    </div>
  )
}

/**
 * 列表行 — 默认只展示名称（+ 可选一行说明），trailing 放开关/按钮。
 * 默认不暴露 URL / 路径 / 技术 id；需要时由调用方把次要信息放进 meta 或折叠区。
 */
export function SettingsListRow({
  title,
  meta,
  trailing,
  titleTitle,
}: {
  title: ReactNode
  meta?: ReactNode
  trailing?: ReactNode
  /** 原生 title 悬停全文 */
  titleTitle?: string
}) {
  const s = useStyles()
  return (
    <div className={s.listRow}>
      <div className={s.listRowMain}>
        {typeof title === 'string'
          ? <Text className={s.listRowTitle} block title={titleTitle ?? title}>{title}</Text>
          : <div className={s.listRowTitle} title={titleTitle}>{title}</div>}
        {meta != null && (
          typeof meta === 'string'
            ? <Text className={s.listRowMeta} block>{meta}</Text>
            : <div className={s.listRowMeta}>{meta}</div>
        )}
      </div>
      {trailing != null && <div className={s.listRowControls}>{trailing}</div>}
    </div>
  )
}

/**
 * 大模型提供商行 — 头像 + 名称 + 模型数副标题；右侧仅编辑/删除。
 * 有模型时副标题可点，打开已启用模型列表 Dialog；不展示 baseUrl。
 */
export function SettingsProviderRow({
  name,
  models,
  avatar,
  action,
  first = false,
}: {
  name: string
  /** 可选；不再渲染（兼容旧调用方） */
  baseUrl?: string
  models: string[]
  avatar: string
  action?: ReactNode
  first?: boolean
}) {
  const s = useStyles()
  const [modelsOpen, setModelsOpen] = useState(false)
  const hasModels = models.length > 0
  const modelLabel = hasModels ? `${models.length} 个模型` : '尚未添加模型'

  return (
    <div className={mergeClasses(s.row, !first && s.rowTopBorder)}>
      <div className={s.rowMain}>
        <div className={s.providerRow}>
          <div className={s.providerAvatar}>{avatar}</div>
          <div className={s.rowMain}>
            <Text className={s.rowTitle} block>{name}</Text>
            {hasModels ? (
              <button
                type="button"
                className={mergeClasses(s.modelCountTrigger, 'opptrix-focusable')}
                onClick={() => setModelsOpen(true)}
                aria-label={`查看 ${name} 的模型`}
              >
                {modelLabel}
              </button>
            ) : (
              <Text className={s.rowDesc} block>{modelLabel}</Text>
            )}
          </div>
        </div>
      </div>
      <div className={s.rowControl}>
        <div className={s.rowActions}>
          {action}
        </div>
      </div>
      <Dialog open={modelsOpen} onOpenChange={(_, data) => setModelsOpen(data.open)}>
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
    </div>
  )
}
