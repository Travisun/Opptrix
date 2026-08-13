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
  applyBundledCaCertEnv,
  bundledCaCertAllowReadPaths,
} from '../packages/agent-workspace/dist/index.js'

test('resolveBundledCaCertPath finds cacert.pem', () => {
  const certPath = resolveBundledCaCertPath()
  assert.ok(certPath, 'bundled cacert.pem must resolve')
  assert.ok(fs.existsSync(certPath), `cert file must exist: ${certPath}`)
  assert.equal(path.basename(certPath), 'cacert.pem')
})

test('applyBundledCaCertEnv sets SSL/REQUESTS/CURL/NODE CA env keys', () => {
  const env = {}
  const certPath = applyBundledCaCertEnv(env)
  assert.ok(certPath)
  assert.equal(env.SSL_CERT_FILE, certPath)
  assert.equal(env.REQUESTS_CA_BUNDLE, certPath)
  assert.equal(env.CURL_CA_BUNDLE, certPath)
  assert.equal(env.NODE_EXTRA_CA_CERTS, certPath)
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
  } finally {
    if (prev == null) delete process.env.OPPTRIX_SSL_CERT_FILE
    else process.env.OPPTRIX_SSL_CERT_FILE = prev
  }
})
