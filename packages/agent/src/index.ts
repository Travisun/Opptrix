export { AgentEngine, ChatCancelledError, type AgentSettings, type ChatResult, type SessionContextUsage } from './engine.js'
export {
  appendReasoningTimeline,
  appendReasoningSegment,
  beginReasoningSegment,
  formatReasoningSegmentLabel,
  joinReasoningSegments,
  normalizeReasoningSegments,
  resolveReasoningSegments,
  updateLastReasoningSegmentContent,
  REASONING_TIMELINE_SEP,
  type ReasoningSegment,
} from './reasoning-timeline.js'
export {
  type ChatProgressEvent,
  type ChatProgressOptions,
  type ChatToolStep,
  type ChatToolStepStatus,
  type ChatUserPromptPayload,
  formatToolLabel,
} from './chat-progress.js'
export {
  type UserPromptAnswer,
  type UserPromptOption,
  type UserPromptPayload,
  type UserPromptMode,
  UserPromptBridge,
  UserPromptCancelledError,
  createUserPromptId,
  normalizeUserPromptOptions,
  parseAskUserArgs,
} from './user-prompt.js'
export {
  type AgentAppContext,
  type PublicAppSettings,
  createDefaultAppContext,
  getCurrentTime,
  getDataLayerPaths,
  getAgentSafeDataLayerSummary,
  buildAgentSafeProjectInfo,
  getSystemInfo,
  resolveProjectRoot,
} from './app-context.js'
export { DiscoverRunner, type DiscoverProgress, type DiscoverResult, type DiscoverPhase, type DiscoverFinalItem } from './discover.js'
export {
  DISCOVER_STRATEGIES,
  getDiscoverStrategy,
  listDiscoverStrategiesPublic,
  primaryDiscoverProfile,
  buildStrategyExecutionPrompt,
  strategyToPlan,
  type DiscoverStrategy,
  type DiscoverStrategyCategory,
  type DiscoverPlanMode,
} from './discover-strategies.js'
export { ToolRegistry, DISCOVER_MINING_TOOL_NAMES } from './tools.js'
export {
  CHAT_MCP_TOOL_NAMES,
  UNIFIED_INSTRUMENT_TOOL_NAMES,
} from './unified-mcp-tools.js'
export {
  DATA_LAYER_MINING_TOOL_NAMES,
  TOOL_META,
  formatToolDescription,
  resolveToolPackId,
  mcpToolCatalog,
} from './tool-meta.js'
export { createMcpServer, runMcpStdio } from './mcp/server.js'
export { McpToolBroker } from './mcp/broker.js'
export {
  AggregatingToolBroker,
  getExternalMcpRegistry,
  resetExternalMcpRegistry,
  ExternalMcpRegistry,
  ExternalMcpHealth,
} from './mcp/external/index.js'
export {
  ToolPackSessionStore,
  resolveActivePackIds,
  toolNamesForPacks,
  listToolPacksPayload,
  unloadedToolHint,
} from './mcp/tool-pack-session.js'
export {
  resolveSeedPacks,
  ToolPackResolver,
  MAX_SEEDED_BUSINESS_PACKS,
} from './mcp/tool-pack-resolver.js'
export {
  resolveToolRoutePlan,
  buildRoundRoutePlaybook,
  orderToolsByPreference,
  resolveResearchTier,
  TOOL_CONFUSION_PAIRS,
  type ToolRoutePlan,
  type RouteConfidence,
} from './mcp/tool-route-plan.js'
export { SessionStore, setSessionPersistHooks, sessionToMeta, type SessionMeta, type SessionRecord, type DisplayMessage, type SessionContextRef, type SessionForkContextRef, type SessionSelectionContextRef, type SessionArticleContextRef, type CreateSessionOptions, type SessionLlmParams, type ReasoningEffort, DEFAULT_SESSION_TEMPERATURE, DEFAULT_SESSION_MAX_TOKENS } from './sessions.js'
export {
  getExpertCatalogService,
  ExpertCatalogService,
  resetExpertCatalogServiceForTests,
} from './experts/catalog-service.js'
export {
  StaticHttpExpertProvider,
  DEFAULT_EXPERT_CATALOG_BASE_URL,
  resetStaticHttpExpertProviderForTests,
} from './experts/static-http-provider.js'
export {
  LocalJsonExpertProvider,
  resetBuiltinExpertCacheForTests,
  type RemoteExpertProvider,
} from './experts/local-json-provider.js'
export {
  assembleSystemPrompt,
  buildLayer0Baseline,
  buildRolePersona,
  sanitizeExpertPersona,
  resolveInitialRolePersona,
  DEFAULT_RESEARCHER_PERSONA,
} from './experts/prompt-assembler.js'
export { SessionArchiveFolderStore, DEFAULT_SESSION_ARCHIVE_FOLDERS, type SessionArchiveFolder } from './archive-folders.js'
export { ProviderRegistry, type ProviderProfile, type AvailableModel } from './llm/providers.js'
export {
  resolveModelContextTokens,
  resolveContextBudget,
  DEFAULT_CONTEXT_TOKENS,
  SOFT_USAGE_RATIO,
  HARD_USAGE_RATIO,
} from './llm/model-context.js'
export {
  resolveModelContextTokensAsync,
  lookupModelsDevContextLimit,
  getModelsDevCatalog,
  resolveModelsDevProviderMeta,
  resetModelsDevCacheForTests,
  resolveModelMediaCapabilitiesAsync,
  lookupModelsDevMediaEntry,
  defaultTextOnlyMediaCapabilities,
  type ModelsDevCatalog,
  type ModelsDevProviderEntry,
  type ModelsDevProviderMeta,
} from './llm/models-dev-context.js'
export {
  saveAttachment,
  saveCanvasAttachment,
  saveMindmapAttachment,
  updateCanvasAttachment,
  updateMindmapAttachment,
  readAttachmentText,
  readAttachmentMeta,
  readAttachmentBuffer,
  deleteAttachment,
  resolveAttachmentFilePath,
  validateAttachmentAgainstCapabilities,
  isAttachmentReferenced,
  summarizePinnedLimits,
  parseNonNegativeIntHeader,
  resolveUploadMime,
  schedulePdfExtract,
  scheduleMediaTranscriptExtract,
  runPdfExtract,
  waitForAttachmentExtractReady,
  waitForPdfExtractReady,
  applyAttachmentExtractMeta,
  writeLegacyExtractArtifacts,
  listSessionAttachmentMetas,
  readExtractChunks,
  readExtractMarkdown,
  isPdfTextExtractReady,
  isLibraryExtractReady,
  isTranscriptExtractReady,
  registerDocumentIngestHook,
  registerPdfIngestHook,
  registerMediaTranscriptHook,
  ARTIFACT_SOURCE_MAX_CHARS,
} from './chat-attachments.js'
export type {
  DocumentIngestHook,
  MediaTranscriptHook,
  WaitAttachmentExtractResult,
  WaitAttachmentExtractOptions,
  WaitPdfExtractResult,
  LegacyExtractPayload,
} from './chat-attachments.js'
export {
  type MediaKind,
  type ChatAttachmentMeta,
  type CanvasAttachmentMeta,
  type CanvasPageSpec,
  type MindmapAttachmentMeta,
  type AttachmentExtractMeta,
  type AttachmentExtractStatus,
  type AttachmentExtractPhase,
  type AttachmentLimits,
  type ModelMediaCapabilities,
  mimeToMediaKind,
  inferMimeFromFilename,
  resolveMediaMime,
  formatBytesShort,
  mediaKindLabel,
  isLibraryIngestKind,
  isTranscriptExtractKind,
  CANVAS_MIME,
  CANVAS_EXT,
  CANVAS_DATA_FILE,
  MINDMAP_MIME,
  MINDMAP_EXT,
  MINDMAP_DATA_FILE,
} from './media-types.js'
export { resolveAttachmentLimits, LARGE_FILE_WARN_BYTES } from './attachment-limits.js'
export {
  extractPdfToMarkdown,
  formatDocumentCatalogLine,
  linesToMarkdownTable,
  extractTablesFromPageText,
} from './pdf-extract.js'
export type {
  PdfExtractResult,
  PdfExtractPage,
  PdfExtractChunk,
} from './pdf-extract.js'
export {
  buildUserContentParts,
  attachmentToContentPart,
  attachmentToContentParts,
  chatMessageContentToText,
  parseAssistantResponseContent,
  modelAcceptsImageInput,
  sanitizeContentPartsForModelMedia,
  sanitizeMessagesForModelMedia,
} from './content-parts.js'
export type { ContentPart, TextContentPart, ImageUrlContentPart, FileContentPart, InputAudioContentPart } from './llm/provider.js'
export {
  formatTokenCount,
  formatTurnUsageLabel,
} from './llm/format-token-count.js'
export {
  type TokenUsage,
  type TokenUsageDisplay,
  type CacheWarmth,
  emptyTokenUsage,
  mergeTokenUsage,
  parseOpenAiUsage,
  resolveCacheWarmth,
  promptCacheKeyForSession,
} from './llm/token-usage.js'

export {
  type ChatContextUsageSnapshot,
  type ChatTurnUsageSnapshot,
} from './chat-progress.js'
export {
  type SessionMemory,
  formatSessionMemoryForPrompt,
  emptySessionMemory,
  parseSessionMemoryFromModelText,
} from './context/session-memory.js'
export {
  ensureContextBudget,
  buildBudgetForModel,
  assembleModelView,
  microcompactMessages,
  isContextOverflowError,
  CONTEXT_COMPACT_HINT,
  type CompactLevel,
  type CompactResult,
} from './context/compact.js'
export {
  type ContextProjection,
  coveredPrefixHash,
  projectionValid,
  modelVisibleFromProjection,
  installMicroProjection,
  installMemoryProjection,
} from './context/projection.js'
export {
  parseContextProjection,
  readContextProjectionFromDisk,
  writeContextProjectionToDisk,
  resolveContextProjectionPath,
  computeContextUsagePercent,
  hydrateContextProjection,
  contextProjectionToRef,
  isContextProjectionRef,
  isFullContextProjection,
  CONTEXT_PROJECTION_PATH_KEY,
  type ContextProjectionRef,
} from './context/session-projection-disk.js'
export { estimateTextTokens, estimateMessageTokens } from './context/token-estimate.js'
export {
  createProvider,
  isConfigured,
  fetchOpenAiModelList,
  joinOpenAiCompatibleUrl,
  EMPTY_REPLY_REASONING_HINT,
  LEGACY_DEFAULT_MAX_TOKENS,
  LEGACY_ORDINARY_OUTPUT_TOKENS,
  ORDINARY_OUTPUT_TOKENS,
  REASONING_OUTPUT_TOKENS,
  HIGH_REASONING_OUTPUT_TOKENS,
  OUTPUT_TOKENS_64K,
  OUTPUT_TOKENS_128K,
  OUTPUT_TOKENS_384K,
  MAX_OUTPUT_TOKENS_PRESETS,
  autoOutputBudget,
  looksLikeReasoningModel,
  resolveRequestMaxTokens,
  type LlmConfig,
  type LlmTurn,
  type LlmChatDelta,
} from './llm/provider.js'
export { initOutboundNetwork, type OutboundConnectFamily, type OutboundNetworkStatus } from './llm/outbound-network.js'

/** 注册 PDF → doc-library ingest hook */
import './doc-library-bridge.js'
