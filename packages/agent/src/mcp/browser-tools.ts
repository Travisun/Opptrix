import {
  createBrowserSessionManager,
  registerBrowserShutdownHooks,
  type WaitUntil,
} from '@opptrix/agent-browser'
import { TOOL_META } from '../tool-meta.js'

type JsonSchema = {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    items?: unknown
    default?: unknown
  }>
  required?: string[]
}

export interface BrowserToolDef {
  name: string
  description: string
  category: string
  parameters: JsonSchema
  handler: (args: Record<string, unknown>) => Promise<unknown>
  meta?: (typeof TOOL_META)[string]
}

const manager = createBrowserSessionManager()
registerBrowserShutdownHooks(manager)

const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
  ({ type: 'object', properties, required })

function toolError(err: unknown): { error: string } {
  const message = err instanceof Error ? err.message : String(err)
  return { error: message }
}

function parseWaitUntil(value: unknown): WaitUntil | undefined {
  if (value == null || value === '') return undefined
  const s = String(value)
  if (s === 'load' || s === 'domcontentloaded' || s === 'networkidle' || s === 'commit') {
    return s
  }
  return undefined
}

export function buildBrowserTools(): BrowserToolDef[] {
  const tools: BrowserToolDef[] = [
    {
      name: 'browser_navigate',
      category: '网页浏览',
      description: 'Open an external http(s) page in the agent browser session.',
      parameters: S({
        url: { type: 'string', description: 'Target URL (http or https only)' },
        wait_until: {
          type: 'string',
          description: 'Navigation wait: load | domcontentloaded | networkidle | commit',
        },
      }, ['url']),
      handler: async (args) => {
        try {
          const url = String(args.url ?? '')
          const waitUntil = parseWaitUntil(args.wait_until)
          return await manager.withSession(session =>
            session.navigate(url, waitUntil),
          )
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'browser_snapshot',
      category: '网页浏览',
      description: 'Capture an accessibility snapshot of the current page with [ref=eN] element refs.',
      parameters: S({
        max_chars: {
          type: 'number',
          description: 'Max snapshot characters (default 8000)',
        },
      }),
      handler: async (args) => {
        try {
          const maxChars = typeof args.max_chars === 'number' ? args.max_chars : 8000
          return await manager.withSession(session => session.snapshot(maxChars))
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'browser_click',
      category: '网页浏览',
      description: 'Click an element by ref from the latest browser_snapshot.',
      parameters: S({
        ref: { type: 'string', description: 'Element ref, e.g. e12 or [ref=e12]' },
      }, ['ref']),
      handler: async (args) => {
        try {
          const ref = String(args.ref ?? '')
          return await manager.withSession(session => session.click(ref))
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'browser_type',
      category: '网页浏览',
      description: 'Type text into an input by ref from the latest browser_snapshot.',
      parameters: S({
        ref: { type: 'string', description: 'Element ref, e.g. e12' },
        text: { type: 'string', description: 'Text to enter' },
        submit: { type: 'boolean', description: 'Press Enter after typing' },
        clear: { type: 'boolean', description: 'Clear field before typing' },
      }, ['ref', 'text']),
      handler: async (args) => {
        try {
          const ref = String(args.ref ?? '')
          const text = String(args.text ?? '')
          const submit = args.submit === true
          const clear = args.clear === true
          return await manager.withSession(session =>
            session.type(ref, text, { submit, clear }),
          )
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'browser_screenshot',
      category: '网页浏览',
      description: 'Save a PNG screenshot of the current page; returns a local file path (not inline image).',
      parameters: S({
        full_page: { type: 'boolean', description: 'Capture full scrollable page' },
      }),
      handler: async (args) => {
        try {
          const fullPage = args.full_page === true
          return await manager.withSession(session => session.screenshot(fullPage))
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'browser_close',
      category: '网页浏览',
      description: 'Close the agent browser session and release resources.',
      parameters: S({}),
      handler: async () => {
        try {
          await manager.closeAll()
          return { closed: true }
        } catch (err) {
          return toolError(err)
        }
      },
    },
  ]

  return tools.map(t => ({ ...t, meta: TOOL_META[t.name] }))
}
