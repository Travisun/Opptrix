/**
 * Provider 运行时配置持久化 — 用户对数据 Provider 的启用、优先级、自定义参数设置。
 *
 * 用途：设置页面展示 Provider 列表、用户切换 Provider 优先级、保存 API Key。
 * 存储：user-store provider_settings JSON 文件
 */

import type { MarketGroup } from './market-data.js'

/**
 * Provider 优先级模式 — 决定优先级数值的来源。
 * - manifest: 使用 Provider 清单中的默认优先级
 * - custom:   使用用户自定义优先级数值
 */
export type ProviderPriorityMode = 'manifest' | 'custom'

/**
 * Provider 设置字段类型 — 决定设置页面的输入控件类型。
 * - boolean: 开关
 * - string:  文本输入
 * - secret:  密码输入（掩码显示）
 * - number:  数字输入
 * - select:  下拉选择
 */
export type ProviderSettingsFieldType = 'boolean' | 'string' | 'secret' | 'number' | 'select'

/**
 * Provider 设置字段定义 — 描述单个配置项的 UI 展示和验证规则。
 *
 * 用途：设置页面动态渲染 Provider 配置表单。
 */
export interface ProviderSettingsField {
  /** 字段唯一键（如 "api_key"、"region"），对应 extra 中的 key */
  key: string
  /** 字段输入类型 */
  type: ProviderSettingsFieldType
  /** 字段显示标签（如"API Key"、"数据区域"） */
  label: string
  /** 字段说明文本（可选） */
  description?: string
  /** 输入框占位符文本 */
  placeholder?: string
  /** 是否必填 */
  required?: boolean
  /** 默认值 */
  default?: unknown
  /** 下拉选项（仅 type="select" 时使用） */
  options?: Array<{ value: string; label: string }>
  /** 是否为密码字段（输入时掩码，值不返回给前端） */
  masked?: boolean
}

/**
 * Provider 设置定义 — 某个 Provider 的完整配置 Schema。
 *
 * 用途：Provider 渲染配置表单、验证用户输入。
 */
export interface ProviderSettingsDefinition {
  /** Provider 唯一标识（如 "baostock"、"zzshare"） */
  providerId: string
  /** Provider 显示标题（如"东方财富"、"BaoStock"） */
  title: string
  /** Provider 副标题/说明（如"免费 · A股行情"） */
  subtitle?: string
  /** 所属市场分组（如 "CN"、"US"、"GLOBAL"） */
  marketGroup: MarketGroup
  /** 搜索关键词（如 ["行情", "K线"]），用于设置页面搜索 */
  keywords?: string[]
  /** 配置字段列表 */
  fields: ProviderSettingsField[]
  /** 是否支持连接测试（"测试连接"按钮） */
  supportsTest?: boolean
  /** 启用/禁用此 Provider 是否影响整体优先级排序 */
  enableAffectsPriority?: boolean
}

/**
 * Provider 设置行 — 用户对某个 Provider 的持久化配置。
 *
 * 用途：读取/更新 Provider 的启用状态、优先级、自定义参数。
 * 存储：provider_settings JSON 文件中按 providerId 索引。
 */
export interface ProviderSettingsRow {
  /** Provider 唯一标识 */
  providerId: string
  /** 是否启用 */
  enabled: boolean
  /** 优先级模式（使用默认值或用户自定义） */
  priorityMode: ProviderPriorityMode
  /** 用户自定义优先级数值（仅 priorityMode="custom" 时有效） */
  priority: number | null
  /** 排序顺序（可选，用于覆盖默认排序） */
  sortOrder: number | null
  /** 自定义配置项键值对（如 { api_key: "xxx", region: "CN" }） */
  extra: Record<string, unknown>
  /** 最后更新时间 ISO 8601 */
  updatedAt: string
}

/**
 * Provider 设置更新补丁 — 部分更新 Provider 配置。
 *
 * 用途：设置页面保存单个 Provider 的修改。
 */
export interface ProviderSettingsPatch {
  /** 更新启用状态 */
  enabled?: boolean
  /** 更新优先级模式 */
  priorityMode?: ProviderPriorityMode
  /** 更新自定义优先级 */
  priority?: number | null
  /** 更新排序顺序 */
  sortOrder?: number | null
  /** 合并更新自定义配置项 */
  extra?: Record<string, unknown>
}

/**
 * Provider 清单定义 — 应用内置的 Provider 元数据。
 *
 * 用途：Provider 列表展示、优先级初始化、功能描述。
 */
export interface ProviderManifest {
  /** Provider 唯一标识 */
  providerId: string
  /** 显示标题 */
  title: string
  /** 副标题/说明 */
  subtitle?: string
  /** 所属市场分组 */
  marketGroup: MarketGroup
  /** 默认优先级数值（越大越优先） */
  defaultPriority: number
  /** 搜索关键词 */
  keywords?: string[]
  /** 内置配置 Schema；为空时表示仅展示启用/优先级卡片 */
  settings?: ProviderSettingsDefinition
}

/**
 * Provider 运行时公开信息 — 合并清单默认值与用户设置后的完整状态。
 *
 * 用途：设置页面展示 Provider 卡片、API 返回给前端。
 */
export interface PublicProviderRuntime {
  /** Provider 唯一标识 */
  providerId: string
  /** 显示标题 */
  title: string
  /** 副标题 */
  subtitle?: string
  /** 所属市场分组 */
  marketGroup: MarketGroup
  /** 是否启用 */
  enabled: boolean
  /** 当前优先级模式 */
  priorityMode: ProviderPriorityMode
  /** 用户自定义优先级（null 表示使用默认值） */
  priority: number | null
  /** 实际生效优先级（用户自定义 或 清单默认值） */
  effectivePriority: number
  /** 清单中的默认优先级 */
  manifestDefaultPriority: number
  /** 各 secret 字段是否已配置（如 { api_key: true }） */
  secretsConfigured: Record<string, boolean>
  /** 各 secret 字段的掩码预览（如 { api_key: "abcd…wxyz" }） */
  secretPreviews?: Record<string, string>
  /** 是否可启用（满足前置条件时为 true） */
  canEnable: boolean
  /** 当前配置值键值对 */
  values: Record<string, unknown>
  /** 配置字段定义列表（供前端渲染表单） */
  settingsFields: ProviderSettingsField[]
  /** 是否支持连接测试 */
  supportsTest: boolean
  /** 支持的数据能力列表（如 ["STOCK_REALTIME", "STOCK_KLINE"]） */
  capabilities: string[]
  /** 最后更新时间 */
  updatedAt?: string
}

/**
 * Provider 目录分组 — 按市场分组的 Provider 列表。
 *
 * 用途：设置页面按市场分组展示 Provider 列表。
 */
export interface ProviderCatalogGroup {
  /** 市场分组标识 */
  marketGroup: MarketGroup
  /** 分组显示名称（如"A股数据"、"美股数据"） */
  label: string
  /** 该分组下的 Provider 运行时信息列表 */
  providers: PublicProviderRuntime[]
}

/**
 * Provider 目录响应 — 设置页面获取的完整 Provider 目录。
 */
export interface ProviderCatalogResponse {
  /** 按市场分组的 Provider 列表 */
  groups: ProviderCatalogGroup[]
}

/**
 * Provider 绑定覆盖行 — 按 (市场 × 资产类别 × 能力) 维度的优先级覆盖。
 *
 * 用途：高级设置中，用户可针对特定场景调整 Provider 优先级。
 * 存储：provider_binding_overrides JSON 文件
 */
export interface ProviderBindingOverrideRow {
  /** Provider 唯一标识 */
  providerId: string
  /** 目标市场（如 "CN"、"US"） */
  market: import('./market-data.js').Market
  /** 目标资产类别（如 "EQUITY"、"ETF"） */
  assetClass: import('./market-data.js').AssetClass
  /** 目标能力（如 "STOCK_REALTIME"、"STOCK_KLINE"） */
  capability: string
  /** 覆盖启用状态（null 表示不覆盖） */
  enabled: boolean | null
  /** 覆盖优先级数值（null 表示不覆盖） */
  priority: number | null
  /** 最后更新时间 ISO 8601 */
  updatedAt: string
}

/**
 * Provider 绑定覆盖补丁 — 部分更新绑定覆盖配置。
 */
export interface ProviderBindingOverridePatch {
  /** 覆盖启用状态 */
  enabled?: boolean | null
  /** 覆盖优先级 */
  priority?: number | null
}

/**
 * Provider 绑定覆盖公开信息 — 合并默认绑定与用户覆盖后的完整状态。
 *
 * 用途：高级设置页面展示当前绑定关系和生效优先级。
 */
export interface PublicProviderBindingOverride {
  /** 目标市场 */
  market: import('./market-data.js').Market
  /** 目标资产类别 */
  assetClass: import('./market-data.js').AssetClass
  /** 目标能力 */
  capability: string
  /** 显示标签（如 "CN × EQUITY → STOCK_REALTIME"） */
  label: string
  /** 清单默认优先级 */
  manifestDefaultPriority: number
  /** 用户覆盖的启用状态（null 表示未覆盖） */
  overrideEnabled: boolean | null
  /** 用户覆盖的优先级（null 表示未覆盖） */
  overridePriority: number | null
  /** 实际生效优先级（覆盖值 或 默认值） */
  effectivePriority: number
}

/**
 * @deprecated 使用 PublicProviderRuntime — 保留用于 Tushare REST 接口兼容。
 */
export interface TusharePublicConfigLegacy {
  enabled: boolean
  token: string
  token_configured: boolean
  token_preview: string
  config_path: string
}
