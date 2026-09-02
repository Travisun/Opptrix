/**
 * materializeExternalSymlinks: replace workspace-style symlinks that point
 * outside the dest tree with real recursive copies (seed post-cpSync).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { before, describe, it } from 'node:test'

/** @type {typeof import('../packages/system-update/dist/index.js')} */
let su

before(async () => {
  su = await import('../packages/system-update/dist/index.js')
})

describe('materializeExternalSymlinks', () => {
  it('replaces external workspace symlink with real dir under root', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-mat-ext-'))
    try {
      // Outside of dest: packages/pkg (like /app/packages/user-store)
      const outsidePkg = path.join(tmp, 'packages', 'pkg')
      fs.mkdirSync(outsidePkg, { recursive: true })
      fs.writeFileSync(path.join(outsidePkg, 'store.js'), 'export const ok = 1\n')
      fs.writeFileSync(
        path.join(outsidePkg, 'package.json'),
        `${JSON.stringify({ name: '@scope/pkg', version: '1.0.0', type: 'module' })}\n`,
      )

      // Dest tree after a naive cp that left an absolute-style external symlink
      const dest = path.join(tmp, 'slots', '1.0.0')
      const linkPath = path.join(dest, 'node_modules', '@scope', 'pkg')
      fs.mkdirSync(path.dirname(linkPath), { recursive: true })
      fs.symlinkSync(outsidePkg, linkPath)

      assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), true)
      assert.ok(!fs.realpathSync(linkPath).startsWith(path.resolve(dest) + path.sep))

      const result = su.materializeExternalSymlinks(dest)
      assert.ok(result.replaced.includes(linkPath), `expected ${linkPath} in ${JSON.stringify(result.replaced)}`)

      const st = fs.lstatSync(linkPath)
      assert.equal(st.isSymbolicLink(), false)
      assert.ok(st.isDirectory())
      const real = fs.realpathSync(linkPath)
      const rootReal = fs.realpathSync(dest)
      assert.ok(
        real === rootReal || real.startsWith(rootReal + path.sep),
        `realpath ${real} must stay under ${rootReal}`,
      )
      assert.ok(fs.existsSync(path.join(linkPath, 'store.js')))
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('leaves in-tree symlinks untouched', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-mat-int-'))
    try {
      const dest = path.join(tmp, 'slot')
      const realDir = path.join(dest, 'packages', 'local')
      fs.mkdirSync(realDir, { recursive: true })
      fs.writeFileSync(path.join(realDir, 'index.js'), 'export {}\n')
      const linkPath = path.join(dest, 'node_modules', '@local', 'pkg')
      fs.mkdirSync(path.dirname(linkPath), { recursive: true })
      fs.symlinkSync(realDir, linkPath)

      const result = su.materializeExternalSymlinks(dest)
      assert.equal(result.replaced.length, 0)
      assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), true)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('seedCurrentSlot materializes external @opptrix workspace links', () => {
  it('seeded slot has no external symlink under node_modules/@opptrix', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-mat-seed-'))
    const prevSystem = process.env.OPPTRIX_SYSTEM_DIR
    const prevVendor = process.env.OPPTRIX_VENDOR_NODE_MODULES
    try {
      const systemDir = path.join(tmp, 'system')
      const vendorNm = path.join(tmp, 'vendor', 'node_modules')
      fs.mkdirSync(vendorNm, { recursive: true })
      process.env.OPPTRIX_SYSTEM_DIR = systemDir
      process.env.OPPTRIX_VENDOR_NODE_MODULES = vendorNm

      // Seed root mimics /app: real package + workspace symlink in node_modules
      const seedRoot = path.join(tmp, 'app')
      fs.mkdirSync(path.join(seedRoot, 'apps', 'server', 'dist'), { recursive: true })
      su.writeRuntimeMarker(seedRoot, { version: '1.0.0' })
      fs.writeFileSync(
        path.join(seedRoot, 'apps', 'server', 'dist', 'index.js'),
        'export const v = "1.0.0"\n',
      )

      const pkgDir = path.join(seedRoot, 'packages', 'user-store')
      fs.mkdirSync(pkgDir, { recursive: true })
      fs.writeFileSync(path.join(pkgDir, 'store.js'), 'export const store = 1\n')
      const wsLink = path.join(seedRoot, 'node_modules', '@opptrix', 'user-store')
      fs.mkdirSync(path.dirname(wsLink), { recursive: true })
      // Absolute target (reproduces Node cpSync dereference leftover shape)
      fs.symlinkSync(pkgDir, wsLink)

      const result = su.seedCurrentSlot({
        systemDir,
        seedRoot,
        version: '1.0.0',
      })
      assert.equal(result.seeded, true)

      const slotPkg = path.join(result.slotPath, 'node_modules', '@opptrix', 'user-store')
      assert.ok(fs.existsSync(slotPkg), 'expected @opptrix/user-store under slot')
      assert.equal(fs.lstatSync(slotPkg).isSymbolicLink(), false)
      const real = fs.realpathSync(slotPkg)
      const slotReal = fs.realpathSync(result.slotPath)
      assert.ok(
        real === slotReal || real.startsWith(slotReal + path.sep),
        `slot package realpath ${real} must stay under ${slotReal}`,
      )
    } finally {
      if (prevSystem === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
      else process.env.OPPTRIX_SYSTEM_DIR = prevSystem
      if (prevVendor === undefined) delete process.env.OPPTRIX_VENDOR_NODE_MODULES
      else process.env.OPPTRIX_VENDOR_NODE_MODULES = prevVendor
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
