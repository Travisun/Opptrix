import type { AppUpdateStatus } from '../platform/detect'

export type AppUpdatePanelModel = {
  visible: boolean
  title: string
  desc: string
  showProgress: boolean
  /** 0–100；undefined 表示不确定进度 */
  percent?: number
  showInstall: boolean
}

export function buildAppUpdatePanel(
  status: AppUpdateStatus,
  opts: { checkedOnce: boolean },
): AppUpdatePanelModel | null {
  const { checkedOnce } = opts

  switch (status.state) {
    case 'checking':
      return {
        visible: true,
        title: '正在检查更新',
        desc: status.message ?? '正在连接更新服务器，请稍候…',
        showProgress: false,
        showInstall: false,
      }
    case 'available':
      return {
        visible: true,
        title: status.version ? `发现新版本 v${status.version}` : '发现新版本',
        desc: status.message ?? '正在准备下载，请稍候…',
        showProgress: true,
        percent: 0,
        showInstall: false,
      }
    case 'downloading':
      return {
        visible: true,
        title: status.version ? `正在下载 v${status.version}` : '正在下载更新',
        desc: status.message ?? '下载完成后可重启安装',
        showProgress: true,
        percent: status.percent ?? 0,
        showInstall: false,
      }
    case 'ready':
      return {
        visible: true,
        title: status.version ? `新版本 v${status.version} 已就绪` : '新版本已就绪',
        desc: status.message ?? '重启应用即可完成更新，对话与本地数据不会丢失。',
        showProgress: false,
        percent: 100,
        showInstall: true,
      }
    case 'error':
      return {
        visible: true,
        title: '暂时无法完成更新',
        desc: status.message ?? '请检查网络后重试，或稍后再试。',
        showProgress: false,
        showInstall: false,
      }
    case 'not-available':
      if (!checkedOnce) return null
      return {
        visible: true,
        title: '当前已是最新版本',
        desc: status.message ?? '暂无可用更新。你可以稍后再检查，或到项目主页查看发布说明。',
        showProgress: false,
        showInstall: false,
      }
    default:
      return null
  }
}

export function isAppUpdateCheckBusy(status: AppUpdateStatus): boolean {
  return status.state === 'checking'
}
