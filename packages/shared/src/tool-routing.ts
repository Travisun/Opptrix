/**
 * 分层工具路由策略 — 供 LLM 按场景快速定位工具
 *
 * 设计原则：
 * 1. 按用户意图分层（Tier 1-8），每层标注优先级
 * 2. 每个工具标注「何时使用」+「何时不用」双面约束
 * 3. 同层工具按优先级排序，LLM 先尝试高优先级
 * 4. 不限制总调用次数，但引导按需调用
 */
export const TOOL_ROUTING = `
## 工具路由策略（按场景分层）

### Tier 1 · 基础信息（几乎所有查询可用）
| 工具 | 何时用 | 何时不用 |
|------|--------|----------|
| get_current_time | 需要日期/时间/时区 | 已知当前时间 |
| get_system_info | 需要环境/版本信息 | 非技术查询 |
| get_app_settings | 需要默认评分卡/模型配置 | 已从上下文获知 |
| get_project_info | 需要数据路径/版本 | 非开发场景 |
| get_integration_status | 检查 Tushare 等外部服务 | 已知状态 |
| ask_user | 分析方向有多种可能、无法推断偏好 | 已有明确指令 |

### Tier 2 · 市场全景（宏观/板块/大盘问题）
| 工具 | 优先级 | 何时用 | 何时不用 |
|------|--------|--------|----------|
| get_market_regime | ★★★ | 牛熊判断、策略方向、宏观背景 | 已有最新市场状态 |
| get_market_dynamics | ★★☆ | 复盘、板块轮动、涨跌榜 | 只需单只标的 |
| get_trend_brief | ★★☆ | A 股单股趋势快评 | 需要深度分析时用 evaluate_instrument |

### Tier 3 · 标的发现与分析
| 工具 | 优先级 | 何时用 | 何时不用 |
|------|--------|--------|----------|
| search_instruments | ★★★ | 不确定代码/格式、跨市场搜索 | 已知精确 code/ref |
| get_instrument_capabilities | ★★☆ | 不确定标的可用能力 | 已从上下文知道能力 |
| get_instrument_snapshot | ★★★ | 标的当前状态（行情+新闻+评分） | 只需历史数据 |
| get_instrument_quotes | ★★☆ | 只需实时行情 | 需要完整快照时用 snapshot |
| get_instrument_chart | ★★☆ | 需要 K 线图/趋势可视化 | 只需最新价 |
| batch_instrument_snapshots | ★★★ | 批量多标的同时分析 | 单只标的用 snapshot |
| evaluate_instrument | ★★★ | 因子评分/决策雷达/技术评估 | 只需行情快照 |
| get_instrument_strategy_signal | ★★☆ | 交易信号/买卖建议 | 只需数据不需要信号 |
| get_instrument_indicators | ★★☆ | 技术指标详情 | 只需综合评估时用 evaluate |
| get_instrument_cyq | ★☆☆ | 筹码分布（仅 A 股） | 非 A 股或不需要筹码 |
| verify_instrument_strategy | ★☆☆ | 验证核心标的策略 | 常规分析不需要 |
| get_instrument_latest_evaluation | ★☆☆ | 查看历史评估结果 | 需要重新评估时用 evaluate |
| get_instrument_institution_rating | ★★☆ | 机构评级概览 | 需要完整报告时用 institution_report |
| get_instrument_institution_report | ★☆☆ | 机构评级详细报告 | 只需评级概览时用 rating |
| list_enabled_providers | ★☆☆ | 确认可用数据源 | 已知数据源状态 |
| list_provider_custom_methods | ★☆☆ | 查找自定义方法 | 标准 API 已满足 |
| invoke_provider_custom_method | ★☆☆ | 调用非标准 API | 标准 API 已满足 |

### Tier 4 · ETF 专题
| 工具 | 优先级 | 何时用 | 何时不用 |
|------|--------|--------|----------|
| search_etfs | ★★★ | 搜索 ETF | 已知 ETF 代码 |
| get_etf_list | ★★☆ | 浏览 ETF 列表 | 只需单只 ETF |
| get_etf_snapshot | ★★★ | ETF 综合快照（行情+净值+持仓） | 只需净值或只持仓 |
| get_etf_scorecard | ★★☆ | ETF 决策雷达（折溢价+费率+同类） | 只需基本行情 |
| get_etf_nav | ★★☆ | 历史净值与溢价率 | 只需最新净值用 snapshot |
| get_etf_holdings | ★★☆ | 最新持仓与权重 | 只需行情用 snapshot |

### Tier 5 · 组合与关注
| 工具 | 优先级 | 何时用 | 何时不用 |
|------|--------|--------|----------|
| get_watchlist | ★★★ | 读取关注列表 | 已从上下文获知 |
| get_watchlist_radar | ★★★ | 关注池雷达/估值概览 | 只需单只标的 |
| get_portfolio_holdings | ★★★ | 持仓明细（成本/市值/浮盈） | 只需关注列表 |
| portfolio_summary | ★★☆ | 持仓汇总统计 | 需要明细用 holdings |
| portfolio_trades | ★★☆ | 交易流水 | 只需持仓不需流水 |
| analyze_portfolio | ★★☆ | 组合因子分析 | 只需持仓概览 |

### Tier 6 · 行业分析
| 工具 | 优先级 | 何时用 | 何时不用 |
|------|--------|--------|----------|
| list_local_industries | ★★★ | 查找可用行业名 | 已知精确行业名 |
| get_industry_stats | ★★☆ | 行业强弱/估值对比 | 只需成分股 |
| get_local_industry_stocks | ★★★ | 行业成分股+评分 | 只需行业统计 |
| industry_mining | ★★☆ | 产业链透视 | 只需成分股列表 |
| industry_mermaid | ★☆☆ | 产业链 Mermaid 图 | 不需要可视化 |

### Tier 7 · 选股与策略
| 工具 | 优先级 | 何时用 | 何时不用 |
|------|--------|--------|----------|
| get_local_universe_screen_schema | ★★★ | 编写筛选条件前查可用因子/过滤器 | 已知全部因子名 |
| screen_stocks | ★★★ | A 股本地因子筛选 | 已有目标代码 |
| screen_local_universe | ★★☆ | 行业/板块+因子组合初选 | 只需简单因子条件 |
| screen_local_industry_stocks | ★★☆ | 行业内因子初选 | 只需成分股列表 |
| search_local_instruments | ★★★ | 本地名录搜索（离线） | 需最新未入库标的 |
| search_instruments | ★★☆ | 本地+在线合并搜索 | 已知精确 code |
| screen_us_universe | ★★☆ | 美股名录搜索 | 非美股场景 |
| screen_hk_universe | ★★☆ | 港股名录搜索 | 非港股场景 |
| screen_crypto_universe | ★★☆ | Crypto 交易对搜索 | 非 Crypto 场景 |
| run_backtest | ★★☆ | 因子/评分卡回测 | 只需当前评分 |
| strategy_report | ★☆☆ | 单股策略报告 | 只需评估不需报告 |

### Tier 8 · 资讯与公告
| 工具 | 优先级 | 何时用 | 何时不用 |
|------|--------|--------|----------|
| get_news_center_status | ★★☆ | 检查资讯同步状态 | 已知状态 |
| list_news_groups | ★★☆ | 浏览资讯分组 | 已知分组 |
| list_news_sources | ★★☆ | 浏览订阅来源 | 已知来源 |
| list_news_articles | ★★★ | 浏览资讯列表 | 只需单篇 |
| get_news_article | ★★★ | 获取资讯正文 | 只需标题摘要 |
| get_notice_content | ★★★ | 获取公告正文（HTML/PDF） | 只需标题 |

### 调用纪律
- 同一任务对同一工具最多调用 2 次（首次获取 + 必要时刷新）
- 优先用 Tier 高优先级工具，低优先级仅在高优先级不满足时使用
- 用户明确指定代码/标的时，跳过搜索直接分析
- 禁止对非 A 股标的调用 A 股专用工具（如 institution_rating、screen_stocks）
- 禁止在已有标准 API 时用自定义方法替代
`
