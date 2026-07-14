import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProgressBar, Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowSyncRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { getHealth } from '../../api/client'
import { useAppUpdate } from '../../hooks/useAppUpdate'
import { isElectron } from '../../platform/detect'
import { openExternalUrl } from '../../platform/openUrl'
import { opptrixCssVars } from '../../theme/tokens'
import {
  buildAppUpdatePanel,
  isAppUpdateCheckBusy,
} from '../../utils/appUpdateUi'
import {
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
  SettingsActionRow,
  SettingsDivider,
  SettingsGroup,
  SettingsRow,
} from './SettingsPrimitives'

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
    fontSize: '14px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.65,
  },
  note: {
    fontSize: '13px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.6,
  },
  sectionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    letterSpacing: '-0.01em',
    paddingLeft: '2px',
  },
  license: {
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
    paddingLeft: '2px',
  },
  updateStatusBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
    padding: '12px 18px',
    boxSizing: 'border-box',
  },
  updateTitle: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  updatePanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
  },
  updateDesc: {
    fontSize: '13px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
  },
  progressMeta: {
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  updateActions: {
    display: 'flex',
    justifyContent: 'flex-start',
    gap: '8px',
    paddingTop: '2px',
    width: '100%',
  },
  restartBtn: {
    minHeight: '32px',
    height: '32px',
    padding: '0 14px',
    fontSize: '13px',
    fontWeight: 600,
    gap: '6px',
    '& .fui-Button__icon': {
      fontSize: '14px',
      width: '14px',
      height: '14px',
      marginInlineEnd: '0',
    },
    '& .fui-Button__icon svg': {
      width: '14px',
      height: '14px',
    },
  },
})

type AboutSettingsSectionProps = {
  contentFlush?: boolean
}

export default function AboutSettingsSection({ contentFlush = false }: AboutSettingsSectionProps) {
  const s = useStyles()
  const { status: updateStatus, checkNow, installUpdate } = useAppUpdate()
  const [versionLabel, setVersionLabel] = useState<string | null>(null)
  const [checkedOnce, setCheckedOnce] = useState(false)

  useEffect(() => {
    if (isElectron()) {
      void window.electronAPI?.clientVersion?.().then(version => {
        setVersionLabel(version ? `v${version}` : null)
      })
      return
    }
    void getHealth()
      .then(health => setVersionLabel(health.version ? `v${health.version}` : null))
      .catch(() => setVersionLabel(null))
  }, [])

  const handleCheckUpdate = useCallback(() => {
    setCheckedOnce(true)
    void checkNow()
  }, [checkNow])

  const versionDesc = versionLabel ?? '读取版本中…'
  const showUpdateBlock = isElectron()
  const checkBusy = isAppUpdateCheckBusy(updateStatus)
  const updatePanel = buildAppUpdatePanel(updateStatus, { checkedOnce })
  const showUpdateStatusRow = Boolean(updatePanel?.visible)
  const copyrightLine = useMemo(
    () => formatAboutCopyrightLine(typeof navigator !== 'undefined' ? navigator.language : undefined),
    [],
  )

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
          你的对话、关注列表和 API 密钥等数据默认保存在本机，由你自行管理；使用哪家大模型、哪些数据源，可在设置中调整。
        </Text>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>版本信息</Text>
        <SettingsGroup>
          <SettingsRow
            title="当前版本"
            desc={versionDesc}
            control={showUpdateBlock ? (
              <OpptrixButton
                variant="secondary"
                disabled={checkBusy}
                icon={checkBusy ? <Spinner size="tiny" /> : undefined}
                onClick={handleCheckUpdate}
              >
                {checkBusy ? '检查中…' : '检查更新'}
              </OpptrixButton>
            ) : undefined}
            last={!showUpdateStatusRow}
          />
          {showUpdateStatusRow && updatePanel && (
            <>
              <SettingsDivider fullWidth />
              <div className={s.updateStatusBlock}>
                <Text className={s.updateTitle} block>{updatePanel.title}</Text>
                <div className={s.updatePanel}>
                  <Text className={s.updateDesc} block>{updatePanel.desc}</Text>
                  {updatePanel.showProgress && (
                    <>
                      <ProgressBar
                        value={
                          updatePanel.percent != null && updatePanel.percent > 0
                            ? updatePanel.percent / 100
                            : undefined
                        }
                        max={1}
                        thickness="medium"
                        shape="rounded"
                      />
                      <Text className={s.progressMeta} block>
                        {updateStatus.state === 'available'
                          ? '正在连接下载…'
                          : updateStatus.state === 'installing'
                            ? '正在替换应用文件并准备重启…'
                          : updatePanel.percent != null && updatePanel.percent > 0
                            ? `已完成 ${updatePanel.percent}%`
                            : '正在准备下载…'}
                      </Text>
                    </>
                  )}
                  {updatePanel.showInstall && (
                    <div className={s.updateActions}>
                      <OpptrixButton
                        className={s.restartBtn}
                        variant="primary"
                        size="small"
                        icon={<ArrowSyncRegular fontSize={14} />}
                        onClick={() => { void installUpdate() }}
                      >
                        重启更新
                      </OpptrixButton>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>法律与官网</Text>
        <SettingsGroup>
          <SettingsActionRow
            title="官方网站"
            desc="了解产品动态、使用指南与更多说明"
            onClick={() => openExternalUrl(OPPTRIX_WEBSITE)}
            icon={<ChevronRightRegular fontSize={16} />}
            dividerFullWidth
          />
          <SettingsActionRow
            title="用户协议"
            desc="使用 Opptrix 前请阅读并知悉相关条款"
            onClick={() => openExternalUrl(OPPTRIX_USER_AGREEMENT)}
            icon={<ChevronRightRegular fontSize={16} />}
            dividerFullWidth
          />
          <SettingsActionRow
            title="隐私政策"
            desc="了解我们如何收集、使用与保护你的信息"
            onClick={() => openExternalUrl(OPPTRIX_PRIVACY_POLICY)}
            icon={<ChevronRightRegular fontSize={16} />}
            dividerFullWidth
          />
          <SettingsActionRow
            title="免责声明"
            desc="关于投资风险、数据局限与 AI 生成内容的说明"
            onClick={() => openExternalUrl(OPPTRIX_DISCLAIMER)}
            icon={<ChevronRightRegular fontSize={16} />}
            dividerFullWidth
            last
          />
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>项目与支持</Text>
        <SettingsGroup>
          <SettingsActionRow
            title="访问项目主页"
            desc="在 GitHub 查看介绍、文档与源代码"
            onClick={() => openExternalUrl(OPPTRIX_GITHUB_HOME)}
            icon={<ChevronRightRegular fontSize={16} />}
            dividerFullWidth
          />
          <SettingsActionRow
            title="反馈问题或功能建议"
            desc="遇到异常或希望新增功能时，可在 Issues 留言"
            onClick={() => openExternalUrl(OPPTRIX_GITHUB_ISSUES)}
            icon={<ChevronRightRegular fontSize={16} />}
            dividerFullWidth
          />
          <SettingsActionRow
            title="报告安全漏洞"
            desc="按安全说明私下报告；请勿在公开渠道披露细节"
            onClick={() => openExternalUrl(OPPTRIX_SECURITY_POLICY)}
            icon={<ChevronRightRegular fontSize={16} />}
            dividerFullWidth
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
