import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('domain-pack-for-token', () => {
  it('maps prefixes and tool packs to research|coding|null', async () => {
    const { domainPackForToken } = await import(platformModUrl)

    assert.equal(domainPackForToken('data.quote'), 'research')
    assert.equal(domainPackForToken('code.write'), 'coding')
    assert.equal(domainPackForToken('hands.run'), 'coding')

    assert.equal(domainPackForToken('get_instrument_chart'), 'research')
    assert.equal(domainPackForToken('browser_navigate'), 'coding')
    assert.equal(domainPackForToken('workspace_read'), 'coding')

    assert.equal(domainPackForToken('search_instruments'), null)
    assert.equal(domainPackForToken('list_tool_packs'), null)
    assert.equal(domainPackForToken('create_canvas'), null)
    assert.equal(domainPackForToken('list_scheduled_jobs'), null)
    assert.equal(domainPackForToken('totally_unknown_token'), null)
  })
})
