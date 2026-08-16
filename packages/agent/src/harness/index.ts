export {
  WEAKNESS_LABELS,
  maxWeaknessConfidence,
  type WeaknessCode,
  type WeaknessConfidence,
  type WeaknessEvidence,
  type WeaknessBucket,
} from './weakness-taxonomy.js'

export {
  buildWeaknessReport,
  formatWeaknessReportMarkdown,
  sanitizeWeaknessSnippet,
  type BuildWeaknessReportInput,
  type WeaknessReport,
  type WeaknessReportTurn,
} from './weakness-report.js'

export type {
  ExamSplit,
  ExamCategory,
  ExamRunTrace,
  ExamExpectation,
  HarnessExam,
  ExamJudgeResult,
} from './exam-types.js'

export { judgeExamRun, judgeExamSuite } from './exam-judge.js'

export {
  HARNESS_EXAMS,
  listHarnessExams,
  getHarnessExam,
} from './exams/fixtures.js'

export {
  HARNESS_PATCH_KINDS,
  isHarnessPatchKind,
  assertProposalSafe,
  proposeFromWeaknessBuckets,
  buildUnsafeRecommendationProposal,
  PROPOSAL_UNSAFE_PATTERNS,
  type HarnessPatchKind,
  type HarnessPatch,
  type HarnessProposal,
  type SkillBodyAppendPatch,
  type SkillBodyReplaceSpanPatch,
  type RouteHintAppendPatch,
} from './proposal.js'

export {
  validateProposalAgainstHeldOut,
  type ValidateProposalResult,
} from './validate-proposal.js'

export {
  HARNESS_STORE_NAMESPACE,
  HARNESS_STORE_DOC_ID,
  HARNESS_ACTIVE_DOC_ID,
  HARNESS_FORMAT_VERSION,
  HARNESS_WILDCARD_BUCKET,
  AUDIT_LOG_MAX,
  migrateHarnessStore,
  loadHarnessStore,
  saveHarnessStore,
  listHarnessVersions,
  getActiveHarnessVersion,
  getActiveHarnessVersionForModel,
  resolveActiveHarnessVersionId,
  normalizeHarnessModelRef,
  classifyVersionTier,
  promoteHarnessProposal,
  rollbackHarnessForModel,
  rollbackHarnessToDefault,
  clearHarnessOverlayCache,
  proposalToExportMarkdown,
  isHarnessAutoPromoteEnabled,
  isHarnessAutoPromoteEnvForcedOff,
  getHarnessAutoPromotePref,
  getHarnessAutoPromoteEffectiveState,
  setHarnessAutoPromote,
  appendHarnessAudit,
  type HarnessStoreDocument,
  type HarnessVersionRecord,
  type SkippedPatchRecord,
  type HarnessActivePointer,
  type HarnessAuditAction,
  type HarnessAuditEntry,
  type HarnessPatchTier,
  type HarnessAutoPromotePref,
} from './local-store.js'

export {
  applyHarnessSkillOverlay,
  type ApplyOverlayResult,
} from './apply-overlay.js'

export {
  buildHarnessRouteHintAppendix,
  appendHarnessRouteHintToPlaybook,
} from './route-hint.js'

export {
  getHarnessModelRef,
  runWithHarnessModelRef,
} from './model-context.js'

export {
  runHarnessLab,
  type RunHarnessLabInput,
  type RunHarnessLabResult,
} from './lab.js'

export {
  scheduleHarnessEvolveAfterTurn,
  evolveHarnessFromSessionSyncForTests,
  resetHarnessSessionEvolveForTests,
  HARNESS_EVOLVE_SESSION_COOLDOWN_MS,
  type ScheduleHarnessEvolveOpts,
  type EvolveHarnessResult,
  type EvolveHarnessSkipResult,
} from './session-evolve.js'

export {
  ensureHarnessOverlayRegistered,
  resetHarnessOverlayRegistrationForTests,
} from './register-overlay.js'
