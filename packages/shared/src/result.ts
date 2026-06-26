import type { ResearchResult } from './types.js'

export function elapsedSince(t0: number): number {
  return Math.round((Date.now() - t0) / 10) / 100
}

export function ok<T>(data: T, message = '', t0 = Date.now()): ResearchResult<T> {
  return { success: true, data, message, elapsed: elapsedSince(t0) }
}

export function fail<T = never>(message: string, t0 = Date.now()): ResearchResult<T> {
  return { success: false, message, elapsed: elapsedSince(t0) }
}
