import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  excludeSelfFromPids,
  resolveDarwinBundleRoot,
  resolveWinInstallDir,
  resolveLinuxAppRoot,
  collectLinuxAppRoots,
  pathMatchesLinuxRoot,
  parsePsPidsMatchingRoot,
} = require('../apps/desktop/electron/kill-app-for-update.cjs')

describe('kill-app-for-update helpers', () => {
  it('excludeSelfFromPids never lists process.pid / self', () => {
    const self = 4242
    assert.deepEqual(excludeSelfFromPids([1, self, 3, self, 0, -1, Number.NaN], self), [
      1,
      3,
    ])
    assert.ok(!excludeSelfFromPids([self], self).includes(self))
  })

  it('resolveDarwinBundleRoot parses Contents/MacOS execPath', () => {
    assert.equal(
      resolveDarwinBundleRoot('/Applications/Opptrix.app/Contents/MacOS/Opptrix'),
      '/Applications/Opptrix.app',
    )
    assert.equal(resolveDarwinBundleRoot('/usr/local/bin/opptrix'), null)
    assert.equal(resolveDarwinBundleRoot('/tmp/Foo.application/bin'), null)
  })

  it('resolveWinInstallDir is dirname of exe', () => {
    assert.equal(
      resolveWinInstallDir('C:\\Users\\a\\AppData\\Local\\Programs\\Opptrix\\Opptrix.exe'),
      'C:\\Users\\a\\AppData\\Local\\Programs\\Opptrix',
    )
  })

  it('resolveLinuxAppRoot prefers APPDIR then APPIMAGE', () => {
    assert.equal(
      resolveLinuxAppRoot('/tmp/.mount_x/AppRun', { APPDIR: '/tmp/.mount_Opptrix' }),
      '/tmp/.mount_Opptrix',
    )
    assert.equal(
      resolveLinuxAppRoot('/opt/Opptrix/AppRun', { APPIMAGE: '/home/u/Opptrix.AppImage' }),
      '/home/u/Opptrix.AppImage',
    )
    assert.equal(resolveLinuxAppRoot('/opt/Opptrix/Opptrix', {}), '/opt/Opptrix')
  })

  it('collectLinuxAppRoots covers APPDIR, APPIMAGE, exec dir and .mount_', () => {
    const roots = collectLinuxAppRoots('/tmp/.mount_OpptrixABC/usr/bin/opptrix', {
      APPDIR: '/tmp/.mount_OpptrixABC',
      APPIMAGE: '/home/u/Opptrix-1.2.6.AppImage',
    })
    assert.ok(roots.includes('/tmp/.mount_OpptrixABC'))
    assert.ok(roots.includes('/home/u/Opptrix-1.2.6.AppImage'))
    assert.ok(roots.includes('/tmp/.mount_OpptrixABC/usr/bin'))
  })

  it('pathMatchesLinuxRoot matches mount children and AppImage basename', () => {
    assert.equal(
      pathMatchesLinuxRoot('/tmp/.mount_X/chrome-linux/chrome', '/tmp/.mount_X'),
      true,
    )
    assert.equal(pathMatchesLinuxRoot('/home/u/Opptrix.AppImage', '/home/u/Opptrix.AppImage'), true)
    assert.equal(
      pathMatchesLinuxRoot('/home/u/Opptrix.AppImage --background', '/home/u/Opptrix.AppImage'),
      true,
    )
    assert.equal(pathMatchesLinuxRoot('Opptrix.AppImage --schedule-tick', '/opt/Opptrix.AppImage'), true)
    assert.equal(pathMatchesLinuxRoot('/usr/bin/bash', '/tmp/.mount_X'), false)
  })

  it('parsePsPidsMatchingRoot excludes self even when cmdline matches bundle', () => {
    const root = '/Applications/Opptrix.app'
    const self = 100
    const ps = [
      `  ${self} ${root}/Contents/MacOS/Opptrix`,
      `  200 ${root}/Contents/Frameworks/Opptrix Helper.app/Contents/MacOS/Opptrix Helper`,
      `  300 /usr/bin/unrelated`,
      `  201 ${root}/Contents/MacOS/Opptrix Helper (GPU)`,
    ].join('\n')
    assert.deepEqual(parsePsPidsMatchingRoot(ps, root, self), [200, 201])
  })
})
