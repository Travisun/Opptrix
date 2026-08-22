#!/usr/bin/env node
/**
 * Local E2E: heal packaged Opptrix Chromium → launch → newPage → screenshot.
 * Usage: node packages/agent-browser/scripts/heal-e2e.mjs [packagedBrowsersPath]
 */
import { rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import {
  chromeAppNeedsEntitlementsHeal,
  ensureDarwinBundledChromiumHealed,
  findChromeForTestingApp,
} from '../dist/chromium-darwin-heal.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_PACKAGED = path.join(
  '/Applications/Opptrix.app/Contents/Resources/runtime-stage/playwright-browsers',
)

const packagedPath = path.resolve(process.argv[2] ?? DEFAULT_PACKAGED)

if (process.platform !== 'darwin') {
  console.error('HEAL_E2E SKIP: darwin only')
  process.exit(0)
}

const healDir = path.join(os.homedir(), '.opptrix', 'playwright-browsers')
rmSync(healDir, { recursive: true, force: true })
console.log(`HEAL_E2E: cleared ${healDir}`)
console.log(`HEAL_E2E: packaged path ${packagedPath}`)

const chromeBefore = findChromeForTestingApp(packagedPath)
if (!chromeBefore) {
  console.error('HEAL_E2E FAIL: Google Chrome for Testing.app not found')
  process.exit(1)
}
console.log(`HEAL_E2E: packaged needs heal = ${chromeAppNeedsEntitlementsHeal(chromeBefore)}`)

const healedPath = await ensureDarwinBundledChromiumHealed(packagedPath)
console.log(`HEAL_E2E: healed browsers path = ${healedPath}`)

process.env.PLAYWRIGHT_BROWSERS_PATH = healedPath
const exe = chromium.executablePath()
console.log(`HEAL_E2E: chromium executable = ${exe}`)

const browser = await chromium.launch({
  headless: true,
  executablePath: exe,
})
try {
  const page = await browser.newPage()
  await page.setContent('<html><body><h1>heal ok</h1></body></html>')
  const png = await page.screenshot({ type: 'png' })
  await page.close()
  if (!png || png.length < 100) {
    throw new Error('screenshot too small')
  }
  console.log(`HEAL_E2E SUCCESS: newPage + screenshot (${png.length} bytes)`)
} finally {
  await browser.close()
}
