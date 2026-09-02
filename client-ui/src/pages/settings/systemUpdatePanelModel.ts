import type { SystemUpdateStatus } from '../../api/client'
import { isSystemUpdateBlocked } from '../../hooks/useSystemUpdate'

export type SystemUpdatePanelModel = {
  title: string
  desc: string
  showApply: boolean
  applyLabel: string
  showRecheck: boolean
  showProgress: boolean
  showCli: boolean
  percent?: number
}

export function buildSystemUpdatePanel(
  status: SystemUpdateStatus,
  opts: {
    checkedOnce: boolean
    environmentWaiting: boolean
    waitingForBaseRefresh: boolean
  },
): SystemUpdatePanelModel | null {
  const { checkedOnce, environmentWaiting, waitingForBaseRefresh } = opts

  if (environmentWaiting && waitingForBaseRefresh) {
    return {
      title: '正在等待运行环境就绪…',
      desc: '服务器正在重建运行环境，请稍候。完成后你可以继续更新。',
      showApply: false,
      applyLabel: '',
      showRecheck: false,
      showProgress: false,
      showCli: false,
    }
  }
  if (isSystemUpdateBlocked(status)) {
    return {
      title: '此版本未能完成更新',
      desc: '此版本未能完成更新，已恢复当前版本。将等待后续新版本，中间版本会自动跳过。',
      showApply: false,
      applyLabel: '',
      showRecheck: false,
      showProgress: false,
      showCli: false,
    }
  }
  if (status.uiPhase === 'failed') {
    return {
      title: '更新未能完成',
      desc: status.error?.trim() || '这次更新没有顺利完成。你可以稍后重试。',
      showApply: true,
      applyLabel: '重试更新',
      showRecheck: false,
      showProgress: false,
      showCli: false,
    }
  }
  if (status.needsBaseRefresh) {
    return {
      title: '需要更新运行环境',
      desc: status.baseRefreshHint?.trim()
        || '当前运行环境无法安装此版本。请在服务器上执行下方命令。数据与已保存内容会保留。',
      showApply: false,
      applyLabel: '',
      showRecheck: false,
      showProgress: false,
      showCli: true,
    }
  }
  if (status.readyToApply) {
    return {
      title: status.availableVersion
        ? `新版本 v${status.availableVersion} 已就绪`
        : '新版本已就绪',
      desc: '确认后即可开始更新。更新期间暂时无法使用其他功能。',
      showApply: true,
      applyLabel: '立即更新',
      showRecheck: false,
      showProgress: false,
      showCli: false,
    }
  }
  const dl = status.download
  if (dl && (dl.status === 'running' || dl.status === 'queued')) {
    const percent = (() => {
      if (dl.bytesTotal == null || dl.bytesTotal <= 0) return undefined
      return Math.min(100, Math.round((dl.bytesReceived / dl.bytesTotal) * 100))
    })()
    return {
      title: status.availableVersion
        ? `正在准备 v${status.availableVersion}`
        : '正在准备新版本',
      desc: '新版本正在后台准备，完成后会提醒你。',
      showApply: false,
      applyLabel: '',
      showRecheck: false,
      showProgress: true,
      showCli: false,
      percent,
    }
  }
  if (dl && dl.status === 'failed') {
    return {
      title: '新版本准备失败',
      desc: dl.error?.trim()
        || status.error?.trim()
        || '暂时无法准备新版本。请确认网络后重新检查。',
      showApply: false,
      applyLabel: '',
      showRecheck: true,
      showProgress: false,
      showCli: false,
    }
  }
  if (checkedOnce) {
    return {
      title: '当前已是最新版本',
      desc: '暂无可用更新。你可以稍后再检查。',
      showApply: false,
      applyLabel: '',
      showRecheck: false,
      showProgress: false,
      showCli: false,
    }
  }
  return null
}
