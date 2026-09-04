/**
 * Controlled Extension Host worker entry (Wave 13A).
 * Message loop only — must not import hub / agent / research packages.
 */
import { parentPort } from 'node:worker_threads'
import { attachHostWorkerLoop } from './host-worker-rpc.js'

if (!parentPort) {
  throw new Error('host-worker-entry must run inside worker_threads')
}

attachHostWorkerLoop(parentPort)
