import { useCallback, useEffect, useMemo, useState } from 'react'
import { Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ChatHelpRegular,
  CodeRegular,
  DocumentTextRegular,
  GlobeRegular,
  LockClosedRegular,
  ShieldErrorRegular,
  WarningRegular,
} from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { getHealth, getUserPreference, setUserPreference } from '../../api/client'
import { isElectron, type NotificationPermissionState } from '../../platform/detect'
import { openExternalUrl } from '../../platform/openUrl'
import { opptrixCssVars } from '../../theme/tokens'
import {
  OPPTRIX_COMMUNITY,
  OPPTRIX_COMMUNITY_INVITE_CODE,
  OPPTRIX_DISCLAIMER,
  OPPTRIX_GITHUB_HOME,
  OPPTRIX_GITHUB_ISSUES,
  OPPTRIX_PRIVACY_POLICY,
  OPPTRIX_SECURITY_POLICY,
  OPPTRIX_USER_AGREEMENT,
  OPPTRIX_WEBSITE,
  formatAboutCopyrightLine,
} from './aboutLinks'
import {
  SettingsExternalLinkRow,
  SettingsGroup,
  SettingsRow,
} from './SettingsPrimitives'

/** 与 packages/shared chat-debug-settings 对齐；client-ui 不从 shared 主入口导入 */
const CHAT_DEBUG_LOGGING_KEY = 'chat_debug_logging'

function parseChatDebugEnabled(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return (value as { enabled?: unknown }).enabled === true
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  rootFlush: {
    gap: '16px',
  },
  prose: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '52ch',
    paddingTop: '4px',
  },
  proseFlush: {
    maxWidth: 'none',
  },
  lead: {
    fontSize: 'var(--opptrix-font-lg)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.65,
  },
  note: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.6,
  },
  sectionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionLabel: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: '16px',
    paddingLeft: '2px',
  },
  license: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
    paddingLeft: '2px',
    marginTop: '4px',
  },
  notifyActions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  linkIcon: {
    fontSize: '18px',
    width: '18px',
    height: '18px',
  },
})

type AboutSettingsSectionProps = {
  contentFlush?: boolean
}

export default function AboutSettingsSection({ contentFlush = false }: AboutSettingsSectionProps) {
  const s = useStyles()
  const [versionLabel, setVersionLabel] = useState<string | null>(null)
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermissionState | null>(null)
  const [chatDebugEnabled, setChatDebugEnabled] = useState(false)
  const [chatDebugLoading, setChatDebugLoading] = useState(true)

  useEffect(() => {
    if (isElectron()) {
      void window.electronAPI?.clientVersion?.().then(version => {
        setVersionLabel(version ? `v${version}` : null)
      })
      void window.electronAPI?.notificationGetPermission?.()
        .then(perm => setNotifyPermission(perm))
        .catch(() => setNotifyPermission(null))
      return
    }
    void getHealth()
      .then(health => setVersionLabel(health.version ? `v${health.version}` : null))
      .catch(() => setVersionLabel(null))
  }, [])

  useEffect(() => {
    let cancelled = false
    void getUserPreference<{ enabled?: boolean }>(CHAT_DEBUG_LOGGING_KEY)
      .then(resp => {
        if (!cancelled) setChatDebugEnabled(parseChatDebugEnabled(resp.value))
      })
      .catch(() => {
        if (!cancelled) setChatDebugEnabled(false)
      })
      .finally(() => {
        if (!cancelled) setChatDebugLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleOpenNotificationSettings = useCallback(() => {
    void window.electronAPI?.notificationOpenSettings?.()
  }, [])

  const handleRefreshNotificationPermission = useCallback(() => {
    void window.electronAPI?.notificationRequestPermission?.()
      .then(perm => setNotifyPermission(perm))
      .catch(() => {})
  }, [])

  const handleChatDebugChange = useCallback((_: unknown, data: { checked: boolean | 'mixed' }) => {
    const next = Boolean(data.checked)
    setChatDebugEnabled(next)
    void setUserPreference(CHAT_DEBUG_LOGGING_KEY, { enabled: next }).catch(() => {
      setChatDebugEnabled(!next)
    })
  }, [])

  const handleOpenChatDebugDir = useCallback(() => {
    void window.electronAPI?.chatDebugOpenLogDir?.().catch(() => {})
  }, [])

  const versionDesc = versionLabel ?? '读取版本中…'
  const copyrightLine = useMemo(
    () => formatAboutCopyrightLine(typeof navigator !== 'undefined' ? navigator.language : undefined),
    [],
  )

  const notifyPermissionDesc = (() => {
    switch (notifyPermission) {
      case 'granted':
        return '已开启。对话完成或需要你确认时，会在你离开窗口时提醒你。'
      case 'denied':
        return '系统未允许通知。请在系统设置中开启，以免错过对话完成提醒。'
      case 'default':
        return '尚未确认。完成对话后若未收到提醒，请到系统设置中允许 Opptrix 发送通知。'
      default:
        return '正在读取通知状态…'
    }
  })()

  return (
    <div className={mergeClasses(s.root, contentFlush && s.rootFlush)}>
      <div className={mergeClasses(s.prose, contentFlush && s.proseFlush)}>
        <Text className={s.lead} block>
          Opptrix 是一款面向个人投资者的投研助手。用日常中文提问，即可查看行情、阅读新闻与研报摘要，并把结果整理成易读的说明。支持 A 股、港股、美股等主要市场。
        </Text>
        <Text className={s.note} block>
          本软件仅供学习与研究参考，不构成投资建议，也不能代替券商下单或自动交易。请自行核实信息并独立做出投资决策。
        </Text>
        <Text className={s.note} block>
          你的对话、关注列表和数据密钥等默认保存在本机，由你自行管理；使用哪家大模型、哪些数据源，可在设置中调整。
        </Text>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>版本信息</Text>
        <SettingsGroup>
          <SettingsRow
            title="当前版本"
            desc={versionDesc}
            last
          />
        </SettingsGroup>
        <Text className={s.note} block>
          检查更新、导入离线包与回退版本，请前往「系统更新」；也可通过链接
          {' '}
          <Text as="span" style={{ fontFamily: 'ui-monospace, monospace' }}>
            ?settings=system_update
          </Text>
          {' '}
          或
          {' '}
          <Text as="span" style={{ fontFamily: 'ui-monospace, monospace' }}>
            ?settings=system_update&amp;update_tab=offline
          </Text>
          {' '}
          直接打开对应标签页。
        </Text>
      </div>

      {isElectron() && (
        <div className={s.sectionBlock}>
          <Text className={s.sectionLabel} block>桌面通知</Text>
          <SettingsGroup>
            <SettingsRow
              title="系统通知"
              desc={notifyPermissionDesc}
              control={(
                <div className={s.notifyActions}>
                  {notifyPermission === 'denied' || notifyPermission === 'default' ? (
                    <OpptrixButton variant="secondary" onClick={handleOpenNotificationSettings}>
                      打开系统设置
                    </OpptrixButton>
                  ) : (
                    <OpptrixButton variant="secondary" onClick={handleRefreshNotificationPermission}>
                      刷新状态
                    </OpptrixButton>
                  )}
                </div>
              )}
              last
            />
          </SettingsGroup>
        </div>
      )}

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>对话调试日志</Text>
        <SettingsGroup>
          <SettingsRow
            title="对话调试日志"
            desc="开启后，将把对话过程写入本机日志，便于排查无回复或中断；默认关闭"
            control={(
              <Switch
                checked={chatDebugEnabled}
                disabled={chatDebugLoading}
                onChange={handleChatDebugChange}
                aria-label="对话调试日志"
              />
            )}
            last={!isElectron()}
          />
          {isElectron() ? (
            <SettingsRow
              title="日志文件夹"
              desc="在系统文件管理器中打开本机日志目录"
              control={(
                <OpptrixButton variant="secondary" onClick={handleOpenChatDebugDir}>
                  打开日志文件夹
                </OpptrixButton>
              )}
              last
            />
          ) : null}
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>法律与官网</Text>
        <SettingsGroup>
          <SettingsExternalLinkRow
            title="投研交流社区"
            desc={`与同好讨论策略与方法 · 邀请码 ${OPPTRIX_COMMUNITY_INVITE_CODE}`}
            icon={<GlobeRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_COMMUNITY)}
          />
          <SettingsExternalLinkRow
            title="官方网站"
            desc="产品动态与使用指南"
            icon={<GlobeRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_WEBSITE)}
          />
          <SettingsExternalLinkRow
            title="用户协议"
            desc="使用前请阅读相关条款"
            icon={<DocumentTextRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_USER_AGREEMENT)}
          />
          <SettingsExternalLinkRow
            title="隐私政策"
            desc="我们如何保护你的信息"
            icon={<LockClosedRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_PRIVACY_POLICY)}
          />
          <SettingsExternalLinkRow
            title="免责声明"
            desc="投资风险与内容局限说明"
            icon={<WarningRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_DISCLAIMER)}
            last
          />
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>项目与支持</Text>
        <SettingsGroup>
          <SettingsExternalLinkRow
            title="项目主页"
            desc="介绍、文档与源代码"
            icon={<CodeRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_GITHUB_HOME)}
          />
          <SettingsExternalLinkRow
            title="反馈与建议"
            desc="遇到问题或希望新增功能时留言"
            icon={<ChatHelpRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_GITHUB_ISSUES)}
          />
          <SettingsExternalLinkRow
            title="安全漏洞"
            desc="请私下报告，勿在公开渠道披露细节"
            icon={<ShieldErrorRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_SECURITY_POLICY)}
            last
          />
        </SettingsGroup>
      </div>

      <Text className={s.license} block>
        {copyrightLine}
      </Text>
    </div>
  )
}
