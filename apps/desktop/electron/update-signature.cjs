/**
 * Opptrix custom update signature verification.
 *
 * Windows: Authenticode must be present; leaf must chain to the embedded Opptrix
 * Update Root CA (system trust / Status===Valid is NOT required — self-issued OK).
 *
 * Linux: downloaded artifact may ship a sibling `<file>.opptrix-cms` (OpenSSL CMS
 * detached DER). When present, it must verify against the embedded CA/leaf.
 * When absent (legacy builds), verification is skipped with a warning.
 *
 * macOS: Apple Developer ID + notarization remain the trust root; no custom path.
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { X509Certificate } = require('node:crypto')
const { net } = require('electron')

const execFileAsync = promisify(execFile)

const CERTS_DIR = path.join(__dirname, 'certs')

function loadTrust() {
  const meta = JSON.parse(
    fs.readFileSync(path.join(CERTS_DIR, 'opptrix-update-trust.json'), 'utf8'),
  )
  const rootPem = fs.readFileSync(path.join(CERTS_DIR, meta.rootCaFile), 'utf8')
  const leafPem = fs.readFileSync(path.join(CERTS_DIR, meta.codeSigningCertFile), 'utf8')
  return {
    meta,
    root: new X509Certificate(rootPem),
    leaf: new X509Certificate(leafPem),
    rootPem,
    leafPem,
  }
}

function assertTrustedLeaf(leafCert, trust) {
  const cn = leafCert.subject.includes(`CN=${trust.meta.publisherCommonName}`)
    || leafCert.subject.includes(`CN = ${trust.meta.publisherCommonName}`)
  if (!cn) {
    return `signer CN mismatch: ${leafCert.subject} (want CN=${trust.meta.publisherCommonName})`
  }

  const expectedFp = trust.meta.codeSigningFingerprintSha256?.toLowerCase()
  if (expectedFp) {
    const got = leafCert.fingerprint256.replace(/:/g, '').toLowerCase()
    if (got !== expectedFp) {
      console.warn(
        `[update-signature] leaf fingerprint changed: ${got} (pinned ${expectedFp}); checking CA chain`,
      )
    }
  }

  // Direct issuance by embedded root (our generator uses a one-level hierarchy).
  const ok = leafCert.verify(trust.root.publicKey)
  if (!ok) {
    return 'signer certificate is not issued by the embedded Opptrix Update Root CA'
  }

  const now = new Date()
  if (now < new Date(leafCert.validFrom) || now > new Date(leafCert.validTo)) {
    return `signer certificate not currently valid (${leafCert.validFrom} … ${leafCert.validTo})`
  }
  return null
}

function parseAuthenticodeJson(stdout) {
  const data = JSON.parse(stdout)
  delete data.PrivateKey
  delete data.IsOSBinary
  delete data.SignatureType
  if (data.SignerCertificate) {
    delete data.SignerCertificate.Archived
    delete data.SignerCertificate.Extensions
    delete data.SignerCertificate.Handle
    delete data.SignerCertificate.HasPrivateKey
    delete data.SignerCertificate.SubjectName
  }
  return data
}

async function readWindowsAuthenticode(filePath) {
  const escaped = filePath.replace(/'/g, "''")
  const ps = `Get-AuthenticodeSignature -LiteralPath '${escaped}' | ConvertTo-Json -Compress`
  const { stdout, stderr } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command', ps],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  )
  if (stderr?.trim()) {
    console.warn('[update-signature] powershell stderr:', stderr.trim())
  }
  return parseAuthenticodeJson(stdout)
}

/**
 * electron-updater hook: (publisherNames, filePath) => Promise<string|null>
 * null = OK; string = error message.
 */
async function verifyWindowsUpdateCodeSignature(_publisherNames, filePath) {
  const trust = loadTrust()
  let info
  try {
    info = await readWindowsAuthenticode(filePath)
  } catch (err) {
    return `cannot read Authenticode signature: ${err instanceof Error ? err.message : String(err)}`
  }

  // Status 2 = NotSigned
  if (!info?.SignerCertificate || info.Status === 2) {
    return (
      'update package is not Authenticode-signed. '
      + 'Opptrix requires packages signed by the Opptrix update certificate '
      + '(embedded root CA).'
    )
  }

  const raw = info.SignerCertificate.RawData
  if (!raw) {
    return 'Authenticode SignerCertificate.RawData missing'
  }

  let leafCert
  try {
    leafCert = new X509Certificate(Buffer.from(raw, 'base64'))
  } catch (err) {
    return `invalid SignerCertificate: ${err instanceof Error ? err.message : String(err)}`
  }

  return assertTrustedLeaf(leafCert, trust)
}

async function fetchSiblingCms(artifactPath) {
  const sibling = `${artifactPath}.opptrix-cms`
  if (fs.existsSync(sibling)) {
    return fs.readFileSync(sibling)
  }
  return null
}

/**
 * Verify OpenSSL CMS detached signature (DER) against embedded leaf+root.
 * Uses `openssl cms -verify -CAfile root -certfile leaf`.
 */
async function verifyCmsDetached(artifactPath, cmsDer) {
  const trust = loadTrust()
  const tmpCms = `${artifactPath}.opptrix-cms.verify`
  fs.writeFileSync(tmpCms, cmsDer)
  try {
    await execFileAsync(
      'openssl',
      [
        'cms', '-verify',
        '-binary',
        '-in', tmpCms,
        '-inform', 'DER',
        '-content', artifactPath,
        '-CAfile', path.join(CERTS_DIR, trust.meta.rootCaFile),
        '-certfile', path.join(CERTS_DIR, trust.meta.codeSigningCertFile),
        '-purpose', 'any',
        '-out', process.platform === 'win32' ? 'NUL' : '/dev/null',
      ],
      { maxBuffer: 2 * 1024 * 1024 },
    )
    return null
  } catch (err) {
    const detail = err instanceof Error ? (err.stderr?.toString?.() || err.message) : String(err)
    return `CMS signature verification failed: ${detail}`
  } finally {
    try { fs.unlinkSync(tmpCms) } catch { /* ignore */ }
  }
}

/**
 * Linux (and optional generic) post-download check.
 * If `<artifact>.opptrix-cms` exists next to the download, verify it.
 * Missing CMS on Linux = warn + allow (sha512 already checked by electron-updater),
 * until release pipeline always uploads signatures.
 */
async function verifyLinuxUpdateArtifact(artifactPath) {
  if (!artifactPath || !fs.existsSync(artifactPath)) {
    return 'linux update artifact missing'
  }
  const cms = await fetchSiblingCms(artifactPath)
  if (!cms) {
    console.warn(
      `[update-signature] no ${path.basename(artifactPath)}.opptrix-cms — `
        + 'skipping CMS check (sha512 still enforced by electron-updater)',
    )
    return null
  }
  return verifyCmsDetached(artifactPath, cms)
}

/**
 * Attempt to download `<url>.opptrix-cms` beside an update URL and write next to local file.
 */
async function tryDownloadCmsBeside(artifactPath, fileUrl) {
  if (!fileUrl) return
  const cmsUrl = `${String(fileUrl).replace(/\?.*$/, '')}.opptrix-cms`
  const dest = `${artifactPath}.opptrix-cms`
  try {
    const body = await new Promise((resolve, reject) => {
      const request = net.request(cmsUrl)
      const chunks = []
      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }
        response.on('data', (c) => chunks.push(c))
        response.on('end', () => resolve(Buffer.concat(chunks)))
        response.on('error', reject)
      })
      request.on('error', reject)
      request.end()
    })
    fs.writeFileSync(dest, body)
  } catch (err) {
    console.warn(
      `[update-signature] optional CMS download failed (${cmsUrl}):`,
      err instanceof Error ? err.message : err,
    )
  }
}

function installCustomUpdateSignatureVerification(autoUpdater) {
  if (!autoUpdater) return

  if (process.platform === 'win32' && typeof autoUpdater.verifyUpdateCodeSignature !== 'undefined') {
    autoUpdater.verifyUpdateCodeSignature = verifyWindowsUpdateCodeSignature
    console.info('[update-signature] Windows: using embedded Opptrix Update Root CA verifier')
  }
}

module.exports = {
  loadTrust,
  verifyWindowsUpdateCodeSignature,
  verifyLinuxUpdateArtifact,
  tryDownloadCmsBeside,
  installCustomUpdateSignatureVerification,
  CERTS_DIR,
}
