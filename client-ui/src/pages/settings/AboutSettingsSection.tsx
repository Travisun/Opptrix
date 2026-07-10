import { useCallback, useEffect, useState } from 'react'
import { ProgressBar, Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowSyncRegular,
  BugRegular,
  ChevronRightRegular,
  ShieldRegular,
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
  OPPTRIX_GITHUB_HOME,
  OPPTRIX_GITHUB_ISSUES,
  OPPTRIX_SECURITY_POLICY,
} from './aboutLinks'
import {
  SettingsActionRow,
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
  title: {
    fontSize: '15px',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
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
    justifyContent: 'flex-end',
    gap: '8px',
    paddingTop: '2px',
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

  return (
    <div className={mergeClasses(s.root, contentFlush && s.rootFlush)}>
      <div className={mergeClasses(s.prose, contentFlush && s.proseFlush)}>
        <Text className={s.title} block>Opptrix</Text>
        <Text className={s.lead} block>
          开源的全球多市场投研数据助手，覆盖 A 股、美股、港股、日股、韩股与加密货币等市场。用自然语言提问，自动调用 40+ 投研工具获取行情、因子、新闻与结构化数据，并整理成可读的中文分析。支持多会话聊天、关注列表与右侧个股面板；Web 与桌面端共用同一套界面。
        </Text>
        <Text className={s.note} block>
          适合自助研究与学习使用。本软件不是券商交易终端，不提供投资建议，也不支持自动下单；行情与研报结论仅供参考，投资决策请自行判断并遵守当地法规。
        </Text>
        <Text className={s.note} block>
          你的对话、配置与 API Key 默认保存在本机服务端，由你自行管理数据与模型提供商。
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
            <SettingsRow
              stack
              title={updatePanel.title}
              desc={(
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
                          : updatePanel.percent != null && updatePanel.percent > 0
                            ? `已完成 ${updatePanel.percent}%`
                            : '正在准备下载…'}
                      </Text>
                    </>
                  )}
                  {updatePanel.showInstall && (
                    <div className={s.updateActions}>
                      <OpptrixButton
                        variant="primary"
                        icon={<ArrowSyncRegular />}
                        onClick={() => { void installUpdate() }}
                      >
                        重启更新
                      </OpptrixButton>
                    </div>
                  )}
                </div>
              )}
              last
            />
          )}
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>项目与支持</Text>
        <SettingsGroup>
          <SettingsActionRow
            title="访问项目主页"
            desc="查看介绍、使用说明与源代码（GitHub）"
            onClick={() => openExternalUrl(OPPTRIX_GITHUB_HOME)}
            icon={<ChevronRightRegular fontSize={16} />}
          />
          <SettingsActionRow
            title="反馈问题或功能建议"
            desc="遇到缺陷、异常或希望新增能力时，可在 Issues 留言"
            onClick={() => openExternalUrl(OPPTRIX_GITHUB_ISSUES)}
            icon={<BugRegular fontSize={16} />}
          />
          <SettingsActionRow
            title="报告安全漏洞"
            desc="查看安全说明并按指引提交；请勿在公开工单中披露可利用细节"
            onClick={() => openExternalUrl(OPPTRIX_SECURITY_POLICY)}
            icon={<ShieldRegular fontSize={16} />}
            separated={false}
          />
        </SettingsGroup>
      </div>

      <Text className={s.license} block>
        Apache License 2.0 开源 · Copyright © 2025 Opptrix contributors
      </Text>
    </div>
  )
}
