/**
 * P1 有界队列：HostnameRateLimiter / InferenceJobQueue / LanceOpScheduler 超限行为。
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { HostnameRateLimiter } from '../packages/a-stock-layer/dist/providers/common/rate-limiter.js'
import { InferenceJobQueue } from '../packages/local-inference/dist/index.js'
import { LanceOpScheduler } from '../packages/doc-library/dist/index.js'

describe('HostnameRateLimiter bounded queue', () => {
  /** @type {HostnameRateLimiter[]} */
  const limiters = []

  after(() => {
    for (const l of limiters) l.dispose()
  })

  it('rejects acquire when per-host queue exceeds maxQueued', async () => {
    const limiter = new HostnameRateLimiter({
      intervalMs: 50,
      maxQueued: 2,
      pruneIntervalMs: 0,
    })
    limiters.push(limiter)

    await limiter.acquire('example.test')
    const waiting = [
      limiter.acquire('example.test'),
      limiter.acquire('example.test'),
    ]
    await assert.rejects(
      () => limiter.acquire('example.test'),
      (err) => err instanceof Error && /queue full/i.test(err.message),
    )

    limiter.release('example.test')
    await waiting[0]
    limiter.release('example.test')
    await waiting[1]
    limiter.release('example.test')
  })

  it('prunes idle hosts and keeps busy / queued hosts', async () => {
    const limiter = new HostnameRateLimiter({
      intervalMs: 1,
      maxQueued: 8,
      idleTtlMs: 0,
      pruneIntervalMs: 0,
    })
    limiters.push(limiter)

    await limiter.acquire('idle.host')
    limiter.release('idle.host')

    await limiter.acquire('keep.host')
    const waiting = limiter.acquire('keep.host')
    assert.equal(limiter.status()['keep.host'].queued, 1)

    assert.equal(limiter.pruneIdleHosts(Date.now() + 1), 1)
    assert.equal(limiter.hostCount(), 1)
    assert.ok(limiter.status()['keep.host'])
    assert.equal(limiter.status()['idle.host'], undefined)

    limiter.release('keep.host')
    await waiting
    limiter.release('keep.host')
  })
})

describe('InferenceJobQueue bounded depth', () => {
  it('rejects enqueue beyond maxDepth without growing an unbounded chain', async () => {
    /** @type {() => void} */
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const q = new InferenceJobQueue({ maxDepth: 2 })

    const first = q.enqueue(async () => {
      await gate
      return 'ok'
    })
    // first is running → pending can hold 2 more
    const p1 = q.enqueue(async () => 'a')
    const p2 = q.enqueue(async () => 'b')
    assert.equal(q.depth, 2)

    await assert.rejects(
      () => q.enqueue(async () => 'overflow'),
      (err) => err instanceof Error && /full/i.test(err.message),
    )
    assert.equal(q.depth, 2)

    release()
    assert.equal(await first, 'ok')
    assert.equal(await p1, 'a')
    assert.equal(await p2, 'b')
    assert.equal(q.depth, 0)
    assert.equal(q.busy, false)
  })

  it('serializes tasks on the normal path', async () => {
    const q = new InferenceJobQueue({ maxDepth: 8 })
    const log = []
    const jobs = [1, 2, 3].map((id) => q.enqueue(async () => {
      log.push(`s${id}`)
      await new Promise((r) => setTimeout(r, 5))
      log.push(`e${id}`)
      return id
    }))
    assert.deepEqual(await Promise.all(jobs), [1, 2, 3])
    assert.deepEqual(log, ['s1', 'e1', 's2', 'e2', 's3', 'e3'])
  })
})

describe('LanceOpScheduler bounded pending', () => {
  it('drops oldest pending write when over maxPending; keeps running and read priority', async () => {
    const sched = new LanceOpScheduler({ maxPending: 2 })
    /** @type {() => void} */
    let releaseRun
    const gate = new Promise((resolve) => {
      releaseRun = resolve
    })
    const log = []

    const running = sched.schedule('write', async () => {
      log.push('run')
      await gate
      return 'run'
    })
    await new Promise((r) => setTimeout(r, 5))

    const wOld = sched.schedule('write', async () => {
      log.push('old')
      return 'old'
    })
    const wMid = sched.schedule('write', async () => {
      log.push('mid')
      return 'mid'
    })
    assert.deepEqual(sched.pendingKinds(), ['write', 'write'])

    // pending 已满：新 write 应挤掉最旧 pending write
    const wNew = sched.schedule('write', async () => {
      log.push('new')
      return 'new'
    })
    await assert.rejects(
      () => wOld,
      (err) => err instanceof Error && /dropped oldest write/i.test(err.message),
    )
    assert.deepEqual(sched.pendingKinds(), ['write', 'write'])

    // 再满时 read 也可挤掉最旧 write，并插到 write 前
    const rd = sched.schedule('read', async () => {
      log.push('read')
      return 'read'
    })
    assert.equal(sched.pendingKinds()[0], 'read')
    await assert.rejects(() => wMid)

    releaseRun()
    assert.equal(await running, 'run')
    assert.equal(await rd, 'read')
    assert.equal(await wNew, 'new')
    assert.deepEqual(log, ['run', 'read', 'new'])
  })

  it('rejects when full and no pending write to drop', async () => {
    const sched = new LanceOpScheduler({ maxPending: 1 })
    /** @type {() => void} */
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const running = sched.schedule('read', async () => {
      await gate
    })
    await new Promise((r) => setTimeout(r, 5))
    const pendingRead = sched.schedule('read', async () => 'ok')
    await assert.rejects(
      () => sched.schedule('write', async () => 'nope'),
      (err) => err instanceof Error && /queue full/i.test(err.message),
    )
    release()
    await running
    assert.equal(await pendingRead, 'ok')
  })
})
