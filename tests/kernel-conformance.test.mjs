import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href
const eventBusModUrl = pathToFileURL(
  path.join(here, '../packages/event-bus/dist/index.js'),
).href

const ENFORCE_ENV = 'OPPTRIX_PLATFORM_PACK_ENFORCE'

describe('kernel-conformance Wave 6A', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform
  /** @type {typeof import('../packages/event-bus/dist/index.js')} */
  let eventBus
  /** @type {string | undefined} */
  let prevEnforceEnv
  /** @type {string | undefined} */
  let prevMaxSubmitsEnv

  const MAX_SUBMITS_ENV = 'OPPTRIX_PLATFORM_GATE_MAX_SUBMITS'

  beforeEach(async () => {
    prevEnforceEnv = process.env[ENFORCE_ENV]
    prevMaxSubmitsEnv = process.env[MAX_SUBMITS_ENV]
    // SF1: unset ⇒ enforce ON. Most suite cases need legacy OFF isolation.
    process.env[ENFORCE_ENV] = '0'
    delete process.env[MAX_SUBMITS_ENV]
    platform = await import(platformModUrl)
    eventBus = await import(eventBusModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
    if (prevEnforceEnv === undefined) {
      delete process.env[ENFORCE_ENV]
    } else {
      process.env[ENFORCE_ENV] = prevEnforceEnv
    }
    if (prevMaxSubmitsEnv === undefined) {
      delete process.env[MAX_SUBMITS_ENV]
    } else {
      process.env[MAX_SUBMITS_ENV] = prevMaxSubmitsEnv
    }
  })

  it('C-ABI: abiVersion === 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
  })

  it('C-R0: extensions.activate missing returns ok:false without throw; bootScan never throws', async () => {
    const ctx = platform.createPlatformContext()
    const result = await ctx.extensions.activate('nope')
    assert.equal(result.ok, false)
    assert.equal(typeof result.error, 'string')
    assert.ok(result.error && result.error.length > 0)
    await assert.doesNotReject(() => ctx.extensions.bootScan())
    assert.ok(Array.isArray(ctx.extensions.list()))
  })

  it('C-GATE-AUDIT: submit increments meter.submitCount and recent has auditId', async () => {
    const ctx = platform.createPlatformContext()
    const before = ctx.meter.snapshot()
    assert.equal(before.submitCount, 0)
    assert.equal(before.denyCount, 0)
    assert.equal(before.recent.length, 0)

    const obs = await ctx.gate.submit(
      { token: 'get_quotes', args: { code: '600519' } },
      async () => ({ quotes: [] }),
    )
    assert.equal(obs.ok, true)
    assert.equal(typeof obs.auditId, 'string')

    const after = ctx.meter.snapshot()
    assert.equal(after.submitCount, 1)
    assert.equal(after.errorCount, 0)
    assert.equal(after.denyCount, 0)
    assert.equal(after.recent.length, 1)
    assert.equal(after.recent[0]?.auditId, obs.auditId)
    assert.equal(after.recent[0]?.token, 'get_quotes')
    assert.equal(after.recent[0]?.ok, true)
  })

  it('C-METER-USAGE: recordUsage bumps soft token totals; bad values ignored; info exposes', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.meter.snapshot().tokenInTotal, 0)
    assert.equal(ctx.meter.snapshot().tokenOutTotal, 0)
    assert.equal(ctx.info().meter.tokenInTotal, 0)
    assert.equal(ctx.info().meter.tokenOutTotal, 0)

    ctx.meter.recordUsage({ tokenIn: 50, tokenOut: 20 })
    ctx.meter.recordUsage({ tokenIn: -9, tokenOut: Number.NaN })
    ctx.meter.recordUsage({ tokenIn: 1.8, tokenOut: 0.9 })
    assert.equal(ctx.meter.snapshot().tokenInTotal, 51)
    assert.equal(ctx.meter.snapshot().tokenOutTotal, 20)
    assert.equal(ctx.info().meter.tokenInTotal, 51)
    assert.equal(ctx.info().meter.tokenOutTotal, 20)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-METER-USAGE-WIRE: usageMeter-shaped hook bumps meter; ABI 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    /** Server-shaped adapter (AgentSettings.usageMeter → platform.meter.recordUsage). */
    const record = (usage) => {
      ctx.meter.recordUsage(usage)
    }
    // Field mapping: promptTokens → tokenIn, completionTokens → tokenOut
    record({ tokenIn: 100, tokenOut: 40, sessionId: 'sess-wire' })
    assert.equal(ctx.meter.snapshot().tokenInTotal, 100)
    assert.equal(ctx.meter.snapshot().tokenOutTotal, 40)
    assert.equal(ctx.info().meter.tokenInTotal, 100)
    assert.equal(ctx.info().meter.tokenOutTotal, 40)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-METER: denyCount stays 0 on success; pack deny bumps denyCount not errorCount', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.gate.submit(
      { token: 'get_quotes', args: {} },
      async () => ({ ok: true }),
    )
    const afterOk = ctx.meter.snapshot()
    assert.equal(afterOk.denyCount, 0)
    assert.equal(afterOk.errorCount, 0)
    assert.equal(afterOk.recentDenialCount, 0)
    assert.equal(afterOk.tokenInTotal, 0)
    assert.equal(afterOk.tokenOutTotal, 0)
    assert.equal(ctx.info().meter.denyCount, 0)
    assert.equal(ctx.info().meter.maxSubmits, null)
    assert.equal(ctx.info().meter.recentDenials, 0)
    assert.equal(ctx.info().meter.tokenInTotal, 0)
    assert.equal(ctx.info().meter.tokenOutTotal, 0)
    assert.equal(ctx.meter.listRecentDenials().length, 0)

    process.env[ENFORCE_ENV] = '1'
    platform.resetPlatformContextForTests()
    const enforced = platform.createPlatformContext()
    enforced.packs.enable('research', false)
    const errorsBefore = enforced.meter.snapshot().errorCount
    const denied = await enforced.gate.submit(
      { token: 'data.quote', args: {} },
      async () => ({ should: 'not-run' }),
    )
    assert.equal(denied.ok, false)
    assert.equal(denied.denialCode, 'pack_disabled')
    const snap = enforced.meter.snapshot()
    assert.ok(snap.denyCount >= 1)
    assert.equal(snap.errorCount, errorsBefore)
    assert.equal(enforced.info().meter.denyCount, snap.denyCount)
    assert.equal(snap.recentDenialCount, snap.denyCount)
    assert.equal(enforced.info().meter.recentDenials, snap.recentDenialCount)
    const denials = enforced.meter.listRecentDenials()
    assert.equal(denials.length, snap.recentDenialCount)
    assert.equal(denials[denials.length - 1]?.denialCode, 'pack_disabled')
    assert.equal(denials[denials.length - 1]?.token, 'data.quote')
  })

  it('C-METER-DENY-RING: deny grows ring; cap 32; exec throw excluded', async () => {
    const events = eventBus.getEventDispatcher()
    const { gate, meter } = platform.createPlatformGate(events, { maxSubmits: 1 })
    assert.equal(platform.DENIAL_RING_CAP, 32)
    assert.equal(typeof meter.listRecentDenials, 'function')

    await gate.submit({ token: 'ok', args: {} }, async () => ({ n: 1 }))
    assert.equal(meter.listRecentDenials().length, 0)
    assert.equal(meter.snapshot().recentDenialCount, 0)

    for (let i = 0; i < 40; i++) {
      const obs = await gate.submit(
        { token: `quota-${i}`, args: {} },
        async () => ({ should: 'not-run' }),
      )
      assert.equal(obs.ok, false)
      assert.equal(obs.denialCode, 'quota_exceeded')
    }
    const ring = meter.listRecentDenials()
    assert.equal(ring.length, 32)
    assert.equal(meter.snapshot().recentDenialCount, 32)
    assert.equal(meter.snapshot().denyCount, 40)
    assert.equal(ring[0]?.token, 'quota-8')
    assert.equal(ring[31]?.token, 'quota-39')
    assert.ok(ring.every((r) => r.denialCode === 'quota_exceeded'))
    assert.ok(typeof ring[0]?.at === 'string' && ring[0].at.length > 0)

    const copy = meter.listRecentDenials()
    copy.pop()
    assert.equal(meter.listRecentDenials().length, 32)

    // exec throw must not enter denial ring
    const unlimited = platform.createPlatformGate(events)
    await assert.rejects(
      () =>
        unlimited.gate.submit({ token: 'boom', args: {} }, async () => {
          throw new Error('boom')
        }),
      /boom/,
    )
    assert.equal(unlimited.meter.listRecentDenials().length, 0)
    assert.equal(unlimited.meter.snapshot().denyCount, 0)
    assert.equal(unlimited.meter.snapshot().errorCount, 1)
  })

  it('C-JOBS: platform.jobs.list is a function / returns array', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(typeof ctx.jobs.list, 'function')
    assert.ok(Array.isArray(ctx.jobs.list()))
  })

  it('C-JOBS-DIAG: admitPlatformJobs → ok + jobs + jobsListed', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitPlatformJobs(ctx)
    assert.equal(empty.ok, true)
    if (!empty.ok) throw new Error('expected admitPlatformJobs ok')
    assert.equal(empty.origin, 'web.diagnostic')
    assert.ok(empty.traceId.length > 0)
    assert.ok(Array.isArray(empty.jobs))
    assert.equal(empty.jobsListed, ctx.info().jobsListed)
    assert.equal(empty.jobs.length, empty.jobsListed)

    const withSession = platform.admitPlatformJobs(ctx, {
      sessionId: 'sess-jobs-diag',
    })
    assert.equal(withSession.ok, true)
    if (!withSession.ok) throw new Error('expected admitPlatformJobs ok')
    assert.ok(Array.isArray(withSession.jobs))
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-METER-DENIALS-DIAG: admitPlatformMeterDenials → ok + denials + counters', async () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitPlatformMeterDenials(ctx)
    assert.equal(empty.ok, true)
    if (!empty.ok) throw new Error('expected admitPlatformMeterDenials ok')
    assert.equal(empty.origin, 'web.diagnostic')
    assert.ok(empty.traceId.length > 0)
    assert.deepEqual(empty.denials, [])
    assert.equal(empty.recentDenialCount, 0)
    assert.equal(empty.denyCount, 0)
    assert.equal(empty.submitCount, 0)
    assert.equal(empty.errorCount, 0)

    process.env[MAX_SUBMITS_ENV] = '1'
    platform.resetPlatformContextForTests()
    const capped = platform.createPlatformContext()
    const first = await capped.gate.submit(
      { token: 'ok', args: {} },
      async () => ({ ok: true }),
    )
    assert.equal(first.ok, true)
    const denied = await capped.gate.submit(
      { token: 'quota-diag', args: {} },
      async () => ({ should: 'not-run' }),
    )
    assert.equal(denied.ok, false)
    assert.equal(denied.denialCode, 'quota_exceeded')

    const listed = platform.admitPlatformMeterDenials(capped)
    assert.equal(listed.ok, true)
    if (!listed.ok) throw new Error('expected admitPlatformMeterDenials ok')
    assert.equal(listed.denials.length, 1)
    assert.equal(listed.denials[0]?.denialCode, 'quota_exceeded')
    assert.equal(listed.denials[0]?.token, 'quota-diag')
    assert.equal(listed.recentDenialCount, 1)
    assert.equal(listed.denyCount, 1)
    assert.equal(listed.submitCount, capped.meter.snapshot().submitCount)
    assert.equal(listed.errorCount, 0)
    assert.equal(capped.abiVersion, '0.9.0-phase-a')
  })

  it('C-APPROVAL-DIAG: admitPlatformApprovals → ok + approvals + approvalsPending', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitPlatformApprovals(ctx, { sessionId: "sess-appr-empty" })
    assert.equal(empty.ok, true)
    if (!empty.ok) throw new Error('expected admitPlatformApprovals ok')
    assert.equal(empty.origin, 'web.diagnostic')
    assert.ok(empty.traceId.length > 0)
    assert.ok(Array.isArray(empty.approvals))
    assert.equal(empty.approvalsPending, ctx.info().approvalsPending)
    assert.equal(empty.approvals.length, 0)

    const created = ctx.approval.request({
      sessionId: 'sess-appr-diag',
      kind: 'tool.exec',
    })
    assert.equal(created.ok, true)

    const listed = platform.admitPlatformApprovals(ctx, {
      sessionId: 'sess-appr-diag',
    })
    assert.equal(listed.ok, true)
    if (!listed.ok) throw new Error('expected admitPlatformApprovals ok')
    assert.equal(listed.approvals.length, 1)
    assert.equal(listed.approvalsPending, 1)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-APPROVAL-RESOLVE: admitResolveApproval → resolved + approvalsPending drop', () => {
    const ctx = platform.createPlatformContext()
    const created = ctx.approval.request({
      sessionId: 'sess-appr-resolve',
      kind: 'tool.exec',
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')
    assert.equal(ctx.info().approvalsPending, 1)

    const resolved = platform.admitResolveApproval(ctx, created.id, {
      approved: true,
      note: 'ok',
    })
    assert.equal(resolved.ok, true)
    if (!resolved.ok) throw new Error('expected admitResolveApproval ok')
    assert.equal(resolved.origin, 'web.diagnostic')
    assert.ok(resolved.traceId.length > 0)
    assert.equal(resolved.resolved, true)
    assert.equal(resolved.approvalsPending, 0)
    assert.equal(ctx.info().approvalsPending, 0)

    const unknown = platform.admitResolveApproval(ctx, 'no-such-id', {
      approved: false,
    })
    assert.equal(unknown.ok, true)
    if (!unknown.ok) throw new Error('expected admitResolveApproval ok')
    assert.equal(unknown.resolved, false)

    const badId = platform.admitResolveApproval(ctx, '', { approved: true })
    assert.equal(badId.ok, false)

    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-APPROVAL-PROMPT-RESOLVE: bindUserPromptResolve fires after pending→resolved', () => {
    const ctx = platform.createPlatformContext()
    /** @type {{ id: string, sessionId: string, approved: boolean }[]} */
    const seen = []
    ctx.approval.bindUserPromptResolve(({ id, sessionId, decision }) => {
      seen.push({ id, sessionId, approved: decision.approved })
    })

    const created = ctx.approval.request({
      sessionId: 'sess-appr-prompt',
      kind: 'ask_user',
      id: 'prompt-mirror-id',
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')

    assert.equal(
      ctx.approval.resolve('prompt-mirror-id', { approved: true, note: 'ok' }),
      true,
    )
    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.id, 'prompt-mirror-id')
    assert.equal(seen[0]?.sessionId, 'sess-appr-prompt')
    assert.equal(seen[0]?.approved, true)

    // Already resolved → no second notify
    assert.equal(
      ctx.approval.resolve('prompt-mirror-id', { approved: false }),
      false,
    )
    assert.equal(seen.length, 1)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-ASK-USER-APPROVAL-OWNED: ask_user sim → pending → approval.resolve settles bridge', async () => {
    const {
      UserPromptBridge,
      allocateApprovalOwnedPromptId,
      userPromptAnswerFromApprovalDecision,
      deriveApprovedFromUserPromptAnswer,
    } = await import(
      pathToFileURL(path.join(here, '../packages/agent/dist/index.js')).href
    )

    const ctx = platform.createPlatformContext()
    const bridge = new UserPromptBridge()
    const sessionId = 'sess-c-ask-owned'

    ctx.approval.bindUserPromptResolve(({ id, sessionId: sid, decision }) => {
      bridge.submit(sid, id, userPromptAnswerFromApprovalDecision(decision))
    })

    /** @type {{ track: Function, resolve: Function, cancelSession: Function }} */
    const tracker = {
      track(input) {
        ctx.approval.request({
          id: input.id,
          sessionId: input.sessionId,
          kind: input.kind,
          title: input.title,
          meta: { promptId: input.id },
        })
      },
      resolve(id, decision) {
        ctx.approval.resolve(id, decision)
      },
      cancelSession(sessionId) {
        ctx.approval.cancelSession(sessionId)
      },
    }

    const promptId = allocateApprovalOwnedPromptId(tracker, {
      sessionId,
      kind: 'ask_user',
      title: 'Conformance ask',
    })
    assert.ok(ctx.info().approvalsPending >= 1)
    const pending = ctx.approval.list(sessionId)
    assert.equal(pending.length, 1)
    assert.equal(pending[0]?.id, promptId)
    assert.equal(pending[0]?.kind, 'ask_user')
    assert.equal(pending[0]?.meta?.promptId, promptId)

    const answerPromise = bridge.waitForAnswer(sessionId, promptId)
    const resolved = platform.admitResolveApproval(ctx, promptId, {
      approved: false,
    })
    assert.equal(resolved.ok, true)
    if (!resolved.ok) throw new Error('expected admit ok')
    assert.equal(resolved.resolved, true)
    assert.equal(ctx.info().approvalsPending, 0)

    const answer = await answerPromise
    assert.deepEqual(answer.selected_ids, ['reject'])
    assert.equal(deriveApprovedFromUserPromptAnswer(answer), false)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-APPROVAL-CANCEL: admitCancelSessionApprovals → cancelled + approvalsPending drop', () => {
    const ctx = platform.createPlatformContext()
    const a = ctx.approval.request({
      sessionId: 'sess-appr-cancel',
      kind: 'tool.exec',
    })
    const b = ctx.approval.request({
      sessionId: 'sess-appr-cancel',
      kind: 'ask_user',
    })
    const other = ctx.approval.request({
      sessionId: 'sess-appr-keep',
      kind: 'tool.exec',
    })
    assert.equal(a.ok, true)
    assert.equal(b.ok, true)
    assert.equal(other.ok, true)
    if (!a.ok || !b.ok || !other.ok) throw new Error('expected request ok')
    assert.equal(ctx.info().approvalsPending, 3)

    const cancelled = platform.admitCancelSessionApprovals(ctx, 'sess-appr-cancel')
    assert.equal(cancelled.ok, true)
    if (!cancelled.ok) throw new Error('expected admitCancelSessionApprovals ok')
    assert.equal(cancelled.origin, 'web.diagnostic')
    assert.ok(cancelled.traceId.length > 0)
    assert.equal(cancelled.cancelled, 2)
    assert.equal(cancelled.approvalsPending, 1)
    assert.equal(ctx.info().approvalsPending, 1)
    assert.equal(ctx.approval.list('sess-appr-cancel').length, 0)
    assert.equal(ctx.approval.list('sess-appr-keep').length, 1)

    const emptySess = platform.admitCancelSessionApprovals(ctx, '')
    assert.equal(emptySess.ok, false)

    const none = platform.admitCancelSessionApprovals(ctx, 'sess-appr-cancel')
    assert.equal(none.ok, true)
    if (!none.ok) throw new Error('expected admitCancelSessionApprovals ok')
    assert.equal(none.cancelled, 0)

    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-PACK: research enabled by default; enable coding; disable research; no deny when enforce off', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.info().packEnforce, false)
    assert.equal(ctx.packs.isEnabled('research'), true)
    assert.equal(ctx.packs.isEnabled('coding'), false)

    ctx.packs.enable('coding', true)
    assert.equal(ctx.packs.supports('coding'), true)
    assert.equal(ctx.packs.isEnabled('coding'), true)

    ctx.packs.enable('research', false)
    assert.equal(ctx.packs.isEnabled('research'), false)

    // Enforce OFF: pack toggles must not deny real tool tokens through the gate.
    const obs = await ctx.gate.submit(
      { token: 'get_instrument_snapshot', args: {} },
      async () => ({ ok: true }),
    )
    assert.equal(obs.ok, true)
    assert.equal(typeof obs.auditId, 'string')
  })

  it('C-PACK-ENFORCE: enforce ON denies data.quote when research disabled; allows after re-enable', async () => {
    process.env[ENFORCE_ENV] = '1'
    platform.resetPlatformContextForTests()
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.info().packEnforce, true)

    ctx.packs.enable('research', false)
    let ran = false
    const denied = await ctx.gate.submit(
      { token: 'data.quote', args: {} },
      async () => {
        ran = true
        return { price: 1 }
      },
    )
    assert.equal(denied.ok, false)
    assert.equal(denied.denialCode, 'pack_disabled')
    assert.equal(typeof denied.auditId, 'string')
    assert.equal(ran, false)
    const snapDenied = ctx.meter.snapshot()
    assert.equal(snapDenied.submitCount, 1)
    assert.equal(snapDenied.errorCount, 0)
    assert.equal(snapDenied.recent[0]?.ok, false)

    ctx.packs.enable('research', true)
    ran = false
    const allowed = await ctx.gate.submit(
      { token: 'data.quote', args: {} },
      async () => {
        ran = true
        return { price: 2 }
      },
    )
    assert.equal(allowed.ok, true)
    assert.equal(ran, true)
    assert.deepEqual(allowed.data, { price: 2 })
  })

  it('C-PACK-ENFORCE-OFF: enforce OFF, research disabled, data.quote still ok (legacy)', async () => {
    process.env[ENFORCE_ENV] = '0'
    platform.resetPlatformContextForTests()
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.info().packEnforce, false)

    ctx.packs.enable('research', false)
    let ran = false
    const obs = await ctx.gate.submit(
      { token: 'data.quote', args: {} },
      async () => {
        ran = true
        return { price: 9 }
      },
    )
    assert.equal(obs.ok, true)
    assert.equal(ran, true)
    assert.deepEqual(obs.data, { price: 9 })
  })

  it('C-PACK-ENFORCE-DEFAULT-ON: unset env ⇒ packEnforce true (SF1)', async () => {
    delete process.env[ENFORCE_ENV]
    platform.resetPlatformContextForTests()
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.info().packEnforce, true)
    assert.equal(platform.readPackEnforceFromEnv({}), true)
    assert.equal(platform.readPackEnforceFromEnv({ OPPTRIX_PLATFORM_PACK_ENFORCE: '0' }), false)
    assert.equal(platform.readPackEnforceFromEnv({ OPPTRIX_PLATFORM_PACK_ENFORCE: 'false' }), false)
    assert.equal(platform.readPackEnforceFromEnv({ OPPTRIX_PLATFORM_PACK_ENFORCE: 'no' }), false)
    assert.equal(platform.readPackEnforceFromEnv({ OPPTRIX_PLATFORM_PACK_ENFORCE: '1' }), true)
  })

  it('C-QUOTA: maxSubmits=1 allows first submit; second is quota_exceeded', async () => {
    const events = eventBus.getEventDispatcher()
    const { gate, meter } = platform.createPlatformGate(events, { maxSubmits: 1 })

    let ranFirst = false
    const first = await gate.submit(
      { token: 'noop', args: {} },
      async () => {
        ranFirst = true
        return { n: 1 }
      },
    )
    assert.equal(first.ok, true)
    assert.equal(ranFirst, true)
    assert.equal(meter.snapshot().denyCount, 0)
    assert.equal(meter.snapshot().submitCount, 1)

    let ranSecond = false
    const second = await gate.submit(
      { token: 'noop', args: {} },
      async () => {
        ranSecond = true
        return { n: 2 }
      },
    )
    assert.equal(second.ok, false)
    assert.equal(second.denialCode, 'quota_exceeded')
    assert.equal(ranSecond, false)
    const snap = meter.snapshot()
    assert.equal(snap.submitCount, 2)
    assert.equal(snap.denyCount, 1)
    assert.equal(snap.errorCount, 0)
    assert.equal(snap.recentDenialCount, 1)
    assert.equal(meter.listRecentDenials().length, 1)
    assert.equal(meter.listRecentDenials()[0]?.denialCode, 'quota_exceeded')
  })

  it('C-GATEWAY: invokeViaGateway goes through gate; missing gate soft-fails', async () => {
    const ctx = platform.createPlatformContext()
    const before = ctx.meter.snapshot().submitCount
    let ran = false
    const obs = await ctx.extensions.invokeViaGateway(
      { token: 'data.quote', args: { code: '600519' } },
      async () => {
        ran = true
        return { ok: true }
      },
    )
    assert.equal(obs.ok, true)
    assert.equal(ran, true)
    assert.equal(ctx.meter.snapshot().submitCount, before + 1)

    const orphan = platform.createExtensionManager({})
    const soft = await orphan.invokeViaGateway(
      { token: 'data.quote' },
      async () => ({ should: 'not-run' }),
    )
    assert.equal(soft.ok, false)
    assert.equal(soft.denialCode, 'gate_unavailable')
    assert.equal(typeof soft.auditId, 'string')
  })

  it('C-HOST: register → activate → run callGate; meter bumps; inactive soft-fails', async () => {
    const ctx = platform.createPlatformContext()
    const reg = ctx.extensions.register('host-ext', { trusted: true })
    assert.equal(reg.ok, true)
    const act = await ctx.extensions.activate('host-ext')
    assert.equal(act.ok, true)
    assert.equal(ctx.info().extensionsActive, 1)

    const before = ctx.meter.snapshot().submitCount
    const result = await ctx.extensions.run('host-ext', async (api) => {
      assert.equal(typeof api.callGate, 'function')
      assert.equal('hub' in api, false)
      return api.callGate('data.quote', { code: '600519' })
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected run ok')
    const obs = /** @type {{ ok?: boolean, hostEcho?: boolean }} */ (result.data)
    assert.equal(obs.ok, true)
    assert.equal(ctx.meter.snapshot().submitCount, before + 1)

    await ctx.extensions.deactivate('host-ext')
    const inactive = await ctx.extensions.run('host-ext', async () => ({ n: 1 }))
    assert.equal(inactive.ok, false)
    assert.equal(typeof inactive.error, 'string')
  })

  it('C-INFO: info() returns abi + packs + packEnforce', () => {
    const ctx = platform.createPlatformContext()
    const info = ctx.info()
    assert.equal(info.abiVersion, '0.9.0-phase-a')
    assert.equal(info.packEnforce, false)
    assert.ok(Array.isArray(info.packs))
    assert.ok(info.packs.some((p) => p.id === 'research' && p.enabled === true))
    assert.equal(typeof info.extensions, 'number')
    assert.equal(typeof info.extensionsActive, 'number')
    assert.equal(info.extensionsActive, 0)
    assert.equal(typeof info.meter.submitCount, 'number')
    assert.equal(typeof info.meter.errorCount, 'number')
    assert.equal(typeof info.meter.denyCount, 'number')
    assert.equal(info.meter.maxSubmits, null)
    assert.equal(typeof info.meter.recentCount, 'number')
    assert.equal(typeof info.meter.recentDenials, 'number')
    assert.equal(info.meter.recentDenials, 0)
    assert.equal(typeof info.jobsListed, 'number')
    assert.equal(typeof info.approvalsPending, 'number')
    assert.equal(info.approvalsPending, 0)
    assert.equal(typeof info.jobWakesRecent, 'number')
    assert.equal(info.jobWakesRecent, 0)
    assert.equal(typeof info.chatAdmitsRecent, 'number')
    assert.equal(info.chatAdmitsRecent, 0)
    assert.equal(typeof info.handsTicketsPending, 'number')
    assert.equal(info.handsTicketsPending, 0)
    assert.equal(typeof info.memoryDurable, 'number')
    assert.equal(info.memoryDurable, 0)
    assert.equal(typeof info.alertsPending, 'number')
    assert.equal(info.alertsPending, 0)
    assert.equal(info.hostWorker, 'stopped')
  })

  it('C-HOST-WORKER: start → ping → callGateFromWorker → stop; crash soft', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.info().hostWorker, 'stopped')
    assert.equal(typeof ctx.extensions.host.start, 'function')
    assert.equal(typeof ctx.extensions.getHostSupervisor, 'function')

    const started = await ctx.extensions.host.start()
    assert.equal(started.ok, true)
    assert.equal(ctx.info().hostWorker, 'running')

    const ping = await ctx.extensions.host.ping()
    assert.equal(ping.ok, true)

    const before = ctx.meter.snapshot().submitCount
    const gate = await ctx.extensions.host.callGateFromWorker('data.quote', {
      code: '600519',
    })
    assert.equal(gate.ok, true)
    if (!gate.ok) throw new Error('expected gate ok')
    assert.equal(ctx.meter.snapshot().submitCount, before + 1)

    await ctx.extensions.host.stop()
    assert.equal(ctx.info().hostWorker, 'stopped')

    const again = await ctx.extensions.host.start()
    assert.equal(again.ok, true)
    await ctx.extensions.getHostSupervisor().simulateCrash()
    await new Promise((r) => setTimeout(r, 80))
    const st = ctx.info().hostWorker
    assert.ok(st === 'crashed' || st === 'stopped')
    // Server process continues — we can still read meter / info.
    assert.equal(typeof ctx.meter.snapshot().submitCount, 'number')
    await ctx.extensions.host.stop()
  })

  it('C-HOST-WORKER-DIAG: admitPlatformHostWorker → hostWorker matches info(); ABI', async () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitPlatformHostWorker(ctx)
    assert.equal(empty.ok, true)
    if (!empty.ok) throw new Error('expected admitPlatformHostWorker ok')
    assert.equal(empty.origin, 'web.diagnostic')
    assert.ok(empty.traceId.length > 0)
    assert.equal(empty.hostWorker, 'stopped')
    assert.equal(empty.hostWorker, ctx.info().hostWorker)

    const started = await ctx.extensions.host.start()
    assert.equal(started.ok, true, started.error)
    const running = platform.admitPlatformHostWorker(ctx, {
      origin: 'cli.diagnostic',
    })
    assert.equal(running.ok, true)
    if (!running.ok) throw new Error('expected admitPlatformHostWorker ok')
    assert.equal(running.origin, 'cli.diagnostic')
    assert.equal(running.hostWorker, 'running')
    assert.equal(running.hostWorker, ctx.info().hostWorker)

    await ctx.extensions.host.stop()
    const after = platform.admitPlatformHostWorker(ctx)
    assert.equal(after.ok, true)
    if (!after.ok) throw new Error('expected admitPlatformHostWorker ok')
    assert.equal(after.hostWorker, 'stopped')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-HANDS-DIAG: admitPlatformHands → pendingCount matches info(); count only; ABI', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitPlatformHands(ctx)
    assert.equal(empty.ok, true)
    if (!empty.ok) throw new Error('expected admitPlatformHands ok')
    assert.equal(empty.origin, 'web.diagnostic')
    assert.ok(empty.traceId.length > 0)
    assert.equal(empty.pendingCount, 0)
    assert.equal(empty.handsTicketsPending, 0)
    assert.equal(empty.pendingCount, ctx.info().handsTicketsPending)
    assert.equal(empty.pendingCount, ctx.hands.pendingCount())

    const issued = ctx.hands.issue({ token: 'hands.ping' })
    assert.equal(issued.ok, true)
    const listed = platform.admitPlatformHands(ctx, { origin: 'cli.diagnostic' })
    assert.equal(listed.ok, true)
    if (!listed.ok) throw new Error('expected admitPlatformHands ok')
    assert.equal(listed.origin, 'cli.diagnostic')
    assert.equal(listed.pendingCount, 1)
    assert.equal(listed.handsTicketsPending, 1)
    assert.equal(listed.pendingCount, ctx.info().handsTicketsPending)
    assert.equal('ticket' in listed, false)
    assert.equal('tickets' in listed, false)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-HANDS: issue ping → invoke pong; one-shot; unsupported token; listGrants adapter', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(typeof ctx.hands.issue, 'function')
    assert.equal(typeof ctx.hands.invoke, 'function')

    const issued = ctx.hands.issue({ token: 'hands.ping' })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue')
    assert.equal(ctx.info().handsTicketsPending, 1)

    const before = ctx.meter.snapshot().submitCount
    const obs = await ctx.hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected pong')
    const data = /** @type {{ pong?: boolean }} */ (obs.data)
    assert.equal(data.pong, true)
    assert.equal(ctx.meter.snapshot().submitCount, before + 1)
    assert.equal(ctx.info().handsTicketsPending, 0)

    const replay = await ctx.hands.invoke(issued.ticket)
    assert.equal(replay.ok, false)
    assert.equal(replay.denialCode, 'ticket_invalid')

    const unsupported = ctx.hands.issue({ token: 'hands.browser.screenshot' })
    assert.equal(unsupported.ok, false)

    const hands = platform.createHandsPort({
      gate: ctx.gate,
      workspace: {
        async listGrants(sessionId) {
          return [{ id: '1', root_id: 'default', abs_path: `/ws/${sessionId}`, mode: 'ro' }]
        },
        async listDir() {
          return { entries: [{ name: 'a.txt', type: 'file' }], path: '.' }
        },
        async readFile() {
          return { content: '', truncated: false, size: 0 }
        },
        async writeFile() {
          return { path: 'unused', bytes: 0 }
        },
        async mkdir() {
          return { path: 'unused' }
        },
        async deletePath() {
          return { deleted: 'unused' }
        },
      },
    })
    const grantTicket = hands.issue({
      token: 'hands.workspace.listGrants',
      args: { sessionId: 'c-hands' },
    })
    assert.equal(grantTicket.ok, true)
    if (!grantTicket.ok) throw new Error('expected grant ticket')
    const grantObs = await hands.invoke(grantTicket.ticket)
    assert.equal(grantObs.ok, true)
    const grants = /** @type {Array<{ root_id?: string }>} */ (grantObs.data)
    assert.equal(grants[0]?.root_id, 'default')
  })

  it('C-HANDS-READ: issue readFile → invoke content; missing relPath → ok:false', async () => {
    const ctx = platform.createPlatformContext()
    const hands = platform.createHandsPort({
      gate: ctx.gate,
      workspace: {
        async listGrants() {
          return []
        },
        async listDir() {
          return { entries: [], path: '.' }
        },
        async readFile(sessionId, rootId, relPath) {
          return {
            content: `read:${sessionId}:${rootId}:${relPath}`,
            truncated: false,
            size: 8,
          }
        },
        async writeFile() {
          return { path: 'unused', bytes: 0 }
        },
        async mkdir() {
          return { path: 'unused' }
        },
        async deletePath() {
          return { deleted: 'unused' }
        },
      },
    })

    const issued = hands.issue({
      token: 'hands.workspace.readFile',
      args: { sessionId: 'c-read', rootId: 'default', relPath: 'x.md' },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected read ticket')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected read ok')
    const data = /** @type {{ content?: string }} */ (obs.data)
    assert.equal(data.content, 'read:c-read:default:x.md')

    const missing = hands.issue({
      token: 'hands.workspace.readFile',
      args: { sessionId: 'c-read', rootId: 'default' },
    })
    assert.equal(missing.ok, true)
    if (!missing.ok) throw new Error('expected issue')
    const bad = await hands.invoke(missing.ticket)
    assert.equal(bad.ok, false)
    assert.match(String(bad.error), /relPath required/)
  })

  it('C-HANDS-WRITE: issue writeFile → invoke path/bytes; overwrite ok without confirm', async () => {
    const ctx = platform.createPlatformContext()
    const hands = platform.createHandsPort({
      gate: ctx.gate,
      workspace: {
        async listGrants() {
          return []
        },
        async listDir() {
          return { entries: [], path: '.' }
        },
        async readFile() {
          return { content: '', truncated: false, size: 0 }
        },
        async writeFile(_sessionId, _rootId, relPath, content) {
          return { path: relPath, bytes: Buffer.byteLength(String(content), 'utf8') }
        },
        async mkdir() {
          return { path: 'unused' }
        },
        async deletePath() {
          return { deleted: 'unused' }
        },
      },
    })

    const issued = hands.issue({
      token: 'hands.workspace.writeFile',
      args: {
        sessionId: 'c-write',
        rootId: 'default',
        relPath: 'new.txt',
        content: 'wave17',
      },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected write ticket')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected write ok')
    const data = /** @type {{ path?: string, bytes?: number }} */ (obs.data)
    assert.equal(data.path, 'new.txt')
    assert.equal(data.bytes, 6)

    const overwrite = hands.issue({
      token: 'hands.workspace.writeFile',
      args: {
        sessionId: 'c-write',
        rootId: 'default',
        relPath: 'exists.txt',
        content: 'x',
      },
    })
    assert.equal(overwrite.ok, true)
    if (!overwrite.ok) throw new Error('expected issue')
    const overwriteObs = await hands.invoke(overwrite.ticket)
    assert.equal(overwriteObs.ok, true)
    if (!overwriteObs.ok) throw new Error('expected overwrite ok')
    const overwriteData = /** @type {{ path?: string, bytes?: number }} */ (overwriteObs.data)
    assert.equal(overwriteData.path, 'exists.txt')
    assert.equal(overwriteData.bytes, 1)
  })

  it('C-HANDS-MUTATE: mkdir ok; deletePath ok without confirmDelete', async () => {
    const ctx = platform.createPlatformContext()
    const hands = platform.createHandsPort({
      gate: ctx.gate,
      workspace: {
        async listGrants() {
          return []
        },
        async listDir() {
          return { entries: [], path: '.' }
        },
        async readFile() {
          return { content: '', truncated: false, size: 0 }
        },
        async writeFile() {
          return { path: 'unused', bytes: 0 }
        },
        async mkdir(_sessionId, _rootId, relPath) {
          return { path: relPath }
        },
        async deletePath(_sessionId, _rootId, relPath) {
          return { deleted: relPath }
        },
      },
    })

    const mk = hands.issue({
      token: 'hands.workspace.mkdir',
      args: { sessionId: 'c-mut', rootId: 'default', relPath: 'dir/a' },
    })
    assert.equal(mk.ok, true)
    if (!mk.ok) throw new Error('expected mkdir ticket')
    const mkObs = await hands.invoke(mk.ticket)
    assert.equal(mkObs.ok, true)
    if (!mkObs.ok) throw new Error('expected mkdir ok')
    const mkData = /** @type {{ path?: string }} */ (mkObs.data)
    assert.equal(mkData.path, 'dir/a')

    const delOk = hands.issue({
      token: 'hands.workspace.deletePath',
      args: { sessionId: 'c-mut', rootId: 'default', relPath: 'dir/a' },
    })
    assert.equal(delOk.ok, true)
    if (!delOk.ok) throw new Error('expected issue')
    const okObs = await hands.invoke(delOk.ticket)
    assert.equal(okObs.ok, true)
    if (!okObs.ok) throw new Error('expected delete ok')
    const delData = /** @type {{ deleted?: string }} */ (okObs.data)
    assert.equal(delData.deleted, 'dir/a')

    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
  })

  it('C-HANDS-SHELL: issue platform → invoke; restricted exec allowlisted; free-form run denied', async () => {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({ token: 'hands.shell.platform' })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected shell.platform ticket')

    const before = ctx.meter.snapshot().submitCount
    const obs = await ctx.hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected shell.platform ok')
    const data = /** @type {{ platform?: string, arch?: string }} */ (obs.data)
    assert.equal(data.platform, process.platform)
    assert.equal(data.arch, process.arch)
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(ctx.meter.snapshot().submitCount, before + 1)

    const restricted = ctx.hands.issue({
      token: 'hands.shell.exec',
      args: { argv: ['uname'] },
    })
    assert.equal(restricted.ok, true)
    if (!restricted.ok) throw new Error('expected restricted exec ticket')
    const execObs = await ctx.hands.invoke(restricted.ticket)
    if (process.platform === 'win32') {
      assert.equal(execObs.ok, false)
      assert.equal(execObs.denialCode, 'unsupported_platform')
    } else {
      assert.equal(execObs.ok, true)
      if (!execObs.ok) throw new Error('expected restricted exec ok')
      const execData = /** @type {{ exitCode?: number, stdout?: string }} */ (execObs.data)
      assert.equal(execData.exitCode, 0)
      assert.match(String(execData.stdout ?? ''), /Darwin|Linux/)
    }

    const freeForm = ctx.hands.issue({
      token: 'hands.shell.run',
      args: { command: 'echo hi' },
    })
    assert.equal(freeForm.ok, false)
    if (freeForm.ok) throw new Error('expected free-form deny')
    assert.match(freeForm.error, /unsupported hands token/)

    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
  })

  it('C-HANDS-BROWSER: issue capabilities → package_present; navigate ok at issue; click/screenshot denied', async () => {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({ token: 'hands.browser.capabilities' })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected browser.capabilities ticket')

    const before = ctx.meter.snapshot().submitCount
    const obs = await ctx.hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected browser.capabilities ok')
    const data = /** @type {{ available?: boolean, engine?: string, reason?: string }} */ (
      obs.data
    )
    assert.equal(data.available, true)
    assert.equal(data.engine, 'agent-browser')
    assert.equal(data.reason, 'package_present')
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(ctx.meter.snapshot().submitCount, before + 1)

    const navIssue = ctx.hands.issue({
      token: 'hands.browser.navigate',
      args: { url: 'https://example.com' },
      ttlMs: 1,
    })
    assert.equal(navIssue.ok, true)
    if (!navIssue.ok) throw new Error('expected navigate issue ok')
    // Drop unused ticket without launching Chromium (Wave 57A invoke covered elsewhere).
    await new Promise((r) => setTimeout(r, 5))
    const expired = await ctx.hands.invoke(navIssue.ticket)
    assert.equal(expired.ok, false)
    assert.equal(expired.denialCode, 'ticket_expired')

    for (const token of [
      'hands.browser.goto',
      'hands.browser.screenshot',
      'hands.browser.click',
      'hands.browser.type',
    ]) {
      const freeForm = ctx.hands.issue({
        token,
        args: { url: 'https://example.com' },
      })
      assert.equal(freeForm.ok, false, token)
      if (freeForm.ok) throw new Error(`expected deny for ${token}`)
      assert.match(freeForm.error, /unsupported hands token/)
    }

    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
  })

  it('C-HANDS-BROWSER-NAVIGATE: injected adapter navigate; UrlPolicy rejects javascript:', async () => {
    const ctx = platform.createPlatformContext()
    const hands = platform.createHandsPort({
      gate: ctx.gate,
      browser: {
        async navigate(url, waitUntil) {
          return { url, title: 'Injected', status: 200, waitUntil }
        },
      },
    })
    const issued = hands.issue({
      token: 'hands.browser.navigate',
      args: { url: 'https://example.com/', waitUntil: 'load' },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected navigate ticket')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected navigate ok')
    const data = /** @type {{ url?: string, title?: string }} */ (obs.data)
    assert.equal(data.url, 'https://example.com/')
    assert.equal(data.title, 'Injected')

    const bad = hands.issue({
      token: 'hands.browser.navigate',
      args: { url: 'javascript:alert(1)' },
    })
    assert.equal(bad.ok, true)
    if (!bad.ok) throw new Error('expected issue ok')
    const badObs = await hands.invoke(bad.ticket)
    assert.equal(badObs.ok, false)
    assert.match(String(badObs.error ?? ''), /not allowed|protocol/i)

    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
  })

  it('C-INGRESS: empty text denied; non-empty ok with traceId', () => {
    const ctx = platform.createPlatformContext()
    const denied = ctx.ingress.admit('test', { text: '   ' })
    assert.equal(denied.ok, false)
    if (denied.ok) throw new Error('expected deny')
    assert.equal(typeof denied.error, 'string')

    const empty = ctx.ingress.admit('test', {})
    assert.equal(empty.ok, false)

    const ok = ctx.ingress.admit('chat', { text: 'hello', sessionId: 's1' })
    assert.equal(ok.ok, true)
    if (!ok.ok) throw new Error('expected admit')
    assert.equal(ok.envelope.origin, 'chat')
    assert.equal(ok.envelope.text, 'hello')
    assert.equal(ok.envelope.sessionId, 's1')
    assert.equal(typeof ok.envelope.traceId, 'string')
    assert.ok(ok.envelope.traceId.length > 0)
  })

  it('C-INGRESS-DIAG: admitPlatformInfo → ok + traceId + info snapshot', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformInfo(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected admitPlatformInfo ok')
    assert.equal(typeof result.traceId, 'string')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.origin, 'web.diagnostic')
    assert.equal(result.info.abiVersion, '0.9.0-phase-a')
    assert.equal(typeof result.info.meter.denyCount, 'number')
  })

  it('C-APPROVAL: request → list pending → resolve; cancelSession; empty sessionId soft-fail', () => {
    const ctx = platform.createPlatformContext()

    const emptySid = ctx.approval.request({ sessionId: '  ', kind: 'tool' })
    assert.equal(emptySid.ok, false)
    if (emptySid.ok) throw new Error('expected soft fail')
    assert.equal(typeof emptySid.error, 'string')

    const created = ctx.approval.request({
      sessionId: 'sess-appr',
      kind: 'tool.exec',
      title: 'Run tool',
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')
    assert.equal(typeof created.id, 'string')
    assert.ok(created.id.length > 0)

    const withFixed = ctx.approval.request({
      sessionId: 'sess-appr',
      kind: 'ask_user',
      id: 'fixed-approval-id',
    })
    assert.equal(withFixed.ok, true)
    if (!withFixed.ok) throw new Error('expected fixed id ok')
    assert.equal(withFixed.id, 'fixed-approval-id')
    const dupFixed = ctx.approval.request({
      sessionId: 'sess-appr',
      kind: 'ask_user',
      id: 'fixed-approval-id',
    })
    assert.equal(dupFixed.ok, false)
    if (dupFixed.ok) throw new Error('expected duplicate')
    assert.equal(dupFixed.error, 'duplicate approval id')

    const pending = ctx.approval.list('sess-appr')
    assert.equal(pending.length, 2)
    assert.equal(pending.some((p) => p.id === created.id), true)
    assert.equal(pending.some((p) => p.id === 'fixed-approval-id'), true)
    assert.equal(ctx.info().approvalsPending, 2)

    assert.equal(
      ctx.approval.resolve(created.id, { approved: true, note: 'ok' }),
      true,
    )
    assert.equal(
      ctx.approval.resolve('fixed-approval-id', { approved: false }),
      true,
    )
    assert.deepEqual(ctx.approval.list('sess-appr'), [])
    assert.equal(ctx.info().approvalsPending, 0)
    assert.equal(ctx.approval.resolve(created.id, { approved: false }), false)

    const a = ctx.approval.request({ sessionId: 'sess-cancel', kind: 'a' })
    const b = ctx.approval.request({ sessionId: 'sess-cancel', kind: 'b' })
    const other = ctx.approval.request({ sessionId: 'sess-keep', kind: 'c' })
    assert.equal(a.ok && b.ok && other.ok, true)
    assert.equal(ctx.approval.cancelSession('sess-cancel'), 2)
    assert.deepEqual(ctx.approval.list('sess-cancel'), [])
    assert.equal(ctx.approval.list('sess-keep').length, 1)
    assert.equal(ctx.approval.cancelSession(''), 0)
  })

  it('C-INGRESS-JOB: admitJobWake requires sessionId; origin job.wake', () => {
    const ctx = platform.createPlatformContext()

    const missing = platform.admitJobWake(ctx, { sessionId: '  ' })
    assert.equal(missing.ok, false)
    if (missing.ok) throw new Error('expected deny')
    assert.equal(typeof missing.error, 'string')

    const ok = platform.admitJobWake(ctx, {
      sessionId: 'sess-wake',
      text: '  resume me  ',
      jobId: 'job-1',
    })
    assert.equal(ok.ok, true)
    if (!ok.ok) throw new Error('expected admitJobWake ok')
    assert.equal(typeof ok.traceId, 'string')
    assert.ok(ok.traceId.length > 0)
    assert.equal(ok.envelope.origin, 'job.wake')
    assert.equal(ok.envelope.sessionId, 'sess-wake')
    assert.equal(ok.envelope.text, 'resume me')
    assert.equal(ok.envelope.jobId, 'job-1')
    assert.equal(ok.envelope.traceId, ok.traceId)

    const defaults = platform.admitJobWake(ctx, { sessionId: 'sess-2' })
    assert.equal(defaults.ok, true)
    if (!defaults.ok) throw new Error('expected defaults ok')
    assert.equal(defaults.envelope.text, 'job.wake')
    assert.equal(defaults.envelope.jobId, undefined)
  })

  it('C-INGRESS-CHAT: admitChat requires sessionId+text; origin web.chat; ring', () => {
    const ctx = platform.createPlatformContext()

    const missingSid = platform.admitChat(ctx, { text: 'hi', sessionId: '  ' })
    assert.equal(missingSid.ok, false)
    if (missingSid.ok) throw new Error('expected deny')
    assert.match(String(missingSid.error), /sessionId/i)

    const missingText = platform.admitChat(ctx, { text: '  ', sessionId: 's1' })
    assert.equal(missingText.ok, false)
    if (missingText.ok) throw new Error('expected deny')
    assert.match(String(missingText.error), /text/i)

    assert.equal(ctx.listRecentChatAdmits().length, 0)
    assert.equal(ctx.info().chatAdmitsRecent, 0)

    const ok = platform.admitChat(ctx, {
      text: '  hello  ',
      sessionId: 'sess-chat',
      principal: { kind: 'user', id: 'u-chat' },
    })
    assert.equal(ok.ok, true)
    if (!ok.ok) throw new Error('expected admitChat ok')
    assert.equal(typeof ok.traceId, 'string')
    assert.ok(ok.traceId.length > 0)
    assert.equal(ok.envelope.origin, 'web.chat')
    assert.equal(ok.envelope.sessionId, 'sess-chat')
    assert.equal(ok.envelope.text, 'hello')
    assert.deepEqual(ok.envelope.principal, { kind: 'user', id: 'u-chat' })
    assert.equal(ok.envelope.traceId, ok.traceId)

    const recent = ctx.listRecentChatAdmits()
    assert.equal(recent.length, 1)
    assert.equal(ctx.info().chatAdmitsRecent, 1)
    assert.equal(recent[0].sessionId, 'sess-chat')
    assert.equal(recent[0].origin, 'web.chat')
    assert.equal(recent[0].traceId, ok.traceId)

    const custom = platform.admitChat(ctx, {
      text: 'ping',
      sessionId: 'sess-2',
      origin: 'cli.chat',
    })
    assert.equal(custom.ok, true)
    if (!custom.ok) throw new Error('expected custom ok')
    assert.equal(custom.envelope.origin, 'cli.chat')
    assert.equal(ctx.info().chatAdmitsRecent, 2)
  })

  it('C-CHAT-ADMIT-WIRE: admitChatBestEffort exported; empty text no-op; admit ok fills ring', () => {
    assert.equal(typeof platform.admitChatBestEffort, 'function')
    const ctx = platform.createPlatformContext()

    assert.equal(
      platform.admitChatBestEffort(ctx, { text: '  ', sessionId: 's1' }),
      false,
    )
    assert.equal(ctx.listRecentChatAdmits().length, 0)

    const ok = platform.admitChatBestEffort(ctx, {
      text: 'wire-check',
      sessionId: 'sess-wire',
      origin: 'web.chat',
    })
    assert.equal(ok, true)
    assert.equal(ctx.listRecentChatAdmits().length, 1)
    assert.equal(ctx.info().chatAdmitsRecent, 1)
    assert.equal(ctx.listRecentChatAdmits()[0].sessionId, 'sess-wire')
  })

  it('C-WAKE-INGRESS: admitAndRemember fills ring; info.jobWakesRecent', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.listRecentJobWakes().length, 0)
    assert.equal(ctx.info().jobWakesRecent, 0)

    const a = platform.admitAndRememberJobWake(ctx, {
      sessionId: 's-wake-1',
      text: 'first',
      jobId: 'j1',
    })
    assert.equal(a.ok, true)
    const b = platform.admitAndRememberJobWake(ctx, {
      sessionId: 's-wake-2',
      text: 'second',
    })
    assert.equal(b.ok, true)

    const recent = ctx.listRecentJobWakes()
    assert.equal(recent.length, 2)
    assert.equal(ctx.info().jobWakesRecent, 2)
    assert.equal(recent[0].sessionId, 's-wake-1')
    assert.equal(recent[0].jobId, 'j1')
    assert.equal(recent[0].origin, 'job.wake')
    assert.equal(typeof recent[0].traceId, 'string')
    assert.equal(typeof recent[0].at, 'string')
    assert.equal(recent[1].sessionId, 's-wake-2')
    if (a.ok) assert.equal(recent[0].traceId, a.traceId)
    if (b.ok) assert.equal(recent[1].traceId, b.traceId)
  })

  it('C-CHECKPOINT: save/list/get/latest', () => {
    const ctx = platform.createPlatformContext()
    const { id } = ctx.checkpoint.save('sess-a', { step: 1, note: 'n1' })
    assert.equal(typeof id, 'string')
    assert.ok(id.length > 0)

    const listed = ctx.checkpoint.list('sess-a')
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.id, id)
    assert.equal(typeof listed[0]?.at, 'string')

    const payload = ctx.checkpoint.get(id)
    assert.deepEqual(payload, { step: 1, note: 'n1' })
    assert.equal(ctx.checkpoint.get('missing'), null)
    assert.deepEqual(ctx.checkpoint.list('other'), [])

    const { id: id2 } = ctx.checkpoint.save('sess-a', { step: 2, note: 'n2' })
    const latest = ctx.checkpoint.latest('sess-a')
    assert.ok(latest)
    assert.equal(latest.id, id2)
    assert.equal(typeof latest.at, 'string')
    assert.deepEqual(latest.payload, { step: 2, note: 'n2' })
    assert.equal(ctx.checkpoint.latest(''), null)
    assert.equal(ctx.checkpoint.latest('   '), null)
    assert.equal(ctx.checkpoint.latest('other'), null)
  })

  it('C-CHECKPOINT-DIAG: admitCheckpointLatest → latest or null; empty fails', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-diag-cp'
    ctx.checkpoint.save(sessionId, { n: 1 })
    const second = ctx.checkpoint.save(sessionId, { n: 2 })

    const hit = platform.admitCheckpointLatest(ctx, sessionId)
    assert.equal(hit.ok, true)
    if (!hit.ok) throw new Error('expected admitCheckpointLatest ok')
    assert.equal(hit.origin, 'web.diagnostic')
    assert.ok(hit.traceId.length > 0)
    assert.ok(hit.latest)
    assert.equal(hit.latest.id, second.id)
    assert.deepEqual(hit.latest.payload, { n: 2 })

    const miss = platform.admitCheckpointLatest(ctx, 'no-such-session')
    assert.equal(miss.ok, true)
    if (!miss.ok) throw new Error('expected admitCheckpointLatest ok')
    assert.equal(miss.latest, null)

    const empty = platform.admitCheckpointLatest(ctx, '')
    assert.equal(empty.ok, false)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-CHECKPOINT-LIST: admitCheckpointList → id+at rows; empty fails', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-diag-cp-list'
    const first = ctx.checkpoint.save(sessionId, { n: 1 })
    const second = ctx.checkpoint.save(sessionId, { n: 2 })

    const hit = platform.admitCheckpointList(ctx, sessionId)
    assert.equal(hit.ok, true)
    if (!hit.ok) throw new Error('expected admitCheckpointList ok')
    assert.equal(hit.origin, 'web.diagnostic')
    assert.ok(hit.traceId.length > 0)
    assert.equal(hit.checkpoints.length, 2)
    assert.equal(hit.checkpoints[0]?.id, first.id)
    assert.equal(hit.checkpoints[1]?.id, second.id)
    assert.equal(typeof hit.checkpoints[0]?.at, 'string')

    const miss = platform.admitCheckpointList(ctx, 'no-such-session')
    assert.equal(miss.ok, true)
    if (!miss.ok) throw new Error('expected admitCheckpointList ok')
    assert.deepEqual(miss.checkpoints, [])

    const empty = platform.admitCheckpointList(ctx, '')
    assert.equal(empty.ok, false)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-CHECKPOINT-GET: admitCheckpointGet → payload or null; empty fails', () => {
    const ctx = platform.createPlatformContext()
    const { id } = ctx.checkpoint.save('sess-diag-cp-get', { n: 7, tag: 'w36' })

    const hit = platform.admitCheckpointGet(ctx, id)
    assert.equal(hit.ok, true)
    if (!hit.ok) throw new Error('expected admitCheckpointGet ok')
    assert.equal(hit.origin, 'web.diagnostic')
    assert.ok(hit.traceId.length > 0)
    assert.deepEqual(hit.payload, { n: 7, tag: 'w36' })

    const miss = platform.admitCheckpointGet(ctx, 'no-such-id')
    assert.equal(miss.ok, true)
    if (!miss.ok) throw new Error('expected admitCheckpointGet ok')
    assert.equal(miss.payload, null)

    const empty = platform.admitCheckpointGet(ctx, '')
    assert.equal(empty.ok, false)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-CHECKPOINT-RESTORE: soft restore payload; applied false; empty fails', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-diag-cp-restore'
    const first = ctx.checkpoint.save(sessionId, { n: 1 })
    const second = ctx.checkpoint.save(sessionId, { n: 2, tag: 'w44' })

    const byId = platform.admitCheckpointRestore(ctx, {
      sessionId,
      checkpointId: first.id,
    })
    assert.equal(byId.ok, true)
    if (!byId.ok) throw new Error('expected admitCheckpointRestore ok')
    assert.equal(byId.origin, 'web.diagnostic')
    assert.ok(byId.traceId.length > 0)
    assert.ok(byId.checkpoint)
    assert.equal(byId.checkpoint.id, first.id)
    assert.deepEqual(byId.checkpoint.payload, { n: 1 })
    assert.equal(byId.applied, false)
    assert.equal(byId.note, 'soft_restore_no_engine_apply')

    const latest = platform.admitCheckpointRestore(ctx, { sessionId })
    assert.equal(latest.ok, true)
    if (!latest.ok) throw new Error('expected admitCheckpointRestore ok')
    assert.ok(latest.checkpoint)
    assert.equal(latest.checkpoint.id, second.id)
    assert.deepEqual(latest.checkpoint.payload, { n: 2, tag: 'w44' })
    assert.equal(latest.applied, false)

    const miss = platform.admitCheckpointRestore(ctx, {
      sessionId: 'no-such-session',
    })
    assert.equal(miss.ok, true)
    if (!miss.ok) throw new Error('expected admitCheckpointRestore ok')
    assert.equal(miss.checkpoint, null)
    assert.equal(miss.applied, false)

    const wrongSession = platform.admitCheckpointRestore(ctx, {
      sessionId: 'other-session',
      checkpointId: first.id,
    })
    assert.equal(wrongSession.ok, false)

    const empty = platform.admitCheckpointRestore(ctx, { sessionId: '' })
    assert.equal(empty.ok, false)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-CHECKPOINT-HARD-RESTORE: apply+confirm mutates; without confirm → confirm_required; ABI 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    /** @type {{ title?: string, model?: string, turnCount?: number, sessionId?: string, turns?: unknown }[]} */
    const seen = []
    ctx.bindCheckpointApply({
      apply(input) {
        seen.push({ ...input })
        return { ok: true, truncated: typeof input.turnCount === 'number' && input.turnCount < 4 }
      },
    })

    const sessionId = 'sess-hard-restore'
    ctx.checkpoint.save(sessionId, {
      phase: 'assistant',
      sessionId,
      title: 'hard-title',
      model: 'hard:model',
      messageCount: 4,
      turnCount: 2,
      at: '2026-01-01T00:00:00.000Z',
    })

    const soft = platform.admitCheckpointRestore(ctx, { sessionId })
    assert.equal(soft.ok, true)
    if (!soft.ok) throw new Error('expected soft ok')
    assert.equal(soft.applied, false)
    assert.equal(seen.length, 0)

    const noConfirm = platform.admitCheckpointRestore(ctx, { sessionId, apply: true })
    assert.equal(noConfirm.ok, false)
    if (noConfirm.ok) throw new Error('expected confirm_required')
    assert.equal(noConfirm.error, 'confirm_required')
    assert.equal(seen.length, 0)

    const hard = platform.admitCheckpointRestore(ctx, {
      sessionId,
      apply: true,
      confirm: true,
    })
    assert.equal(hard.ok, true)
    if (!hard.ok) throw new Error('expected hard ok')
    assert.equal(hard.applied, true)
    assert.equal(hard.truncated, true)
    assert.equal(hard.note, 'hard_restore_metadata_applied')
    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.title, 'hard-title')
    assert.equal(seen[0]?.model, 'hard:model')
    assert.equal(seen[0]?.turnCount, 2)

    const unwired = platform.admitCheckpointRestore(ctx, {
      sessionId,
      apply: true,
      confirm: true,
    })
    // Still wired — unbind then retry
    ctx.bindCheckpointApply(null)
    const noHook = platform.admitCheckpointRestore(ctx, {
      sessionId,
      apply: true,
      confirm: true,
    })
    assert.equal(noHook.ok, false)
    if (noHook.ok) throw new Error('expected fail')
    assert.match(noHook.error, /checkpoint apply not wired/)
    assert.equal(unwired.ok, true)

    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-CHECKPOINT-TURNS: hard restore passes turns; soft unchanged; ABI 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    /** @type {{ turns?: unknown, turnCount?: number }[]} */
    const seen = []
    ctx.bindCheckpointApply({
      apply(input) {
        seen.push({ turns: input.turns, turnCount: input.turnCount })
        return { ok: true, truncated: Array.isArray(input.turns) }
      },
    })

    const sessionId = 'sess-turns-restore'
    const turns = [
      { role: 'user', content: 'u1', at: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant', content: 'a1', at: '2026-01-01T00:00:01.000Z' },
    ]
    ctx.checkpoint.save(sessionId, {
      phase: 'assistant',
      sessionId,
      title: 't',
      messageCount: 2,
      turnCount: 2,
      at: '2026-01-01T00:00:01.000Z',
      turns,
    })

    const soft = platform.admitCheckpointRestore(ctx, { sessionId })
    assert.equal(soft.ok, true)
    if (!soft.ok) throw new Error('expected soft ok')
    assert.equal(soft.applied, false)
    assert.equal(seen.length, 0)
    assert.ok(Array.isArray(/** @type {{ turns?: unknown }} */ (soft.checkpoint?.payload)?.turns))

    const hard = platform.admitCheckpointRestore(ctx, {
      sessionId,
      apply: true,
      confirm: true,
    })
    assert.equal(hard.ok, true)
    if (!hard.ok) throw new Error('expected hard ok')
    assert.equal(hard.applied, true)
    assert.equal(hard.truncated, true)
    assert.equal(seen.length, 1)
    assert.ok(Array.isArray(seen[0]?.turns))
    assert.equal(/** @type {unknown[]} */ (seen[0]?.turns).length, 2)
    assert.equal(seen[0]?.turnCount, 2)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-MEMORY-DIAG: admitPlatformMemory → working/durableCount; empty fails', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-diag-mem'

    const unbound = platform.admitPlatformMemory(ctx, { sessionId })
    assert.equal(unbound.ok, true)
    if (!unbound.ok) throw new Error('expected admitPlatformMemory ok')
    assert.equal(unbound.origin, 'web.diagnostic')
    assert.ok(unbound.traceId.length > 0)
    assert.equal(unbound.working, null)
    assert.equal(unbound.durableCount, 0)
    assert.equal(unbound.memoryDurable, 0)

    ctx.memory.bindWorkingSource((sid) => {
      if (sid !== sessionId) return null
      return {
        goal: 'g',
        entities: 'e',
        facts: 'f',
        workingState: 'w',
        updatedAt: '2026-01-01T00:00:00.000Z',
        compactVersion: 1,
        sourceMessageCount: 1,
      }
    })
    const promoted = ctx.memory.promote({
      sessionId,
      kind: 'fact',
      content: 'c',
      provenance: { source: 'c-memory-diag' },
    })
    assert.equal(promoted.ok, true)

    const hit = platform.admitPlatformMemory(ctx, { sessionId })
    assert.equal(hit.ok, true)
    if (!hit.ok) throw new Error('expected admitPlatformMemory ok')
    assert.ok(hit.working)
    assert.equal(/** @type {{ goal?: string }} */ (hit.working).goal, 'g')
    assert.equal(hit.durableCount, 1)
    assert.equal(hit.memoryDurable, 1)

    const empty = platform.admitPlatformMemory(ctx, { sessionId: '' })
    assert.equal(empty.ok, false)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-MEMORY-PROMOTE: admitPromoteMemory → id/entry; provenance required', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-diag-promote'

    const ok = platform.admitPromoteMemory(ctx, {
      sessionId,
      kind: 'fact',
      content: 'promoted-via-admit',
      provenance: { source: 'c-memory-promote' },
    })
    assert.equal(ok.ok, true)
    if (!ok.ok) throw new Error('expected admitPromoteMemory ok')
    assert.equal(ok.origin, 'web.diagnostic')
    assert.ok(ok.traceId.length > 0)
    assert.ok(ok.id.length > 0)
    assert.equal(ok.entry.content, 'promoted-via-admit')
    assert.equal(ok.entry.provenance.source, 'c-memory-promote')
    assert.equal(ok.memoryDurable, 1)

    const noProv = platform.admitPromoteMemory(ctx, {
      sessionId,
      kind: 'note',
      content: 'nope',
    })
    assert.equal(noProv.ok, false)
    if (noProv.ok) throw new Error('expected provenance fail')
    assert.equal(noProv.denialCode, 'provenance_required')

    const empty = platform.admitPromoteMemory(ctx, {
      sessionId: '',
      kind: 'fact',
      content: 'c',
      provenance: { source: 's' },
    })
    assert.equal(empty.ok, false)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-TURN-CHECKPOINT: two phase snapshots via platform.checkpoint', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-turn-cp'
    const userSnap = {
      phase: 'user',
      sessionId,
      title: 't',
      model: 'm',
      messageCount: 1,
      turnCount: 1,
      at: new Date().toISOString(),
    }
    const assistantSnap = {
      phase: 'assistant',
      sessionId,
      title: 't',
      model: 'm',
      messageCount: 2,
      turnCount: 2,
      at: new Date().toISOString(),
    }
    ctx.checkpoint.save(sessionId, { ...userSnap })
    ctx.checkpoint.save(sessionId, { ...assistantSnap })
    const listed = ctx.checkpoint.list(sessionId)
    assert.ok(listed.length >= 2)
    const p0 = ctx.checkpoint.get(listed[0].id)
    const p1 = ctx.checkpoint.get(listed[1].id)
    assert.equal(/** @type {{ phase?: string }} */ (p0)?.phase, 'user')
    assert.equal(/** @type {{ phase?: string }} */ (p1)?.phase, 'assistant')
  })

  it('C-MEM-GET: unbound null; bind fake working → getWorking snapshot', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.memory.getWorking('s1'), null)
    ctx.memory.bindWorkingSource((sessionId) => {
      if (sessionId !== 's1') return null
      return {
        goal: 'g',
        entities: 'e',
        facts: '',
        workingState: 'w',
        updatedAt: '2026-01-01T00:00:00.000Z',
        compactVersion: 2,
        sourceMessageCount: 5,
      }
    })
    const snap = ctx.memory.getWorking('s1')
    assert.ok(snap)
    assert.equal(snap.goal, 'g')
    assert.equal(snap.entities, 'e')
    assert.equal(snap.workingState, 'w')
    assert.equal(snap.nonEmpty, true)
    assert.equal(snap.compactVersion, 2)
    assert.equal(snap.sourceMessageCount, 5)
  })

  it('C-MEM-PROMOTE: provenance required; with provenance stores + listDurable', () => {
    const ctx = platform.createPlatformContext()
    const denied = ctx.memory.promote({
      sessionId: 's1',
      kind: 'fact',
      content: 'x',
    })
    assert.equal(denied.ok, false)
    if (denied.ok) throw new Error('expected deny')
    assert.equal(denied.denialCode, 'provenance_required')

    const ok = ctx.memory.promote({
      sessionId: 's1',
      kind: 'fact',
      content: 'x',
      provenance: { source: 'unit-test' },
    })
    assert.equal(ok.ok, true)
    if (!ok.ok) throw new Error('expected ok')
    const listed = ctx.memory.listDurable('s1')
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.id, ok.id)
    assert.equal(listed[0]?.provenance.source, 'unit-test')
    assert.equal(ctx.info().memoryDurable, 1)
  })

  it('C-ALERT: job.terminal → list alert; acknowledge drops alertsPending', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(typeof ctx.alerts.list, 'function')
    assert.equal(typeof ctx.alerts.acknowledge, 'function')
    assert.equal(typeof ctx.alerts.clear, 'function')
    assert.equal(ctx.info().alertsPending, 0)

    ctx.events.emit(eventBus.SystemEvents.job.terminal, {
      jobId: 'alert-job',
      status: 'completed',
    })
    const alerts = ctx.alerts.list()
    assert.equal(alerts.length, 1)
    assert.equal(alerts[0]?.kind, 'job.terminal')
    assert.equal(alerts[0]?.title, 'Job alert-job completed')
    assert.equal(ctx.info().alertsPending, 1)

    assert.equal(ctx.alerts.acknowledge(alerts[0].id), true)
    assert.equal(ctx.info().alertsPending, 0)
  })

  it('C-ALERT-DIAG: admitPlatformAlerts → ok + alerts + alertsPending', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitPlatformAlerts(ctx)
    assert.equal(empty.ok, true)
    if (!empty.ok) throw new Error('expected admitPlatformAlerts ok')
    assert.equal(empty.origin, 'web.diagnostic')
    assert.ok(empty.traceId.length > 0)
    assert.deepEqual(empty.alerts, [])
    assert.equal(empty.alertsPending, 0)

    const id = ctx.alerts.pushForTests({
      kind: 'diag.kernel',
      title: 'C-ALERT-DIAG',
      payload: {},
    })
    const result = platform.admitPlatformAlerts(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected admitPlatformAlerts ok')
    assert.equal(result.alerts.length, 1)
    assert.equal(result.alerts[0]?.id, id)
    assert.ok(result.alertsPending >= 1)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-ALERT-ACK: admitAcknowledgeAlert → ack true; unknown false; empty fails', () => {
    const ctx = platform.createPlatformContext()
    const id = ctx.alerts.pushForTests({
      kind: 'diag.ack',
      title: 'C-ALERT-ACK',
      payload: {},
    })
    assert.equal(ctx.info().alertsPending, 1)

    const ack = platform.admitAcknowledgeAlert(ctx, id)
    assert.equal(ack.ok, true)
    if (!ack.ok) throw new Error('expected admitAcknowledgeAlert ok')
    assert.equal(ack.origin, 'web.diagnostic')
    assert.ok(ack.traceId.length > 0)
    assert.equal(ack.acknowledged, true)
    assert.equal(ack.alertsPending, 0)

    const unknown = platform.admitAcknowledgeAlert(ctx, 'no-such-id')
    assert.equal(unknown.ok, true)
    if (!unknown.ok) throw new Error('expected admitAcknowledgeAlert ok')
    assert.equal(unknown.acknowledged, false)

    const empty = platform.admitAcknowledgeAlert(ctx, '')
    assert.equal(empty.ok, false)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-PACK-DIAG: admitPlatformPacks → ok + packs + packEnforce; set enable roundtrip', () => {
    const ctx = platform.createPlatformContext()
    const listed = platform.admitPlatformPacks(ctx)
    assert.equal(listed.ok, true)
    if (!listed.ok) throw new Error('expected admitPlatformPacks ok')
    assert.equal(listed.origin, 'web.diagnostic')
    assert.ok(listed.traceId.length > 0)
    assert.ok(Array.isArray(listed.packs))
    const research = listed.packs.find((p) => p.id === 'research')
    assert.ok(research)
    assert.equal(research.enabled, true)
    assert.equal(typeof listed.packEnforce, 'boolean')
    assert.equal(listed.packEnforce, ctx.info().packEnforce)

    assert.equal(ctx.packs.isEnabled('coding'), false)
    const on = platform.setPlatformPackEnabled(ctx, 'coding', true)
    assert.equal(on.ok, true)
    assert.equal(ctx.packs.isEnabled('coding'), true)
    const off = platform.setPlatformPackEnabled(ctx, 'coding', false)
    assert.equal(off.ok, true)
    assert.equal(ctx.packs.isEnabled('coding'), false)

    const bad = platform.setPlatformPackEnabled(ctx, 'nope', true)
    assert.equal(bad.ok, false)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-EXT-DIAG: admitPlatformExtensions → ok + list + extensionsActive + hostWorker', async () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitPlatformExtensions(ctx)
    assert.equal(empty.ok, true)
    if (!empty.ok) throw new Error('expected admitPlatformExtensions ok')
    assert.equal(empty.origin, 'web.diagnostic')
    assert.ok(empty.traceId.length > 0)
    assert.ok(Array.isArray(empty.extensions))
    assert.equal(empty.extensions.length, 0)
    assert.equal(empty.extensionsActive, 0)
    assert.equal(empty.hostWorker, 'stopped')
    assert.equal(empty.extensionsActive, ctx.info().extensionsActive)
    assert.equal(empty.hostWorker, ctx.info().hostWorker)

    assert.equal(ctx.extensions.register('c-ext-diag', { trusted: true }).ok, true)
    const act = await ctx.extensions.activate('c-ext-diag')
    assert.equal(act.ok, true)
    const listed = platform.admitPlatformExtensions(ctx)
    assert.equal(listed.ok, true)
    if (!listed.ok) throw new Error('expected admitPlatformExtensions ok')
    assert.equal(listed.extensions.length, 1)
    assert.equal(listed.extensions[0]?.id, 'c-ext-diag')
    assert.equal(listed.extensions[0]?.state, 'active')
    assert.equal(listed.extensionsActive, 1)
    assert.equal(listed.hostWorker, ctx.info().hostWorker)
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-EXT-ACTIVATE: admitActivateExtension → active; unknown fails; ABI', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(
      ctx.extensions.registerFromManifest({
        id: 'c-ext-activate',
        name: 'Activate',
        version: '0.1.0',
      }, { trusted: true }).ok,
      true,
    )
    assert.equal(ctx.info().extensionsActive, 0)

    const act = await platform.admitActivateExtension(ctx, 'c-ext-activate', {
      origin: 'cli.diagnostic',
    })
    assert.equal(act.ok, true)
    if (!act.ok) throw new Error('expected admitActivateExtension ok')
    assert.equal(act.origin, 'cli.diagnostic')
    assert.ok(act.traceId.length > 0)
    assert.equal(act.extension.id, 'c-ext-activate')
    assert.equal(act.extension.state, 'active')
    assert.equal(act.extensionsActive, 1)
    assert.equal(ctx.info().extensionsActive, 1)

    const unknown = await platform.admitActivateExtension(ctx, 'missing-ext')
    assert.equal(unknown.ok, false)
    if (unknown.ok) throw new Error('expected unknown fail')
    assert.match(unknown.error, /not found/)

    const empty = await platform.admitActivateExtension(ctx, '  ')
    assert.equal(empty.ok, false)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  // Heavy opx zip + host-worker vm path lives in extension-opx-worker-js-w58a
  // (asserts experimental:true + ABI pin). Skip duplicate here.
  it.skip(
    'C-EXT-WORKER-JS-EXPERIMENTAL: covered by extension-opx-worker-js-w58a (ABI 0.9.0-phase-a)',
    () => {},
  )

  it('C-PACK-PERSIST: enable survives createPackRegistry reload via preference', () => {
    platform.clearDomainPackPreferencesForTests()
    const a = platform.createPackRegistry()
    a.enable('coding', true)
    const b = platform.createPackRegistry()
    assert.equal(b.isEnabled('coding'), true)
    platform.clearDomainPackPreferencesForTests()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
  })

  it('C-EXT-DEACTIVATE: admitDeactivateExtension → inactive; unknown fails; ABI', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(
      ctx.extensions.registerFromManifest({
        id: 'c-ext-deactivate',
        name: 'Deactivate',
        version: '0.1.0',
      }, { trusted: true }).ok,
      true,
    )
    const act = await platform.admitActivateExtension(ctx, 'c-ext-deactivate')
    assert.equal(act.ok, true)
    if (!act.ok) throw new Error('expected activate ok')
    assert.equal(act.extensionsActive, 1)

    const deact = await platform.admitDeactivateExtension(
      ctx,
      'c-ext-deactivate',
      { origin: 'cli.diagnostic' },
    )
    assert.equal(deact.ok, true)
    if (!deact.ok) throw new Error('expected admitDeactivateExtension ok')
    assert.equal(deact.origin, 'cli.diagnostic')
    assert.ok(deact.traceId.length > 0)
    assert.equal(deact.extension.id, 'c-ext-deactivate')
    assert.equal(deact.extension.state, 'inactive')
    assert.equal(deact.extension.name, 'Deactivate')
    assert.equal(deact.extensionsActive, 0)
    assert.equal(ctx.info().extensionsActive, 0)
    assert.ok(ctx.extensions.list().find((r) => r.id === 'c-ext-deactivate'))

    const unknown = await platform.admitDeactivateExtension(ctx, 'missing-ext')
    assert.equal(unknown.ok, false)
    if (unknown.ok) throw new Error('expected unknown fail')
    assert.match(unknown.error, /not found/)

    const empty = await platform.admitDeactivateExtension(ctx, '  ')
    assert.equal(empty.ok, false)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('C-JOB-EVENT: mock cancel true emits job.terminal', () => {
    const events = eventBus.getEventDispatcher()
    /** @type {Array<{ name: string, payload: Record<string, unknown> }>} */
    const seen = []
    const unsub = events.subscribe((env) => {
      seen.push({ name: env.name, payload: /** @type {Record<string, unknown>} */ (env.payload) })
    })

    const facade = platform.createJobsFacade({
      events,
      backends: [
        {
          list: () => [],
          cancel: (id) => id === 'job-cancel-me',
        },
      ],
    })

    assert.equal(facade.cancel('job-cancel-me'), true)
    unsub()

    const terminal = seen.find((e) => e.name === eventBus.SystemEvents.job.terminal)
    assert.ok(terminal)
    assert.equal(terminal.payload.jobId, 'job-cancel-me')
    assert.equal(terminal.payload.status, 'cancelled')

    seen.length = 0
    assert.equal(facade.cancel('nope'), false)
  })
})
