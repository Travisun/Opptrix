/**
 * Bundled Mozilla CA for agent sandbox HTTPS (pip/npm).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  resolveBundledCaCertPath,
  materializeBundledCaCert,
  applyBundledCaCertEnv,
  bundledCaCertAllowReadPaths,
  injectPipCertArgv,
} from '../packages/agent-workspace/dist/index.js'

test('resolveBundledCaCertPath finds cacert.pem', () => {
  const certPath = resolveBundledCaCertPath()
  assert.ok(certPath, 'bundled cacert.pem must resolve')
  assert.ok(fs.existsSync(certPath), `cert file must exist: ${certPath}`)
  assert.equal(path.basename(certPath), 'cacert.pem')
})

test('applyBundledCaCertEnv sets SSL/REQUESTS/CURL/NODE/PIP CA env keys', () => {
  const env = {}
  const certPath = applyBundledCaCertEnv(env)
  assert.ok(certPath)
  assert.equal(env.SSL_CERT_FILE, certPath)
  assert.equal(env.REQUESTS_CA_BUNDLE, certPath)
  assert.equal(env.CURL_CA_BUNDLE, certPath)
  assert.equal(env.NODE_EXTRA_CA_CERTS, certPath)
  assert.equal(env.PIP_CERT, certPath)
  assert.equal(env.CERT_PATH, certPath)
})

test('applyBundledCaCertEnv uses explicit certPath when provided', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-cacert-explicit-'))
  try {
    const fake = path.join(tmp, 'cacert.pem')
    fs.writeFileSync(fake, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n')
    const env = {}
    const applied = applyBundledCaCertEnv(env, fake)
    assert.equal(applied, path.resolve(fake))
    assert.equal(env.PIP_CERT, path.resolve(fake))
    assert.equal(env.SSL_CERT_FILE, path.resolve(fake))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('materializeBundledCaCert writes to grant .opptrix/cacert.pem', () => {
  const grantRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-grant-cacert-'))
  try {
    const dest = materializeBundledCaCert(grantRoot)
    assert.ok(dest)
    assert.equal(dest, path.join(grantRoot, '.opptrix', 'cacert.pem'))
    assert.ok(fs.existsSync(dest))
    const body = fs.readFileSync(dest, 'utf8')
    assert.ok(body.includes('BEGIN CERTIFICATE'))

    // second call is idempotent (same size/mtime → no error)
    const again = materializeBundledCaCert(grantRoot)
    assert.equal(again, dest)

    const env = {}
    const applied = applyBundledCaCertEnv(env, dest)
    assert.equal(applied, dest)
    assert.equal(env.PIP_CERT, dest)
  } finally {
    fs.rmSync(grantRoot, { recursive: true, force: true })
  }
})

test('injectPipCertArgv injects --cert after install; idempotent', () => {
  const cert = '/tmp/grant/.opptrix/cacert.pem'
  const pip = injectPipCertArgv(['pip3', 'install', 'requests'], cert)
  assert.deepEqual(pip, ['pip3', 'install', '--cert', cert, 'requests'])

  const py = injectPipCertArgv(
    ['python3', '-m', 'pip', 'install', '--target', '.opptrix-packages', 'numpy'],
    cert,
  )
  assert.deepEqual(py, [
    'python3', '-m', 'pip', 'install', '--cert', cert,
    '--target', '.opptrix-packages', 'numpy',
  ])

  const already = injectPipCertArgv(pip, cert)
  assert.deepEqual(already, pip)

  const alreadyEq = injectPipCertArgv(
    ['pip', 'install', `--cert=${cert}`, 'x'],
    cert,
  )
  assert.deepEqual(alreadyEq, ['pip', 'install', `--cert=${cert}`, 'x'])

  const nonPip = injectPipCertArgv(['npm', 'install', 'lodash'], cert)
  assert.deepEqual(nonPip, ['npm', 'install', 'lodash'])
})

test('cacert.pem is readable and contains BEGIN CERTIFICATE', () => {
  const certPath = resolveBundledCaCertPath()
  assert.ok(certPath)
  const body = fs.readFileSync(certPath, 'utf8')
  assert.ok(body.includes('BEGIN CERTIFICATE'))
  assert.ok(body.length > 10_000)
})

test('bundledCaCertAllowReadPaths includes cert dir', () => {
  const certPath = resolveBundledCaCertPath()
  assert.ok(certPath)
  const paths = bundledCaCertAllowReadPaths()
  assert.ok(paths.length >= 1)
  const dir = path.dirname(certPath)
  assert.ok(
    paths.some(p => path.resolve(p) === path.resolve(dir))
      || paths.some(p => path.resolve(p) === path.resolve(certPath)),
    `allowRead should include cert dir or file; got ${JSON.stringify(paths)}`,
  )
})

test('invalid OPPTRIX_SSL_CERT_FILE is ignored; apply still uses bundled cert', () => {
  const prev = process.env.OPPTRIX_SSL_CERT_FILE
  process.env.OPPTRIX_SSL_CERT_FILE = path.join(os.tmpdir(), 'opptrix-missing-cacert-does-not-exist.pem')
  try {
    const certPath = resolveBundledCaCertPath()
    assert.ok(certPath, 'must fall back to bundled cacert when env path is invalid')
    assert.notEqual(certPath, process.env.OPPTRIX_SSL_CERT_FILE)
    const env = {}
    const applied = applyBundledCaCertEnv(env)
    assert.equal(applied, certPath)
    assert.equal(env.SSL_CERT_FILE, certPath)
    assert.equal(env.PIP_CERT, certPath)
  } finally {
    if (prev == null) delete process.env.OPPTRIX_SSL_CERT_FILE
    else process.env.OPPTRIX_SSL_CERT_FILE = prev
  }
})
