/** Yield the Node event loop so HTTP / IPC handlers can run between heavy sync batches. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}
