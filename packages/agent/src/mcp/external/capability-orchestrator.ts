/**
 * Capability Orchestrator：按能力 L1 外部（精确 cap → 问数互备，两段内各按 sortOrder）→ L2 本地。
 * fake registry 无 listCapabilityCandidates 时返回 null，由 broker 走旧路径。
 */

import {
  classifyMcpServerError,
  extractMcpConfigHint,
  isMcpServerFailoverError,
  namespacedMcpTool,
  parseMcpRetryAfterMs,
  parseNamespacedMcpTool,
} from '@opptrix/shared'
import { currentToolSessionId } from '../tool-session-context.js'
import type { McpToolCallOptions } from '../broker.js'
import {
  adaptCapabilityArgs,
  localToolsForCapability,
  relatedCapabilities,
  resolveToolCapability,
  type McpCapability,
} from './capability-catalog.js'
import { annotateMcpResult } from './registry.js'
import { disableHard, isDisabled } from './session-quarantine.js'
import type { SufficiencyChecker } from './sufficiency.js'

export type CapabilityCandidate = {
  serverId: string
  remoteTool: string
  sortOrder: number
}

export type CapabilityOrchestratorExternal = {
  listCapabilityCandidates?: (capability: McpCapability) => CapabilityCandidate[]
  callExternal: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    opts?: McpToolCallOptions,
  ) => Promise<unknown>
  health: { shouldSkip: (serverId: string, paused: boolean) => boolean }
}

export type CapabilityOrchestratorDeps = {
  local: {
    call: (
      name: string,
      args?: Record<string, unknown>,
      opts?: McpToolCallOptions,
    ) => Promise<unknown>
  }
  external: CapabilityOrchestratorExternal
  sufficiency: SufficiencyChecker
  supplementWithLocal: (
    name: string,
    args: Record<string, unknown>,
    opts: McpToolCallOptions | undefined,
    externalResult: unknown,
    check: ReturnType<SufficiencyChecker['check']>,
    externalSource: string,
  ) => Promise<unknown>
  callLocalWithFallback: (
    name: string,
    args: Record<string, unknown>,
    opts: McpToolCallOptions | undefined,
    externalTried: boolean,
    configHint?: string,
  ) => Promise<unknown>
}

type RateLimitWait = (ms: number) => Promise<void> | void

const defaultRateLimitWait: RateLimitWait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

let rateLimitWait: RateLimitWait = defaultRateLimitWait

export function setMcpRateLimitWaitForTests(fn: RateLimitWait): void {
  rateLimitWait = fn
}

export function resetMcpRateLimitWaitForTests(): void {
  rateLimitWait = defaultRateLimitWait
}

/**
 * 有能力映射且 registry 实现了 catalog 时编排；否则返回 null → 旧路径。
 */
export async function dispatchCapabilityCall(
  deps: CapabilityOrchestratorDeps,
  name: string,
  args: Record<string, unknown>,
  opts?: McpToolCallOptions,
): Promise<unknown | null> {
  const cap = resolveToolCapability(name)
  const hasCatalog = typeof deps.external.listCapabilityCandidates === 'function'
  if (!cap || !hasCatalog) return null
  return runOrchestrated(deps, name, args, opts, cap)
}

async function runOrchestrated(
  deps: CapabilityOrchestratorDeps,
  name: string,
  args: Record<string, unknown>,
  opts: McpToolCallOptions | undefined,
  cap: McpCapability,
): Promise<unknown> {
  const sessionId = currentToolSessionId()
  const l1 = buildL1Candidates(deps, name, cap, sessionId)
  const l1Outcome = await tryL1(deps, name, args, opts, l1, sessionId)

  if (l1Outcome.kind === 'done') return l1Outcome.result
  if (l1Outcome.kind === 'business') return l1Outcome.result

  return tryL2(deps, name, args, opts, cap, l1Outcome)
}

/** 必须经实例调用，禁止拆下 class method（否则 this.repo 为 undefined） */
function listCandidatesForCap(
  external: CapabilityOrchestratorExternal,
  cap: McpCapability,
): CapabilityCandidate[] {
  const fn = external.listCapabilityCandidates
  if (typeof fn !== 'function') return []
  return fn.call(external, cap) ?? []
}

function collectCapCandidates(
  deps: CapabilityOrchestratorDeps,
  cap: McpCapability,
  seen: Set<string>,
): CapabilityCandidate[] {
  const list: CapabilityCandidate[] = []
  for (const cand of listCandidatesForCap(deps.external, cap)) {
    const key = `${cand.serverId}::${cand.remoteTool}`
    if (seen.has(key)) continue
    seen.add(key)
    list.push(cand)
  }
  list.sort((a, b) => a.sortOrder - b.sortOrder)
  return list
}

function preferNamespacedServer(
  list: CapabilityCandidate[],
  serverId: string,
): CapabilityCandidate[] {
  const pref = list.filter(c => c.serverId === serverId)
  const rest = list.filter(c => c.serverId !== serverId)
  return [...pref, ...rest]
}

function buildL1Candidates(
  deps: CapabilityOrchestratorDeps,
  name: string,
  cap: McpCapability,
  sessionId: string | undefined,
): CapabilityCandidate[] {
  if (typeof deps.external.listCapabilityCandidates !== 'function') return []

  const seen = new Set<string>()
  let exact = collectCapCandidates(deps, cap, seen)
  let related: CapabilityCandidate[] = []
  for (const r of relatedCapabilities(cap)) {
    related.push(...collectCapCandidates(deps, r, seen))
  }
  related.sort((a, b) => a.sortOrder - b.sortOrder)

  const parsed = parseNamespacedMcpTool(name)
  if (parsed) {
    exact = preferNamespacedServer(exact, parsed.serverId)
    related = preferNamespacedServer(related, parsed.serverId)
  }

  return [...exact, ...related].filter((cand) => {
    if (sessionId && isDisabled(sessionId, cand.serverId)) return false
    if (deps.external.health.shouldSkip(cand.serverId, false)) return false
    return true
  })
}

type L1Outcome =
  | { kind: 'done'; result: unknown }
  | { kind: 'business'; result: unknown }
  | {
      kind: 'continue'
      lastExternalResult: unknown | null
      lastCheck: ReturnType<SufficiencyChecker['check']> | null
      lastServerId: string
      lastConfigHint?: string
      anyTried: boolean
    }

async function tryL1(
  deps: CapabilityOrchestratorDeps,
  name: string,
  args: Record<string, unknown>,
  opts: McpToolCallOptions | undefined,
  candidates: CapabilityCandidate[],
  sessionId: string | undefined,
): Promise<L1Outcome> {
  let lastExternalResult: unknown = null
  let lastCheck: ReturnType<SufficiencyChecker['check']> | null = null
  let lastServerId = ''
  let lastConfigHint: string | undefined
  let anyTried = false

  for (const cand of candidates) {
    const nsName = namespacedMcpTool(cand.serverId, cand.remoteTool)
    const adapted = adaptCapabilityArgs(name, nsName, args)
    const attempt = await tryOneExternal(deps, name, adapted, opts, cand, sessionId)
    if (attempt.kind === 'done' || attempt.kind === 'business') return attempt
    anyTried = true
    if (attempt.configHint) lastConfigHint = attempt.configHint
    if (attempt.insufficient) {
      lastExternalResult = attempt.result
      lastCheck = attempt.check ?? null
      lastServerId = cand.serverId
    }
  }

  return {
    kind: 'continue',
    lastExternalResult,
    lastCheck,
    lastServerId,
    lastConfigHint,
    anyTried,
  }
}

type ExtAttempt =
  | { kind: 'done'; result: unknown }
  | { kind: 'business'; result: unknown }
  | {
      kind: 'fail'
      configHint?: string
      insufficient?: boolean
      result?: unknown
      check?: ReturnType<SufficiencyChecker['check']>
    }

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new DOMException('Aborted', 'AbortError')
}

async function waitRateLimit(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  if (!signal) {
    await rateLimitWait(ms)
    return
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () => {
      finish(() => {
        try {
          throwIfAborted(signal)
        } catch (e) {
          reject(e)
        }
      })
    }
    signal.addEventListener('abort', onAbort)
    Promise.resolve(rateLimitWait(ms)).then(
      () => {
        if (signal.aborted) {
          onAbort()
          return
        }
        finish(resolve)
      },
      (err) => finish(() => reject(err)),
    )
  })
}

async function tryOneExternal(
  deps: CapabilityOrchestratorDeps,
  name: string,
  adapted: Record<string, unknown>,
  opts: McpToolCallOptions | undefined,
  cand: CapabilityCandidate,
  sessionId: string | undefined,
): Promise<ExtAttempt> {
  try {
    return await callExternalOnce(deps, name, adapted, opts, cand)
  } catch (e) {
    return handleExternalError(e, cand, sessionId, async () => {
      await waitRateLimit(parseMcpRetryAfterMs(e), opts?.signal)
      try {
        return await callExternalOnce(deps, name, adapted, opts, cand)
      } catch (e2) {
        const cls2 = classifyMcpServerError(e2)
        if (cls2 === 'business') {
          return {
            kind: 'business',
            result: {
              error: e2 instanceof Error ? e2.message : String(e2),
              _mcp: { source: cand.serverId },
            },
          }
        }
        const hint = extractMcpConfigHint(e2)
        return { kind: 'fail', configHint: hint }
      }
    })
  }
}

async function callExternalOnce(
  deps: CapabilityOrchestratorDeps,
  name: string,
  adapted: Record<string, unknown>,
  opts: McpToolCallOptions | undefined,
  cand: CapabilityCandidate,
): Promise<ExtAttempt> {
  const result = await deps.external.callExternal(
    cand.serverId,
    cand.remoteTool,
    adapted,
    opts,
  )
  const check = deps.sufficiency.check(name, result)
  if (check.sufficient) {
    return {
      kind: 'done',
      result: annotateMcpResult(result, cand.serverId, { sufficient: true }),
    }
  }
  return {
    kind: 'fail',
    insufficient: true,
    result,
    check,
  }
}

async function handleExternalError(
  e: unknown,
  cand: CapabilityCandidate,
  sessionId: string | undefined,
  onRateLimitRetry: () => Promise<ExtAttempt>,
): Promise<ExtAttempt> {
  const cls = classifyMcpServerError(e)
  const hint = extractMcpConfigHint(e)

  if (cls === 'rate_limited') {
    const retried = await onRateLimitRetry()
    if (retried.kind !== 'fail') return retried
    return { kind: 'fail', configHint: retried.configHint ?? hint }
  }

  if (cls === 'hard_unavailable') {
    if (sessionId) disableHard(sessionId, cand.serverId)
    return { kind: 'fail', configHint: hint }
  }

  if (cls === 'business') {
    return {
      kind: 'business',
      result: {
        error: e instanceof Error ? e.message : String(e),
        _mcp: { source: cand.serverId },
      },
    }
  }

  if (cls === 'transient' || isMcpServerFailoverError(e)) {
    return { kind: 'fail', configHint: hint }
  }

  return {
    kind: 'business',
    result: {
      error: e instanceof Error ? e.message : String(e),
      _mcp: { source: cand.serverId },
    },
  }
}

async function tryL2(
  deps: CapabilityOrchestratorDeps,
  name: string,
  args: Record<string, unknown>,
  opts: McpToolCallOptions | undefined,
  cap: McpCapability,
  l1: Extract<L1Outcome, { kind: 'continue' }>,
): Promise<unknown> {
  if (l1.lastExternalResult !== null && l1.lastCheck) {
    return deps.supplementWithLocal(
      pickLocalSupplementName(name, cap),
      adaptForLocalSupplement(name, cap, args),
      opts,
      l1.lastExternalResult,
      l1.lastCheck,
      l1.lastServerId,
    )
  }

  const localNames = collectLocalL2Names(name, cap)
  let lastError = ''
  for (const localName of localNames) {
    try {
      const adapted = adaptCapabilityArgs(name, localName, args)
      return await deps.callLocalWithFallback(
        localName,
        adapted,
        opts,
        l1.anyTried,
        l1.lastConfigHint,
      )
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }

  const parsed = parseNamespacedMcpTool(name)
  if (parsed || l1.anyTried) {
    return {
      error: lastError || '外部与本地能力均不可用',
      _mcp: {
        source: l1.lastServerId || parsed?.serverId || 'external',
        degraded: true,
        configHint: l1.lastConfigHint,
      },
    }
  }

  return deps.callLocalWithFallback(name, args, opts, false, l1.lastConfigHint)
}

function collectLocalL2Names(name: string, cap: McpCapability): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  const push = (n: string) => {
    if (!n || seen.has(n) || parseNamespacedMcpTool(n)) return
    // 禁止把问财等远程裸名当本地调
    if (n === 'query2data' || n.endsWith('_search')) return
    seen.add(n)
    names.push(n)
  }

  if (!parseNamespacedMcpTool(name) && resolveToolCapability(name) !== null) {
    push(name)
  }
  for (const c of [cap, ...relatedCapabilities(cap)]) {
    for (const n of localToolsForCapability(c)) push(n)
  }
  return names
}

function pickLocalSupplementName(name: string, cap: McpCapability): string {
  if (!parseNamespacedMcpTool(name)) return name
  const locals = localToolsForCapability(cap)
  if (locals[0]) return locals[0]
  for (const r of relatedCapabilities(cap)) {
    const alt = localToolsForCapability(r)
    if (alt[0]) return alt[0]
  }
  return name
}

function adaptForLocalSupplement(
  name: string,
  cap: McpCapability,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const localName = pickLocalSupplementName(name, cap)
  return adaptCapabilityArgs(name, localName, args)
}
