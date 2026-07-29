export { AgentEngine, ChatCancelledError, type AgentSettings, type ChatResult, type SessionContextUsage } from './engine.js'
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
export { SessionStore, setSessionPersistHooks, sessionToMeta, type SessionMeta, type SessionRecord, type DisplayMessage, type SessionContextRef, type SessionForkContextRef, type SessionSelectionContextRef, type SessionArticleContextRef, type CreateSessionOptions } from './sessions.js'
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
  type MediaKind,
  type ChatAttachmentMeta,
  type AttachmentLimits,
  type ModelMediaCapabilities,
  mimeToMediaKind,
  inferMimeFromFilename,
  resolveMediaMime,
  formatBytesShort,
  mediaKindLabel,
} from './media-types.js'
export { resolveAttachmentLimits } from './attachment-limits.js'
export {
  saveAttachment,
  readAttachmentMeta,
  readAttachmentBuffer,
  deleteAttachment,
  resolveAttachmentFilePath,
  validateAttachmentAgainstCapabilities,
  isAttachmentReferenced,
  summarizePinnedLimits,
  parseNonNegativeIntHeader,
  resolveUploadMime,
} from './chat-attachments.js'
export {
  buildUserContentParts,
  attachmentToContentPart,
  chatMessageContentToText,
  parseAssistantResponseContent,
} from './content-parts.js'
export type { ContentPart, TextContentPart, ImageUrlContentPart, FileContentPart, InputAudioContentPart } from './llm/provider.js'
export {
  formatTokenCount,
  formatTurnUsageLabel,
} from './llm/format-token-count.js'
export {
  type TokenUsage,
  type TokenUsageDisplay,
  emptyTokenUsage,
  mergeTokenUsage,
  parseOpenAiUsage,
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
export { estimateTextTokens, estimateMessageTokens } from './context/token-estimate.js'
export {
  createProvider,
  isConfigured,
  fetchOpenAiModelList,
  joinOpenAiCompatibleUrl,
  type LlmConfig,
} from './llm/provider.js'
export { initOutboundNetwork, type OutboundConnectFamily, type OutboundNetworkStatus } from './llm/outbound-network.js'
