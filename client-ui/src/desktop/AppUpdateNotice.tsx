import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { useAppUpdate } from '../hooks/useAppUpdate'
import { isElectron } from '../platform/detect'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  wrap: {
    padding: '0 8px 8px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px 10px 9px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  meta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  actions: {
    display: 'flex',
    alignItems: 'stretch',
    width: '100%',
    paddingTop: '1px',
  },
  restartBtn: {
    width: '100%',
    minHeight: '28px',
    height: '28px',
    padding: '0 10px',
    borderRadius: opptrixTokens.radiusSm,
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    gap: '6px',
    lineHeight: 1,
    // Fluent 默认 icon 槽偏大，把两侧图标压到 13px，避免撑坏 small 按钮
    '& .fui-Button__icon': {
      fontSize: '13px',
      width: '13px',
      height: '13px',
      marginInlineEnd: '0',
    },
    '& .fui-Button__icon svg': {
      width: '13px',
      height: '13px',
    },
  },
})

export default function AppUpdateNotice() {
  const s = useStyles()
  const { status, installUpdate } = useAppUpdate()

  if (!isElectron()) return null
  if (status.state === 'idle' || status.state === 'not-available' || status.state === 'checking') {
    return null
  }

  if (status.state === 'downloading' || status.state === 'available') {
    return (
      <div className={s.wrap}>
        <div className={s.card}>
          <Text className={s.title} block>
            {status.version ? `正在下载 v${status.version}` : '正在下载更新'}
          </Text>
          <Text className={s.meta} block>
            {status.percent != null && status.percent > 0
              ? `已完成 ${status.percent}% · 下载完成后会提示你重启`
              : '后台下载中，完成后会提示你重启'}
          </Text>
        </div>
      </div>
    )
  }

  if (status.state === 'ready' || status.state === 'installing') {
    return (
      <div className={s.wrap}>
        <div className={s.card}>
          <Text className={s.title} block>
            {status.state === 'installing'
              ? (status.version ? `正在安装 v${status.version}` : '正在安装更新')
              : (status.version ? `新版本 v${status.version} 已就绪` : '新版本已就绪')}
          </Text>
          <Text className={s.meta} block>
            {status.message ?? (status.state === 'installing'
              ? '应用即将退出并自动重启，请勿强制结束进程。'
              : '重启应用即可完成更新，当前对话与数据不会丢失。')}
          </Text>
          {status.state === 'ready' && (
            <div className={s.actions}>
              <OpptrixButton
                className={mergeClasses(s.restartBtn, 'opptrix-focusable')}
                variant="primary"
                size="small"
                icon={<ArrowSyncRegular fontSize={13} />}
                onClick={() => { void installUpdate() }}
              >
                重启更新
              </OpptrixButton>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
