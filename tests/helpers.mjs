/**
 * Shared helpers for CI / local integration tests.
 */

/**
 * @param {string} url
 * @param {number} [timeoutMs]
 */
export async function waitForUrl(url, timeoutMs = 30_000) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(url)
      if (resp.ok) return resp
      lastError = new Error(`HTTP ${resp.status}`)
    } catch (err) {
      lastError = err
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError}` : ''}`)
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} [timeoutMs]
 */
export function waitForExit(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Process ${child.pid} did not exit within ${timeoutMs}ms`))
    }, timeoutMs)
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
}

/**
 * @param {import('node:child_process').ChildProcess} child
 */
export async function stopProcess(child) {
  if (child.killed || child.exitCode !== null) return
  child.kill('SIGTERM')
  try {
    await waitForExit(child, 5_000)
  } catch {
    child.kill('SIGKILL')
    await waitForExit(child, 2_000).catch(() => {})
  }
}

/**
 * Pick a pseudo-random local port in a safe range for parallel test runs.
 */
export function pickTestPort() {
  return 18_000 + Math.floor(Math.random() * 4_000)
}
