import { testSinaConnection } from './sina.js'

export async function testWebfeedConnection(): Promise<{ ok: boolean; message: string }> {
  return testSinaConnection()
}
