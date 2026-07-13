import {
  outboundFetch as sharedOutboundFetch,
  formatOutboundFetchError as sharedFormatOutboundFetchError,
  isOutboundConnectError,
} from '@opptrix/shared'

export const outboundFetch = sharedOutboundFetch

export function formatOutboundFetchError(error: unknown): string {
  if (error instanceof Error && isOutboundConnectError(error)) {
    return '无法连接模型服务，请检查网络与设置中的 API 地址'
  }
  return sharedFormatOutboundFetchError(error)
}
