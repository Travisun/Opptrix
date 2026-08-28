import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeIp,
  isIpLocal,
  ipMatchesCidr,
  resolveClientIp,
  isTrustedLocalAccess,
  evaluateAccessGate,
} from '@opptrix/shared'

describe('trusted-client IP helpers', () => {
  it('normalizes IPv4-mapped IPv6 loopback', () => {
    assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1')
    assert.equal(normalizeIp('[::1]'), '::1')
  })

  it('treats loopback as local and rejects public IPs', () => {
    assert.equal(isIpLocal('127.0.0.1'), true)
    assert.equal(isIpLocal('127.4.5.6'), true)
    assert.equal(isIpLocal('::1'), true)
    assert.equal(isIpLocal('::ffff:127.0.0.1'), true)
    assert.equal(isIpLocal('8.8.8.8'), false)
    assert.equal(isIpLocal('10.0.0.1'), false)
  })

  it('matches CIDR ranges', () => {
    assert.equal(ipMatchesCidr('10.1.2.3', '10.0.0.0/8'), true)
    assert.equal(ipMatchesCidr('11.0.0.1', '10.0.0.0/8'), false)
    assert.equal(ipMatchesCidr('127.0.0.1', '127.0.0.1'), true)
    assert.equal(ipMatchesCidr('::1', '::1/128'), true)
  })

  it('ignores forwarded headers when peer is not a trusted proxy', () => {
    const ip = resolveClientIp(
      {
        ip: '203.0.113.9',
        headers: { 'x-real-ip': '127.0.0.1', 'x-forwarded-for': '127.0.0.1' },
      },
      { trustedProxies: [] },
    )
    assert.equal(ip, '203.0.113.9')
    assert.equal(isTrustedLocalAccess(ip, '203.0.113.9', { trustedProxies: [] }), false)
  })

  it('prefers X-Real-IP when peer is a trusted proxy', () => {
    const ip = resolveClientIp(
      {
        ip: '10.0.0.2',
        headers: { 'x-real-ip': '127.0.0.1', 'x-forwarded-for': '8.8.8.8, 10.0.0.2' },
      },
      { trustedProxies: ['10.0.0.0/8'] },
    )
    assert.equal(ip, '127.0.0.1')
    assert.equal(
      isTrustedLocalAccess(ip, '10.0.0.2', { trustedProxies: ['10.0.0.0/8'] }),
      true,
    )
  })

  it('prefers CF-Connecting-IP over X-Real-IP when peer is trusted', () => {
    const ip = resolveClientIp(
      {
        ip: '10.0.0.2',
        headers: {
          'cf-connecting-ip': '198.51.100.20',
          'true-client-ip': '203.0.113.9',
          'x-real-ip': '127.0.0.1',
          'x-forwarded-for': '8.8.8.8',
        },
      },
      { trustedProxies: ['10.0.0.0/8'] },
    )
    assert.equal(ip, '198.51.100.20')
  })

  it('prefers True-Client-IP when CF header absent', () => {
    const ip = resolveClientIp(
      {
        ip: '10.0.0.2',
        headers: {
          'true-client-ip': '203.0.113.9',
          'x-real-ip': '127.0.0.1',
        },
      },
      { trustedProxies: ['10.0.0.0/8'] },
    )
    assert.equal(ip, '203.0.113.9')
  })

  it('falls back to leftmost X-Forwarded-For when X-Real-IP missing', () => {
    const ip = resolveClientIp(
      {
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': '198.51.100.4, 10.0.0.2' },
      },
      { trustedProxies: ['127.0.0.1'] },
    )
    assert.equal(ip, '198.51.100.4')
  })

  it('extra TRUSTED_LOCAL CIDRs expand local', () => {
    assert.equal(isIpLocal('10.1.2.3', ['10.0.0.0/8']), true)
    assert.equal(isIpLocal('10.1.2.3', []), false)
  })

  it('access gate matches Scheme A', () => {
    assert.equal(evaluateAccessGate(false, true), 'open')
    assert.equal(evaluateAccessGate(false, false), 'local_only_deny')
    assert.equal(evaluateAccessGate(true, false), 'auth_required')
  })
})
