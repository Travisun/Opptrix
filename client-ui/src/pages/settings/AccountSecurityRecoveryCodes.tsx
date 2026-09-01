import { useCallback, useState } from 'react'
import { Text, makeStyles } from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import {
  copyRecoveryCodes,
  downloadRecoveryCodesTxt,
} from '../../auth/recoveryCodesExport'
import { useCopyButtonFeedback } from '../../auth/useCopyButtonFeedback'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { SettingsGroup, SettingsStaticBlock } from './SettingsPrimitives'
import {
  AccountSecurityActions,
  AccountSecurityFlowRoot,
  AccountSecurityHero,
  AccountSecurityStepRail,
} from './AccountSecurityStepChrome'

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
    padding: '4px 0 8px',
    '@media (max-width: 520px)': {
      gridTemplateColumns: '1fr',
    },
  },
  code: {
    fontFamily: 'var(--opptrix-font-mono)',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.5,
    padding: '8px 10px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    textAlign: 'center',
    letterSpacing: '0.04em',
  },
  warn: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.warning,
    lineHeight: 1.5,
  },
})

export function RecoveryCodesBlock({
  codes,
  onCopied,
  onDownloaded,
  onDone,
}: {
  codes: string[]
  onCopied: () => void
  onDownloaded?: () => void
  onDone: () => void
}) {
  const s = useStyles()
  const { label: copyLabel, flash: flashCopy } = useCopyButtonFeedback()
  const [copyBusy, setCopyBusy] = useState(false)

  const copyAll = useCallback(async () => {
    setCopyBusy(true)
    try {
      const ok = await copyRecoveryCodes(codes)
      flashCopy(ok)
      if (ok) onCopied()
    } finally {
      setCopyBusy(false)
    }
  }, [codes, flashCopy, onCopied])

  const downloadAll = () => {
    if (downloadRecoveryCodesTxt(codes)) onDownloaded?.()
  }

  return (
    <AccountSecurityFlowRoot>
      <AccountSecurityStepRail
        steps={['安装验证器', '扫码开启', '保存恢复码']}
        activeIndex={2}
      />
      <AccountSecurityHero lead="离开本页后将无法再次查看。每条恢复码只能使用一次，请立即保存。" />
      <Text className={s.warn} block role="status">
        建议复制或下载到密码管理器 / 离线安全处，不要只保存在手机相册。
      </Text>
      <SettingsGroup>
        <SettingsStaticBlock>
          <div className={s.grid}>
            {codes.map(code => (
              <span key={code} className={s.code}>{code}</span>
            ))}
          </div>
          <AccountSecurityActions>
            <OpptrixButton
              variant="secondary"
              disabled={copyBusy}
              onClick={() => { void copyAll() }}
            >
              {copyLabel}
            </OpptrixButton>
            <OpptrixButton variant="secondary" onClick={downloadAll}>
              下载备份文件
            </OpptrixButton>
            <OpptrixButton variant="primary" onClick={onDone}>
              我已妥善保存
            </OpptrixButton>
          </AccountSecurityActions>
        </SettingsStaticBlock>
      </SettingsGroup>
    </AccountSecurityFlowRoot>
  )
}
