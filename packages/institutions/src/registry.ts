import type { EvaluatorConfig } from './base.js'

const DIM = {
  growth: { 成长性: 0.3, 盈利能力: 0.25, 估值水平: 0.25, 资产质量: 0.2 },
  value: { 估值水平: 0.35, 资产质量: 0.25, 盈利能力: 0.2, 价格动量: 0.2 },
  momentum: { 价格动量: 0.35, 技术形态: 0.3, 盈利能力: 0.2, 估值水平: 0.15 },
  balanced: { 成长性: 0.2, 盈利能力: 0.2, 估值水平: 0.2, 资产质量: 0.2, 价格动量: 0.2 },
}

function cfg(
  institution: string, short: string, group: string, model: string,
  dims: Record<string, number>,
): EvaluatorConfig {
  return {
    institution, institutionShort: short, group,
    modelName: model, methodSource: 'research_style',
    description: `${institution} 多维度评估`,
    dimensions: dims,
  }
}

/** 28 institution evaluators for consolidated ratings */
export const EVALUATOR_CONFIGS: EvaluatorConfig[] = [
  cfg('高盛 Goldman Sachs', 'GS', '国际投行', 'GIR Multi-Factor', DIM.balanced),
  cfg('摩根士丹利 Morgan Stanley', 'MS', '国际投行', 'Quantitative', DIM.momentum),
  cfg('摩根大通 JPMorgan', 'JPM', '国际投行', 'Equity Research', DIM.balanced),
  cfg('瑞银 UBS', 'UBS', '国际投行', 'HOLT Framework', DIM.value),
  cfg('花旗 Citi', 'Citi', '国际投行', 'Valuation Model', DIM.value),
  cfg('瑞信 Credit Suisse', 'CS', '国际投行', 'HOLT+', DIM.balanced),
  cfg('巴克莱 Barclays', 'Barclays', '国际投行', 'European Model', DIM.balanced),
  cfg('汇丰 HSBC', 'HSBC', '国际投行', 'Asia Focus', DIM.value),
  cfg('德意志银行 Deutsche Bank', 'DB', '国际投行', 'dbResearch', DIM.balanced),
  cfg('中金公司 CICC', 'CICC', '国内券商', '四维评分', DIM.growth),
  cfg('中信证券 CITIC', 'CITIC', '国内券商', '量化评分', DIM.balanced),
  cfg('华泰证券 Huatai', 'Huatai', '国内券商', '多因子模型', DIM.momentum),
  cfg('招商证券 CMS', 'CMS', '国内券商', '核心资产', DIM.value),
  cfg('国泰君安 GTJA', 'GTJA', '国内券商', 'CAPM+多因子', DIM.balanced),
  cfg('全国社保基金', '社保', '国家队', '长期价值', DIM.value),
  cfg('中央汇金', '汇金', '国家队', '稳健配置', DIM.value),
  cfg('证金公司', '证金', '国家队', '市场稳定', DIM.balanced),
  cfg('国家大基金', '大基金', '国家队', '产业投资', DIM.growth),
  cfg('北向资金', '北向', '其他', '行为推断', DIM.momentum),
  cfg('技术指标', '技术', '其他', 'TA Composite', { 技术形态: 0.5, 价格动量: 0.3, 估值水平: 0.2 }),
  cfg('美银 BofA', 'BofA', '补充机构', 'Quant Model', DIM.momentum),
  cfg('野村 Nomura', 'Nomura', '补充机构', 'Asia Model', DIM.balanced),
  cfg('Bernstein', 'Bernstein', '补充机构', 'Deep Research', DIM.value),
  cfg('易方达基金', '易方达', '补充机构', '主动选股', DIM.growth),
  cfg('东方红资管', '东方红', '补充机构', '价值成长', DIM.balanced),
  cfg('高瓴资本', '高瓴', '补充机构', '长期主义', DIM.growth),
  cfg('游资情绪', '游资', '补充机构', '行为推断', { 价格动量: 0.4, 技术形态: 0.4, 估值水平: 0.2 }),
  cfg('Bridgewater', 'Bridgewater', '补充机构', 'All Weather', DIM.balanced),
]
