const USER_AGREEMENT_URL = 'https://www.opptrix.org/user-agreement'
const USER_AGENT = 'Opptrix-LegalProxy/1.0'

function stripUnsafeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

export async function fetchUserAgreementHtml(): Promise<{ html: string; sourceUrl: string }> {
  const resp = await fetch(USER_AGREEMENT_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': USER_AGENT,
    },
    redirect: 'follow',
  })
  if (!resp.ok) {
    throw new Error(`协议页面加载失败（${resp.status}）`)
  }
  const html = stripUnsafeHtml(await resp.text())
  return { html, sourceUrl: resp.url || USER_AGREEMENT_URL }
}
