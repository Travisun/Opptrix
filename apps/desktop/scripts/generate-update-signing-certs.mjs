#!/usr/bin/env node
/**
 * Generate Opptrix update-signing CA + Authenticode leaf (self-issued).
 *
 * Public outputs (committed):
 *   electron/certs/opptrix-update-root.pem
 *   electron/certs/opptrix-code-signing.crt
 *   electron/certs/opptrix-update-trust.json
 *
 * Private outputs (gitignored .secrets/ — upload p12.b64 to GitHub Secrets):
 *   .secrets/opptrix-code-signing.p12
 *   .secrets/opptrix-code-signing.p12.b64
 *
 * CI secrets:
 *   OPPTRIX_CODE_SIGNING_P12          = contents of .p12.b64 (or raw base64 of p12)
 *   OPPTRIX_CODE_SIGNING_P12_PASSWORD = export password
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const CERTS = path.join(DESKTOP_ROOT, 'electron/certs')
const SECRETS = path.join(DESKTOP_ROOT, '.secrets')

const PASS =
  process.env.OPPTRIX_CODE_SIGNING_P12_PASSWORD?.trim()
  || `Opptrix-${randomBytes(9).toString('base64url')}`

fs.mkdirSync(CERTS, { recursive: true })
fs.mkdirSync(SECRETS, { recursive: true })

const caCnf = path.join(SECRETS, 'ca.cnf')
const leafCnf = path.join(SECRETS, 'leaf.cnf')
fs.writeFileSync(caCnf, `[req]
distinguished_name = req_dn
x509_extensions = v3_ca
prompt = no
[req_dn]
CN = Opptrix Update Root CA
O = Opptrix
C = CN
[v3_ca]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
`)
fs.writeFileSync(leafCnf, `[req]
distinguished_name = req_dn
prompt = no
[req_dn]
CN = Opptrix
O = Opptrix
C = CN
[v3_code]
basicConstraints = CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
`)

function openssl(args) {
  execFileSync('openssl', args, { stdio: 'inherit' })
}

const rootKey = path.join(SECRETS, 'opptrix-update-root.key')
const rootPem = path.join(CERTS, 'opptrix-update-root.pem')
const leafKey = path.join(SECRETS, 'opptrix-code-signing.key')
const leafCrt = path.join(CERTS, 'opptrix-code-signing.crt')
const leafCsr = path.join(SECRETS, 'opptrix-leaf.csr')
const p12 = path.join(SECRETS, 'opptrix-code-signing.p12')
const p12b64 = path.join(SECRETS, 'opptrix-code-signing.p12.b64')

openssl(['genrsa', '-out', rootKey, '4096'])
openssl(['req', '-new', '-x509', '-days', '3650', '-key', rootKey, '-out', rootPem, '-config', caCnf])
openssl(['genrsa', '-out', leafKey, '3072'])
openssl(['req', '-new', '-key', leafKey, '-out', leafCsr, '-config', leafCnf])
openssl([
  'x509', '-req', '-in', leafCsr,
  '-CA', rootPem, '-CAkey', rootKey, '-CAcreateserial',
  '-out', leafCrt, '-days', '825',
  '-extfile', leafCnf, '-extensions', 'v3_code',
])
openssl([
  'pkcs12', '-export',
  '-inkey', leafKey, '-in', leafCrt, '-certfile', rootPem,
  '-out', p12, '-name', 'Opptrix', '-passout', `pass:${PASS}`,
])

fs.writeFileSync(p12b64, fs.readFileSync(p12).toString('base64'))

function fingerprint(certPath) {
  const out = execFileSync(
    'openssl',
    ['x509', '-in', certPath, '-noout', '-fingerprint', '-sha256'],
    { encoding: 'utf8' },
  )
  return out.replace(/^.*?=/, '').trim().replace(/:/g, '').toLowerCase()
}

fs.writeFileSync(
  path.join(CERTS, 'opptrix-update-trust.json'),
  `${JSON.stringify(
    {
      publisherCommonName: 'Opptrix',
      codeSigningCertFile: 'opptrix-code-signing.crt',
      rootCaFile: 'opptrix-update-root.pem',
      codeSigningFingerprintSha256: fingerprint(leafCrt),
      rootFingerprintSha256: fingerprint(rootPem),
      note: 'Self-issued Opptrix update trust. Upload .secrets/opptrix-code-signing.p12.b64 to OPPTRIX_CODE_SIGNING_P12.',
    },
    null,
    2,
  )}\n`,
)

console.log(`
Generated:
  public:  ${CERTS}
  private: ${SECRETS} (gitignored)

Upload to GitHub:
  gh secret set OPPTRIX_CODE_SIGNING_P12 < ${p12b64}
  gh secret set OPPTRIX_CODE_SIGNING_P12_PASSWORD --body '${PASS}'

Also usable as WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD.
`)
