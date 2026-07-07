import { testSinaConnection } from './sina.js'

export async function testSinafinanceConnection(): Promise<{ ok: boolean; message: string }> {
  return testSinaConnection()
}
