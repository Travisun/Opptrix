export {
  SERIAL_TOOL_NAMES,
  isSerialTool,
  partitionToolCallsForExecution,
  type ToolCallLike,
  type ToolExecutionBatch,
} from './tool-parallel.js'

export {
  isAgentCursorSmoothEnabled,
  resolveMaxSafetyRounds,
  resolveSoftRemindRound,
  resolveSafetyStopReply,
  isLastSafetyRound,
  isDoomLoopEnabled,
  SOFT_REMIND_TURN_TAIL,
  LAST_STEP_TURN_TAIL,
  DOOM_LOOP_ENABLED_DEFAULT,
  DOOM_LOOP_REPEAT_THRESHOLD,
  SAFETY_STOP_REPLY_SMOOTH,
  SAFETY_STOP_REPLY_LEGACY,
} from './budget.js'

export {
  truncateToolOutputForModel,
  pruneToolOutputDir,
  resolveToolOutputDir,
  resolveToolOutputSpillRoot,
  TOOL_OUTPUT_MAX_LINES,
  TOOL_OUTPUT_MAX_BYTES,
  TOOL_OUTPUT_RETENTION_DAYS,
  TOOL_OUTPUT_ROOT_ID,
  type TruncateToolOutputResult,
} from './tool-output-truncate.js'

export {
  noteDoomLoopFingerprint,
  clearDoomLoopSession,
  resetDoomLoopForTests,
  DOOM_LOOP_TURN_TAIL,
  type DoomLoopHit,
} from './doom-loop.js'

export {
  fingerprintToolCall,
  checkSpinGuard,
  recordSpinOutcome,
  noteRoundProgress,
  beginSpinRound,
  roundHadNewFingerprint,
  buildSpinGuardTurnTail,
  clearSpinGuardSession,
  resetSpinGuardForTests,
  SPIN_POLL_TOOLS,
  SPIN_WAKE_SUCCESS_PROGRESS_TOOLS,
  isSpinPollTool,
  isSpinWakeSuccessProgressTool,
  isInProgressJobStatus,
  SPIN_GUARD_LIMITS,
  type SpinGuardBlock,
} from './spin-guard.js'

export {
  getResearchChecklist,
  hasPendingChecklistItems,
  isChecklistAllDone,
  getChecklistProgressEpoch,
  updateResearchChecklist,
  seedChecklistOnSkillActivate,
  buildChecklistTurnTail,
  clearResearchChecklistSession,
  resetResearchChecklistForTests,
  type ResearchChecklistItem,
  type ResearchChecklistStatus,
} from './research-checklist.js'

export {
  SteerBridge,
  formatSteerUserMessage,
} from './steer-bridge.js'

export {
  resolveEffectiveResearchTier,
  shouldEnterVerifyPhase,
  isBusinessToolName,
  resolveGatherToolChoice,
  resolveVerifyToolChoice,
  VERIFY_TURN_TAIL,
  type LoopPhase,
} from './verify-phase.js'
