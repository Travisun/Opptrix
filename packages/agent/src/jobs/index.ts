export {
  JOB_WATCH_MAX_PER_SESSION,
  JOB_RESUME_PROMPT_MAX_CHARS,
  JOB_BUSY_DEFER_SECONDS,
  JOB_PROGRESS_THROTTLE_MS,
  JOB_ADAPTER_POLL_MS,
  JOB_SNAPSHOT_TTL_MS,
  JOB_IN_FLIGHT_STATES,
  JOB_TERMINAL_STATES,
  isJobWatchEnabled,
  type BackgroundJobKind,
  type BackgroundJobState,
} from './constants.js'

export type {
  BackgroundJobProgress,
  BackgroundJobSnapshot,
  JobRegistryEvent,
  JobRegistryListener,
  JobRegistry,
  JobWatchSource,
  JobWatch,
  AttachWatchResult,
  WatchRegistry,
  ResumeCause,
  ResumeRequest,
  SessionResumeHandler,
  SessionResumeBus,
  AsyncJobToolResult,
  JobWatchProgressEmitter,
} from './types.js'

export { jobRegistry, getJobRegistry } from './registry.js'
export {
  sessionResumeBus,
  getSessionResumeBus,
  formatJobResumeMessage,
} from './resume-bus.js'
export {
  watchRegistry,
  getWatchRegistry,
  listPendingJobWatches,
} from './watch-registry.js'
export {
  maybeAutoWatchFromToolResult,
  isAutoWatchEligible,
} from './auto-watch.js'
export {
  buildDefaultResumePrompt,
  resolveJobKindFromTool,
  resolveJobKindFromJobId,
  userFacingJobLabel,
} from './prompt-templates.js'
export {
  registerDefaultJobAdapters,
  unregisterJobAdaptersForTests,
  pythonInstallAdapter,
  fuyaoDumpAdapter,
  shellCommandAdapter,
  type JobAdapter,
} from './adapters/index.js'

import { jobRegistry } from './registry.js'
import { sessionResumeBus } from './resume-bus.js'
import { watchRegistry } from './watch-registry.js'
import { unregisterJobAdaptersForTests } from './adapters/index.js'

/** 清会话 watches + resume defer（不清全局 Job；timer 由 clearSessionTurnWakes 负责） */
export function clearSessionJobWaitsAndWatches(sessionId: string): {
  waits: number
  watches: number
  resumes: number
} {
  return {
    waits: 0,
    watches: watchRegistry.clearSession(sessionId),
    resumes: sessionResumeBus.clearSession(sessionId),
  }
}

/** 测试重置 jobs 子系统 */
export function resetJobsSubsystemForTests(): void {
  unregisterJobAdaptersForTests()
  sessionResumeBus.resetForTests()
  jobRegistry.resetForTests()
  // watch 最后 reset：rebind 在 registry 清空 listeners 之后
  watchRegistry.resetForTests()
}
