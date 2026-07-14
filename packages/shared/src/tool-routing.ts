/**
 * 聊天 Agent 工具路由提示 — 已收敛为 Tool Pack 目录。
 * 详细「何时用」仅出现在本轮已加载工具的 description。
 */
import { buildToolPackCatalogPrompt } from './tool-packs.js'

/** @deprecated 请优先使用 buildToolPackCatalogPrompt；保留别名以兼容旧 import */
export const TOOL_ROUTING = buildToolPackCatalogPrompt()
