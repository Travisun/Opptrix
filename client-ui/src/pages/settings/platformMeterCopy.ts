/** Product-facing denial reason; never expose raw denial codes as primary copy. */
export function denialReasonLabel(code: string): string {
  switch (code) {
    case 'pack_disabled':
      return '相关能力包未启用'
    case 'quota_exceeded':
      return '调用次数已达上限'
    default:
      return '请求未通过能力检查'
  }
}
