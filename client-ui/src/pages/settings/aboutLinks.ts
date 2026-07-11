/** Public project & legal URLs — keep aligned with README.md and apps/desktop/electron/app-meta.cjs */
export const OPPTRIX_WEBSITE = 'https://www.opptrix.org'
/** 外链打开（关于页等） */
export const OPPTRIX_USER_AGREEMENT = 'https://www.opptrix.org/user-agreement.html'
/** 引导内嵌 iframe — 与站点路由一致 */
export const OPPTRIX_USER_AGREEMENT_EMBED = 'https://www.opptrix.org/user-agreement'
export const OPPTRIX_PRIVACY_POLICY = 'https://www.opptrix.org/privacy-policy.html'
export const OPPTRIX_DISCLAIMER = 'https://opptrix.org/legal/disclaimer'

export const OPPTRIX_GITHUB_HOME = 'https://github.com/Travisun/Opptrix'
export const OPPTRIX_GITHUB_ISSUES = 'https://github.com/Travisun/Opptrix/issues'
/** Rendered from SECURITY.md — works once the file exists on the default branch */
export const OPPTRIX_SECURITY_POLICY = 'https://github.com/Travisun/Opptrix/security/policy'
/** Prefilled issue for private repos without GitHub security advisories */
export const OPPTRIX_SECURITY_REPORT = 'https://github.com/Travisun/Opptrix/issues/new?title=%5B安全漏洞%5D%20简要描述&labels=security'

/** Opptrix 项目启动年份 — 版权与关于页元数据保持一致 */
export const OPPTRIX_PROJECT_START_YEAR = 2026

export const OPPTRIX_CONTRIBUTORS_EN = 'Opptrix contributors'
export const OPPTRIX_CONTRIBUTORS_ZH = 'Opptrix 贡献者'

/** npm / 安装包等英文元数据沿用此常量 */
export const OPPTRIX_CONTRIBUTORS = OPPTRIX_CONTRIBUTORS_EN

export function isChineseUiLocale(locale = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN'): boolean {
  return locale.toLowerCase().startsWith('zh')
}

export function getOpptrixContributorsLabel(locale?: string): string {
  return isChineseUiLocale(locale) ? OPPTRIX_CONTRIBUTORS_ZH : OPPTRIX_CONTRIBUTORS_EN
}

export function formatAboutCopyrightLine(locale?: string): string {
  const holder = getOpptrixContributorsLabel(locale)
  if (isChineseUiLocale(locale)) {
    return `Copyright © ${OPPTRIX_PROJECT_START_YEAR} ${holder} · Apache License 2.0 开源`
  }
  return `Copyright © ${OPPTRIX_PROJECT_START_YEAR} ${holder} · Licensed under Apache License 2.0`
}
