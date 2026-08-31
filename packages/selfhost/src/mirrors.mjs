/**
 * Build-mirror profiles for Opptrix Docker Compose self-host.
 * Shared by `opptrix` CLI and tests.
 */

/** @typedef {'cn' | 'foreign'} BuildMirrorProfile */

export const CN_MIRROR_DEFAULTS = Object.freeze({
  dockerImagePrefix: 'docker.m.daocloud.io/library/',
  npmRegistry: 'https://registry.npmmirror.com',
  aptMirror: 'mirrors.aliyun.com',
})

/** Default git remotes for source clone (Docker build context). */
export const GIT_CLONE_DEFAULTS = Object.freeze({
  /** 国内默认：Gitee */
  cn: 'https://gitee.com/Travisun/Opptrix.git',
  /** 国外默认：GitHub */
  foreign: 'https://github.com/Travisun/Opptrix.git',
})

/**
 * @param {string | undefined} raw
 * @returns {BuildMirrorProfile}
 */
export function normalizeMirrorProfile(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v || v === 'foreign' || v === 'default' || v === 'hub' || v === 'overseas') {
    return 'foreign'
  }
  if (v === 'cn' || v === 'china' || v === 'domestic' || v === 'zh') {
    return 'cn'
  }
  throw new Error(`未知构建镜像配置：${raw}（请用 cn 或 foreign）`)
}

/**
 * Ordered git clone URLs for a mirror profile (primary first, then fallback).
 * Env:
 *   OPPTRIX_GIT_URL_OVERRIDE — single URL, no fallback
 *   OPPTRIX_GIT_URL_CN / OPPTRIX_GIT_URL — override defaults
 *
 * @param {BuildMirrorProfile | string} profile
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function resolveGitCloneUrls(profile, env = process.env) {
  const override = env.OPPTRIX_GIT_URL_OVERRIDE?.trim()
  if (override) return [override]

  const normalized = normalizeMirrorProfile(profile)
  const cn = env.OPPTRIX_GIT_URL_CN?.trim() || GIT_CLONE_DEFAULTS.cn
  const foreign = env.OPPTRIX_GIT_URL?.trim() || GIT_CLONE_DEFAULTS.foreign

  if (normalized === 'cn') {
    // 国内：Gitee 优先，失败再试 GitHub
    return cn === foreign ? [cn] : [cn, foreign]
  }
  // 国外：GitHub 优先，失败再试 Gitee
  return foreign === cn ? [foreign] : [foreign, cn]
}

/**
 * @param {string} prefix
 * @returns {string}
 */
export function ensureTrailingSlash(prefix) {
  const p = String(prefix ?? '').trim()
  if (!p) return ''
  return p.endsWith('/') ? p : `${p}/`
}

/**
 * Resolve env vars for Compose build-args. Explicit process.env overrides win.
 * @param {BuildMirrorProfile} profile
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   profile: BuildMirrorProfile,
 *   OPPTRIX_DOCKER_IMAGE_PREFIX: string,
 *   OPPTRIX_NPM_REGISTRY: string,
 *   OPPTRIX_APT_MIRROR: string,
 * }}
 */
export function resolveBuildMirrorEnv(profile, env = process.env) {
  const normalized = normalizeMirrorProfile(profile)
  if (normalized === 'cn') {
    return {
      profile: 'cn',
      OPPTRIX_DOCKER_IMAGE_PREFIX: ensureTrailingSlash(
        env.OPPTRIX_DOCKER_IMAGE_PREFIX?.trim()
          || CN_MIRROR_DEFAULTS.dockerImagePrefix,
      ),
      OPPTRIX_NPM_REGISTRY: (
        env.OPPTRIX_NPM_REGISTRY?.trim()
        || CN_MIRROR_DEFAULTS.npmRegistry
      ),
      OPPTRIX_APT_MIRROR: (
        env.OPPTRIX_APT_MIRROR?.trim()
        || CN_MIRROR_DEFAULTS.aptMirror
      ),
    }
  }
  return {
    profile: 'foreign',
    OPPTRIX_DOCKER_IMAGE_PREFIX: env.OPPTRIX_DOCKER_IMAGE_PREFIX?.trim() || '',
    OPPTRIX_NPM_REGISTRY: env.OPPTRIX_NPM_REGISTRY?.trim() || '',
    OPPTRIX_APT_MIRROR: env.OPPTRIX_APT_MIRROR?.trim() || '',
  }
}
