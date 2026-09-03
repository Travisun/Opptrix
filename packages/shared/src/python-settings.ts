/** Python 环境设置 — 存 user-store `preference` / `python_settings` */
export interface PythonSettings {
  /** pip 镜像候选源（运行时按延迟探测选用最快源） */
  pip_index_urls: string[]
  /**
   * 偏好展示字段（兼容存量）。运行时只要托管/包内 Python 存在即优先采用。
   * 在线一键安装已移除；桌面依赖包内种子，服务器/Docker 依赖系统 Python。
   */
  prefer_opptrix_python: boolean
}

export const DEFAULT_PIP_INDEX_URLS: readonly string[] = [
  'https://pypi.tuna.tsinghua.edu.cn/simple',
  'https://mirrors.aliyun.com/pypi/simple',
  'https://mirrors.cloud.tencent.com/pypi/simple',
  'https://pypi.mirrors.ustc.edu.cn/simple',
]

export const DEFAULT_PYTHON_SETTINGS: PythonSettings = {
  pip_index_urls: [...DEFAULT_PIP_INDEX_URLS],
  prefer_opptrix_python: true,
}

function normalizeMirrorUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

function isValidMirrorUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function normalizePythonSettings(
  raw: Partial<PythonSettings> | null | undefined,
): PythonSettings {
  const urls = Array.isArray(raw?.pip_index_urls)
    ? raw.pip_index_urls
      .map(v => (typeof v === 'string' ? normalizeMirrorUrl(v) : ''))
      .filter(Boolean)
    : []
  return {
    pip_index_urls: urls.length > 0 ? [...new Set(urls)] : [...DEFAULT_PIP_INDEX_URLS],
    // 缺省 → true；仅显式 boolean false 保留（getPythonSettings 会一次性迁移写回 true）
    prefer_opptrix_python: typeof raw?.prefer_opptrix_python === 'boolean'
      ? raw.prefer_opptrix_python
      : true,
  }
}

export type ValidatePythonSettingsResult =
  | { ok: true; settings: PythonSettings }
  | { ok: false; error: string; invalid_lines?: string[] }

/** PUT 校验：非法镜像 URL 拒绝 */
export function validatePythonSettingsInput(
  input: Partial<PythonSettings> | null | undefined,
): ValidatePythonSettingsResult {
  if (input == null || typeof input !== 'object') {
    return { ok: false, error: '请求体无效' }
  }

  const rawUrls = Array.isArray(input.pip_index_urls) ? input.pip_index_urls : []
  const invalidLines: string[] = []
  const normalized: string[] = []

  for (const rawLine of rawUrls) {
    if (typeof rawLine !== 'string') {
      invalidLines.push(String(rawLine))
      continue
    }
    const line = normalizeMirrorUrl(rawLine)
    if (!line) continue
    if (!isValidMirrorUrl(line)) {
      invalidLines.push(rawLine.trim())
      continue
    }
    normalized.push(line)
  }

  if (invalidLines.length > 0) {
    return {
      ok: false,
      error: `以下镜像地址无效：${invalidLines.join('、')}`,
      invalid_lines: invalidLines,
    }
  }

  const settings: PythonSettings = {
    pip_index_urls: normalized.length > 0
      ? [...new Set(normalized)]
      : [...DEFAULT_PIP_INDEX_URLS],
    prefer_opptrix_python: typeof input.prefer_opptrix_python === 'boolean'
      ? input.prefer_opptrix_python
      : true,
  }

  return { ok: true, settings }
}
