/** 联网安装白名单 — PyPI / npm 及常见 CDN */
export const PACKAGE_INSTALL_ALLOWED_DOMAINS: readonly string[] = [
  'pypi.org',
  '*.pypi.org',
  'files.pythonhosted.org',
  '*.pythonhosted.org',
  'registry.npmjs.org',
  '*.npmjs.org',
  'registry.yarnpkg.com',
  '*.yarnpkg.com',
  'github.com',
  '*.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'codeload.github.com',
]

export function networkDomainsForInstallAllowed(): string[] {
  return [...PACKAGE_INSTALL_ALLOWED_DOMAINS]
}

export function networkDomainsWhenDenied(): string[] {
  return []
}
