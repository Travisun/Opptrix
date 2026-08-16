# QuantsPlaybook → Opptrix Skill 映射清单

> 源仓库：`/Users/mac/Documents/QuantsPlaybook`（hugo2046/QuantsPlaybook）  
> 目标分支：`new-quants-skills`  
> 用途：供后续逐个实现 Agent Skill；**本文件只做映射，不含实现**。

## 覆盖范围

- `A-量化基本面` / `B-因子构建类` / `C-择时类` / `D-组合优化`：**全部一级目录**各 1 行
- `C-择时类/择时视角下的波动率因子.ipynb`：根级独立 notebook 单独 1 行
- `SignalMaker/*.py`：每个模块 1 行（`utils.py` 注明并入；`__init__.py` 不建 skill）
- `hugos_toolkit/`：回测/绘图基础设施，**不映射为业务 skill**（实现时禁止引入为仓库级共享依赖）

## 命名与边界约定

- skill name：小写连字符，**无 `qp-` 前缀**，≤64，`[a-z0-9]+(-[a-z0-9]+)*`
- 与现有 `lean-*`：**不合并**；仅在「边界备注」列标注易混技能
- 脚本契约见 [`quants-skill-script-contract.md`](./quants-skill-script-contract.md)
- 默认产物：投研类均为可预览 **web**（`create_web`）；并入项为 `none`

## 统计

- 映射表行数（含并入注明）：**63**
- 计划独立实现 skill 数（不含并入行）：**62**
- 分类：fundamental=2，factor=25，timing=28，portfolio=2，signal=5

## 映射表

| # | QP 路径 | 建议 skill name | 中文标题 | 类别 | 主算法要点 | 原数据依赖 | Opptrix 替换取数 | 计划 scripts 文件 | 默认产物 | 完备风险 | 边界备注 |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | A-量化基本面/申万大师系列十三 | `sw-excess-cashflow-screen` | 罗伯·瑞克超额现金流选股 | fundamental | 按超额/自由现金流等规则筛选股票，复现申万大师系列十三选股法则。 | 聚宽财务科目 + 日行情；主体在 notebook | 财务摘要（经营现金流/利润等）+ 日 K → workspace JSON | `scripts/sw_excess_cashflow.py` | web | 可复用 py 极少；财务字段与研报科目需人工对齐 | 易混 lean-magic-formula（勿合并） |
| 2 | A-量化基本面/华泰FFScore | `ht-ffscore` | 华泰 FFScore 价值打分 | fundamental | FFScore/比乔斯基多维财务打分，华泰价值选股实证框架。 | 财务指标面板；仅 FFScore.ipynb | FinancialSummary / 估值与质量字段 → workspace JSON | `scripts/ht_ffscore.py` | web | 缺独立源码（仅 notebook）；口径可能偏差 | 易混 lean-magic-formula、lean-qc500-style-screen |
| 3 | B-因子构建类/基于量价关系度量股票的买卖压力 | `volume-price-pressure` | 量价买卖压力因子 | factor | 用价量关系度量买卖压力并做截面选股检验（东方因子系列）。 | 日频 OHLCV（聚宽/本地） | batch 日 K OHLCV → workspace | `scripts/volume_price_pressure.py` | web | py 较完整；需定义股票宇宙 | — |
| 4 | B-因子构建类/来自优秀基金经理的超额收益 | `star-manager-alpha` | 优秀基金经理超额收益因子 | factor | 从优秀基金经理持仓与超额表现提取选股因子。 | 基金持仓/净值/行业映射（聚宽） | 基金持仓能力若可得；否则用户导入持仓 JSON 并诚实降级 | `scripts/star_manager_alpha.py` | web | 强依赖基金持仓历史；Opptrix 缺口风险高 | — |
| 5 | B-因子构建类/多因子指数增强 | `multi-factor-index-enhance` | 多因子指数增强 | factor | 多因子合成并结合自适应风险控制做指数增强。 | 因子面板、指数成分、风险模型；含回测模块 | get_index_constituents + 多标的日 K/因子序列 → workspace | `scripts/multi_factor_index_enhance.py` | web | 回测耦合重；需抽离核心加权 | 易混 lean-mean-variance、lean-sector-weighting |
| 6 | B-因子构建类/剔除跨期截面相关性的纯真波动率因子 | `pure-idio-vol` | 纯真特质波动率因子 | factor | 剔除跨期截面相关后提取特质波动率中的「纯真」信息。 | 日收益与市场/行业残差 | 日 K 收益 + 可选行业映射 → workspace | `scripts/pure_idio_vol.py` | web | 截面回归需 numpy；宇宙大时性能敏感 | — |
| 7 | B-因子构建类/处置效应因子 | `disposition-cgo` | 处置效应 CGO 因子 | factor | 资本利得突出量 CGO 与处置效应相关行为因子。 | 历史成本/换手或近似成本分布 | 用日价量近似 CGO；缺真实持仓须声明假设 | `scripts/disposition_cgo.py` | web | 真实成本分布难取；多为近似 | — |
| 8 | B-因子构建类/上下影线因子 | `candle-shadow-factor` | 上下影线因子 | factor | 基于蜡烛上下影线构造技术选股因子（东吴系列）。 | 日 OHLCV | 日 K OHLCV → workspace | `scripts/candle_shadow_factor.py` | web | 算法轻量，移植风险低 | — |
| 9 | B-因子构建类/聪明钱因子模型的2.0版本 | `smart-money-factor` | 聪明钱因子 2.0 | factor | 开源证券聪明钱微观结构因子 2.0。 | 分钟/逐笔或高频代理；仅 notebook | 优先分钟 K；否则日量价代理并声明降级 | `scripts/smart_money_factor.py` | web | 缺独立 py；高频数据缺口高 | — |
| 10 | B-因子构建类/A股市场中如何构造动量因子？ | `cn-momentum-construct` | A股动量因子构造 | factor | 复现开源评论中 A 股动量因子的构造与检验思路。 | 日收益截面；仅 notebook | batch 日 K → 收益序列 workspace | `scripts/cn_momentum_construct.py` | web | 需从 notebook 抽算法 | 易混 lean-returns-momentum（勿合并） |
| 11 | B-因子构建类/振幅因子的隐藏结构 | `amplitude-hidden-structure` | 振幅因子隐藏结构 | factor | 拆解振幅因子内部结构以提取有效选股信息。 | 日高低振幅；仅 notebook | 日 K high/low/close → workspace | `scripts/amplitude_hidden_structure.py` | web | 缺 py；需 notebook 复刻 | — |
| 12 | B-因子构建类/高质量动量因子选股 | `quality-momentum` | 高质量动量选股 | factor | 质量过滤后的动量选股体系。 | 价量 + 质量基本面；仅 notebook | 日 K + 财务质量字段 → workspace | `scripts/quality_momentum.py` | web | 缺 py；质量字段映射风险 | 易混 lean-returns-momentum |
| 13 | B-因子构建类/APM因子模型 | `apm-factor` | APM 因子模型 | factor | 隔夜与盘中收益拆分的 APM 微观结构因子。 | 开盘/收盘拆隔夜与日间收益 | 日 K open/close → workspace | `scripts/apm_factor.py` | web | 有参考 py；口径需统一 | — |
| 14 | B-因子构建类/高频价量相关性，意想不到的选股因子 | `hf-cpv-factor` | 高频价量 CPV 因子 | factor | 高频价量相关性构造 CPV 选股因子。 | 分钟/高频价量；含工具库 | 分钟 K 若可得；否则日频相关代理 | `scripts/hf_cpv_factor.py` | web | 高频与工具链依赖重 | — |
| 15 | B-因子构建类/企业生命周期 | `firm-life-cycle` | 企业生命周期因子 | factor | 按企业生命周期分段评估/合成因子有效性。 | 多期财务与现金流结构 | 多期 FinancialSummary → workspace | `scripts/firm_life_cycle.py` | web | scr 较多；分类规则需固化 | — |
| 16 | B-因子构建类/因子择时 | `factor-timing` | 因子择时 | factor | 对因子收益序列施加择时开关（光大路演思路）。 | 因子收益时间序列；仅 notebook | 上游因子序列由 Agent 写入 workspace，脚本做择时规则 | `scripts/factor_timing.py` | web | 缺源码；依赖上游因子产物 | 易混 lean-param-grid-optimize |
| 17 | B-因子构建类/行业有效量价因子与行业轮动策略 | `industry-vp-rotation` | 行业量价因子与轮动 | factor | 行业有效量价因子驱动行业/ETF 轮动。 | 行业指数或行业 ETF 价量 | 行业/指数/ETF 日 K + 成分映射 → workspace | `scripts/industry_vp_rotation.py` | web | 含 qlib 表达式痕迹，须去依赖 | 易混 lean-etf-global-rotation、lean-sector-weighting |
| 18 | B-因子构建类/筹码因子 | `chip-distribution-factor` | 筹码分布因子 | factor | 由价量推演筹码分布并构造选股因子。 | 日价量；qlib/cyq_ops | 日 OHLCV 推演筹码；禁止 qlib | `scripts/chip_distribution_factor.py` | web | qlib/筹码算子移植成本高 | — |
| 19 | B-因子构建类/凸显理论STR因子 | `str-salience-factor` | 凸显理论 STR 因子 | factor | 行为金融凸显性收益 STR 因子。 | 日收益分布；qlib workflow | 日收益截面 → workspace；去 qlib | `scripts/str_salience_factor.py` | web | qlib 依赖需纯算法重写 | — |
| 20 | B-因子构建类/个股动量效应的识别及球队硬币因子 | `team-coin-momentum` | 球队硬币动量因子 | factor | 识别个股动量效应并构建「球队硬币」因子。 | 多频收益；含 ML/qlib 配置 | 日/周收益窗口 → workspace；ML 可选降级为规则版 | `scripts/team_coin_momentum.py` | web | LightGBM/TCN 路径重；优先规则版 | 易混 lean-returns-momentum |
| 21 | B-因子构建类/股票网络与网络中心度因子研究 | `network-centrality-factor` | 股票网络中心度因子 | factor | 收益相关网络的中心度作为选股因子。 | 多标的收益相关矩阵 | 多标的日收益 → workspace；图算法尽量纯 Python | `scripts/network_centrality_factor.py` | web | 宇宙规模与 data_provider 需替换 | — |
| 22 | B-因子构建类/基于隔夜与日间的网络关系因子 | `overnight-day-network` | 隔夜-日间网络因子 | factor | 隔夜 vs 日间 lead-lag 网络与聚类组合策略。 | 开盘收盘拆收益；qlib_data_provider | 日 K open/close 批处理 → workspace；禁止 qlib | `scripts/overnight_day_network.py` | web | qlib/聚类依赖重 | — |
| 23 | B-因子构建类/开源证券-开源量化评论（91）：形态识别，均线的收敛与发散 | `ma-converge-diverge` | 均线收敛与发散因子 | factor | 多均线收敛/发散形态识别并作因子。 | 日收盘；FactorArithmetic | 日 K close → workspace | `scripts/ma_converge_diverge.py` | web | 源码相对完整，需抽离算术库 | 易混 lean-ma-cross-trend、lean-ema-cross-universe |
| 24 | B-因子构建类/开源证券-市场微观结构研究系列（1）：A股反转之力的微观来源 | `microstructure-w-factor` | 反转微观 W 因子 | factor | 从微观结构解释 A 股反转并构建 W 因子。 | 日/高频价量 | 日 K 或分钟线 → workspace | `scripts/microstructure_w_factor.py` | web | 高频可得性风险 | — |
| 25 | B-因子构建类/再论动量因子 | `revisit-momentum-factor` | 再论动量因子 | factor | 对动量因子构造与衰减的再讨论与复现。 | 日收益；有 py | 日 K 收益 → workspace | `scripts/revisit_momentum_factor.py` | web | 相对轻量 | 易混 lean-returns-momentum |
| 26 | B-因子构建类/基金重仓超配因子及其对指数增强组合的影响 | `fund-overweight-factor` | 基金重仓超配因子 | factor | 基金相对基准超配因子及其对指数增强的影响。 | 基金持仓、指数权重 | 持仓/权重缺口时用户导入 JSON | `scripts/fund_overweight_factor.py` | web | 持仓数据缺口高 | — |
| 27 | B-因子构建类/金股增强策略 | `gold-stock-enhance` | 金股增强策略 | factor | 券商金股列表跟踪/增强类策略。 | 外部金股名单 + 行情 | 名单写入 workspace；行情日 K | `scripts/gold_stock_enhance.py` | web | 缺权威金股数据源 | — |
| 28 | C-择时类/RSRS择时指标 | `rsrs-timing` | RSRS 择时指标 | timing | 阻力支撑相对强度（高低点回归斜率）择时；含改进版。 | 指数日高低价 | 指数/ETF 日 K high/low → workspace | `scripts/rsrs_timing.py` | web | py 完整；经典易移植 | 易混 lean-indicator-playbook（指标手册，非同一策略） |
| 29 | C-择时类/QRS择时信号 | `qrs-timing` | QRS 择时信号 | timing | 中金技术择时艺术中的 QRS（相关/β/zscore）信号。 | 高低价序列；含 backtrader | 日 K high/low → workspace | `scripts/qrs_timing.py` | web | 与 SignalMaker/qrs.py 同源；勿重复造轮 | 易混 lean-indicator-playbook |
| 30 | C-择时类/低延迟趋势线与交易择时 | `low-lag-trendline` | 低延迟趋势线择时 | timing | 低延迟趋势线刻画趋势并生成择时信号。 | 日收盘 | 日 K close → workspace | `scripts/low_lag_trendline.py` | web | 有 py；算法中等 | — |
| 31 | C-择时类/时变夏普 | `time-varying-sharpe` | 时变夏普择时 | timing | 滚动/时变夏普比率作为仓位或择时信号。 | 收益序列 | 日 K 收益 → workspace | `scripts/time_varying_sharpe.py` | web | 轻量 | — |
| 32 | C-择时类/基于相对强弱下单向波动差值应用 | `rs-oneway-vol-spread` | 相对强弱单向波动差 | timing | 相对强弱框架下单向波动差值择时。 | 价量与波动拆分 | 日 K OHLCV → workspace | `scripts/rs_oneway_vol_spread.py` | web | 有 py | — |
| 33 | C-择时类/扩散指标 | `breadth-diffusion` | 扩散指标择时 | timing | 市场广度/扩散类指标择时。 | 成分股涨跌家数或收益广度 | 成分列表 + batch 日涨跌 → workspace | `scripts/breadth_diffusion.py` | web | 需全市场或指数成分快照 | — |
| 34 | C-择时类/CSVC框架及熊牛指标 | `csvc-bull-bear` | CSVC 与牛熊指标 | timing | 波动率与换手构建牛熊指标，并含 CSCV 过拟合评估框架。 | 波动、换手；两 notebook | 指数/ETF 日 K 量价 → workspace；CSCV 可选 | `scripts/csvc_bull_bear.py` | web | CSCV 统计重；可先交付牛熊指标核心 | — |
| 35 | C-择时类/基于点位效率理论的个股趋势预测研究 | `price-efficiency-trend` | 点位效率趋势预测 | timing | 点位效率理论刻画趋势并预测。 | 日价序列；有 py | 日 K → workspace | `scripts/price_efficiency_trend.py` | web | 有 py；需核验未来函数 | — |
| 36 | C-择时类/技术分析算法框架与实战 | `ta-pattern-framework` | 技术形态识别框架 | timing | 技术分析算法框架与常见形态识别实战。 | 日 OHLCV；含 Technical Pattern Recognition | 日 K → workspace | `scripts/ta_pattern_framework.py` | web | 框架面广；宜拆子信号或先做核心形态 | — |
| 37 | C-择时类/技术分析算法框架与实战二 | `ta-arc-bottom` | 圆弧底形态识别 | timing | 识别圆弧底等形态的择时/提示信号。 | 日价；scr | 日 K → workspace | `scripts/ta_arc_bottom.py` | web | scr 可用；形态参数敏感 | — |
| 38 | C-择时类/北向资金交易能力一定强吗 | `northbound-timing` | 北向资金择时检验 | timing | 检验北向资金交易能力并衍生择时信号。 | 北向资金流 + 指数 | 北向相关能力若缺口则诚实降级/用户导入 | `scripts/northbound_timing.py` | web | 北向历史序列可能缺口 | — |
| 39 | C-择时类/基于CCK模型的股票市场羊群效应研究 | `cck-herding` | CCK 羊群效应 | timing | CCK 模型度量市场羊群并作择时/状态判断。 | 截面收益离散度 | 多标的日收益截面 → workspace | `scripts/cck_herding.py` | web | 需足够宽的股票宇宙 | — |
| 40 | C-择时类/小波分析 | `wavelet-timing` | 小波分析择时 | timing | 小波/希尔伯特变换结合 SVM 等的择时。 | 价序列；py + 回测模块 | 日 K → workspace；SVM 路径标明需沙盒依赖 | `scripts/wavelet_timing.py` | web | scipy/sklearn 依赖；尽量降级规则版 | — |
| 41 | C-择时类/结合改进HHT模型和分类算法的交易策略 | `hht-timing` | 改进 HHT 择时 | timing | 改进 HHT（EMD/VMD+瞬时相位）结合分类器的交易策略。 | 价序列；PyEMD/vmdpy/scipy | 日 K → workspace；重依赖须 SKILL 标明 | `scripts/hht_timing.py` | web | 依赖极重；与 SignalMaker/hht_signal 共享核心 | 易混 lean-sentiment-nlp（无关，勿混） |
| 42 | C-择时类/特征分布建模择时 | `feature-dist-timing` | 特征分布建模择时 | timing | 对特征分布建模生成择时信号（系列之一）。 | 自建特征 + tushare data_service | 特征由 Agent 取数写入；脚本只做分布/阈值 | `scripts/feature_dist_timing.py` | web | tushare 耦合；特征定义需从 notebook 抽 | — |
| 43 | C-择时类/特征分布建模择时系列之二 | `feature-dist-timing-2` | 特征分布建模择时之二 | timing | 特征分布建模择时系列续作。 | 特征面板 + data | 同上 | `scripts/feature_dist_timing_2.py` | web | 与系列一边界需在 SKILL 写清 | — |
| 44 | C-择时类/均线交叉结合通道突破择时研究 | `ma-channel-breakout` | 均线交叉+通道突破 | timing | 申万：均线交叉结合通道突破的择时研究。 | 日价；仅 notebook | 日 K → workspace | `scripts/ma_channel_breakout.py` | web | 缺 py；规则可从研报/notebook 复刻 | 易混 lean-ma-cross-trend、lean-vix-dual-thrust |
| 45 | C-择时类/另类ETF交易策略：日内动量 | `etf-intraday-momentum` | ETF 日内动量 | timing | 定义噪声区域后的 ETF 日内动量交易。 | 分钟 OHLCV；NoiseArea | 分钟 K → workspace；日频无法完整复现须声明 | `scripts/etf_intraday_momentum.py` | web | 强依赖分钟线；与 signal-noise-area 配套 | 易混 lean-etf-ibs-reversion、lean-gap-reversion |
| 46 | C-择时类/成交量的奥秘_另类价量共振指标的择时 | `vmacd-mtm-timing` | VMACD_MTM 价量共振择时 | timing | 成交量 MACD 动量（VMACD_MTM）价量共振择时。 | 成交量序列；scr/app | 日/分钟 volume → workspace | `scripts/vmacd_mtm_timing.py` | web | 与 SignalMaker/vmacd_mtm 同源；talib 需标明或纯 Python | 易混 lean-indicator-playbook |
| 47 | C-择时类/基于鳄鱼线的指数择时及轮动策略 | `alligator-index-timing` | 鳄鱼线指数择时与轮动 | timing | 鳄鱼线/AO/分形等组合的指数择时与轮动。 | 指数日 K；talib | 指数/ETF 日 K → workspace | `scripts/alligator_index_timing.py` | web | 与 signal-alligator 共享；talib 依赖 | 易混 lean-etf-global-rotation |
| 48 | C-择时类/ICU均线 | `icu-ma-timing` | ICU 均线择时 | timing | ICU 均线体系的择时信号。 | 日收盘；src | 日 K close → workspace | `scripts/icu_ma_timing.py` | web | 有 src；参数需固化 | 易混 lean-ma-cross-trend |
| 49 | C-择时类/投资者情绪指数择时模型 | `investor-sentiment-timing` | 投资者情绪指数择时 | timing | 构建投资者情绪指数并用于择时。 | 情绪代理指标（涨跌停、换手等） | 广度/涨跌停/换手等可得字段 → workspace；缺口诚实降级 | `scripts/investor_sentiment_timing.py` | web | 情绪代理数据可能不全 | 易混 lean-sentiment-nlp（文本情绪，勿合并） |
| 50 | C-择时类/行业指数顶部和底部信号 | `industry-top-bottom` | 行业指数顶底信号 | timing | 行业指数顶部与底部信号识别。 | 行业指数价量 | 行业指数/ETF 日 K → workspace | `scripts/industry_top_bottom.py` | web | scr 可用 | — |
| 51 | C-择时类/趋与势的量化定义研究 | `trend-momentum-define` | 趋与势量化定义 | timing | 对「趋」与「势」给出可计算定义并验证。 | 价序列；仅 notebook | 日 K → workspace | `scripts/trend_momentum_define.py` | web | 缺 py | — |
| 52 | C-择时类/指数高阶矩择时 | `index-higher-moment` | 指数高阶矩择时 | timing | 用收益高阶矩（偏度/峰度等）做指数择时。 | 收益序列；有 py | 日 K 收益 → workspace | `scripts/index_higher_moment.py` | web | 轻量 | — |
| 53 | C-择时类/Trader-Company集成算法交易策略 | `trader-company` | Trader-Company 集成策略 | timing | Trader-Company 集成算法交易策略复现。 | 多信号集成；scr/version 目录 | 多标的日 K → workspace；集成规则抽离 | `scripts/trader_company.py` | web | 结构杂、版本目录多；完备风险中高 | — |
| 54 | C-择时类/C-VIX中国版VIX编制手册 | `cn-vix` | 中国版 VIX 编制 | timing | 按手册编制中国版 VIX/波动指数并应用。 | 期权链/隐含波动；jq data_service | 期权数据若缺口则用已实现波动代理并声明 | `scripts/cn_vix.py` | web | 期权数据缺口极高；jq 耦合 | 易混 lean-vix-dual-thrust（勿合并） |
| 55 | C-择时类/择时视角下的波动率因子.ipynb | `vol-factor-timing` | 择时视角波动率因子 | timing | C 根级独立 notebook：从择时视角使用波动率因子。 | 波动率与指数；无配套目录 | 指数日 K → 已实现波动 → workspace | `scripts/vol_factor_timing.py` | web | 仅单 notebook，无 py 目录 | — |
| 56 | D-组合优化/DE算法下的组合优化 | `de-portfolio-opt` | 差分进化组合优化 | portfolio | 用差分进化（DE）在约束下优化组合权重。 | 收益/协方差；有 py | 多标的日收益 → workspace；优化尽量纯 Python | `scripts/de_portfolio_opt.py` | web | DE 实现需自包含；禁止共享 quant 包 | 易混 lean-mean-variance、lean-param-grid-optimize |
| 57 | D-组合优化/MLT_TSMOM | `mlt-tsmom` | 多任务时序动量组合 | portfolio | 深度多任务学习构造时序动量组合（MLT_TSMOM）。 | 多资产收益；tushare + torch 等 | 多标的日 K → workspace；DL 路径标明沙盒依赖或降级规则 TSMOM | `scripts/mlt_tsmom.py` | web | 深度学习依赖极重；优先规则版 TSMOM 降级 | 易混 lean-returns-momentum、lean-risk-parity |
| 58 | SignalMaker/alligator_indicator_timing.py | `signal-alligator` | 鳄鱼线/AO/分形信号模块 | signal | 向量化鳄鱼线、AO、分形、MACD 分类与北向信号生成器。 | OHLCV；numpy/pandas/talib | 日 K → workspace；输出 signal 序列 JSON | `scripts/signal_alligator.py` | web | 可独立；算法亦可并入 alligator-index-timing | 易混 lean-indicator-playbook、alligator-index-timing（策略技能） |
| 59 | SignalMaker/hht_signal.py | `signal-hht` | HHT/EMD/VMD 信号模块 | signal | EMD/VMD 分解与瞬时相位等 HHT 信号计算。 | 价序列；PyEMD/vmdpy/scipy/joblib | 日 K → workspace | `scripts/signal_hht.py` | web | 重依赖；建议并入/被 hht-timing 调用，保留独立 skill 名便于复用 | — |
| 60 | SignalMaker/noise_area.py | `signal-noise-area` | 日内噪声区域信号 | signal | NoiseArea：定义买卖力量平衡的噪声区域，服务日内动量。 | 分钟 OHLCV | 分钟 K → workspace | `scripts/signal_noise_area.py` | web | 宜与 etf-intraday-momentum 配套；分钟数据依赖 | — |
| 61 | SignalMaker/qrs.py | `signal-qrs` | QRS 信号生成器 | signal | QRSCreator：高低价相关、β、zscore 信号。 | high/low 序列；numpy/pandas | 日 K high/low → workspace | `scripts/signal_qrs.py` | web | 与 qrs-timing 同源；可独立模块 skill | — |
| 62 | SignalMaker/vmacd_mtm.py | `signal-vmacd-mtm` | VMACD_MTM 信号模块 | signal | 成交量 MACD 的动量 VMACD_MTM。 | volume；talib.MACD | volume 序列 → workspace | `scripts/signal_vmacd_mtm.py` | web | 与 vmacd-mtm-timing 配套；talib 可纯 Python 替代 | — |
| 63 | SignalMaker/utils.py | `signal-utils-shared` | SignalMaker 通用工具（并入） | signal | 滑动窗口等通用工具，不单独作为用户技能主路径。 | — | — | `（不单独交付；复制进各 signal skill scripts/）` | none | 并入各 SignalMaker 相关 skill，禁止仓库级共享包 | — |

## 实现优先级建议（非绑定）

1. **P0 轻量可移植**：`rsrs-timing`、`candle-shadow-factor`、`time-varying-sharpe`、`index-higher-moment`、`signal-qrs`、`signal-vmacd-mtm`
2. **P1 有 py 可抽**：多数 B/C 含 `py/`/`scr/`/`src/` 的目录
3. **P2 notebook-only**：需先抽算法再脚本化
4. **P3 重依赖/缺数据**：`cn-vix`、`mlt-tsmom`、`hht-timing`/`signal-hht`、`chip-distribution-factor`、基金持仓类、高频类

## 修订记录

| 日期 | 说明 |
|---|---|
| 2026-08-16 | 初版：按 QuantsPlaybook 目录全量映射 |
| 2026-08-16 | 分支 `new-quants-skills`：62 个独立 skill 已落地（各含 `SKILL.md` + `scripts/*.py` + `scripts/fixtures/`）；`signal-utils-shared` 按约定并入、不单独交付。重依赖项以纯 stdlib 规则/代理实现，并在 `meta.degraded` / assumptions 中声明 |
