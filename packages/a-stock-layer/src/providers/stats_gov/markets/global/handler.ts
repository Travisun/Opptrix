/**
 * Global macro data provider — fetches economic indicators via stats.gov.cn + jin10 datacenter.
 *
 * Data sources:
 *   - China: https://data.stats.gov.cn/easyquery.htm (National Bureau of Statistics)
 *   - Global: https://datacenter.jin10.com (Jin10, covers US/EU/JP/UK/DE/CH/AU/CA)
 */

import { httpGet } from '../../../../utils/http.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'

const HEADERS = {
  Referer: 'https://data.stats.gov.cn/',
  Accept: 'application/json, text/javascript, */*; q=0.01',
}

const JIN10_HEADERS = {
  Referer: 'https://www.jin10.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
}

// ── China indicators (stats.gov.cn) ──

interface StatsGovIndicator {
  zb: string
  cn: string
  name: string
  unit: string
}

const CHINA_MAP: Record<string, StatsGovIndicator> = {
  GDP: { zb: 'A0E0F', cn: 'E0103', name: 'GDP', unit: '100M CNY' },
  CPI: { zb: 'A010101', cn: 'E0103', name: 'CPI YoY', unit: '%' },
  PPI: { zb: 'A010201', cn: 'E0103', name: 'PPI YoY', unit: '%' },
  PMI: { zb: 'A0E01', cn: 'E0103', name: 'Manufacturing PMI', unit: '' },
  M2: { zb: 'A0E02', cn: 'E0103', name: 'M2 Money Supply', unit: '100M CNY' },
  SOCIAL_FINANCE: { zb: 'A0E0D', cn: 'E0103', name: 'Total Social Financing', unit: '100M CNY' },
  INDUSTRIAL: { zb: 'A0E0C', cn: 'E0103', name: 'Industrial Value-Added YoY', unit: '%' },
  UNEMPLOYMENT: { zb: 'A020101', cn: 'E0103', name: 'Urban Unemployment Rate', unit: '%' },
  RETAIL: { zb: 'A0B0101', cn: 'E0103', name: 'Retail Sales YoY', unit: '%' },
  FIXED_ASSET: { zb: 'A0E03', cn: 'E0103', name: 'Fixed Asset Investment YTD YoY', unit: '%' },
  FISCAL: { zb: 'A0I0101', cn: 'E0103', name: 'Fiscal Revenue YTD', unit: '100M CNY' },
  ELECTRICITY: { zb: 'A0H0101', cn: 'E0103', name: 'Total Electricity Consumption', unit: '100M kWh' },
  PASSENGER: { zb: 'A0M0101', cn: 'E0103', name: 'Total Passenger Volume', unit: '10K persons' },
  FREIGHT: { zb: 'A0M0201', cn: 'E0103', name: 'Total Freight Volume', unit: '10K tons' },
  REAL_ESTATE: { zb: 'A0E06', cn: 'E0103', name: 'Real Estate Investment YTD YoY', unit: '%' },
  TRADE: { zb: 'A0H0301', cn: 'E0103', name: 'Total Imports & Exports', unit: '100M USD' },
  FDI: { zb: 'A0E05', cn: 'E0103', name: 'Actual FDI', unit: '100M USD' },
  NEW_LOAN: { zb: 'A0E0A', cn: 'E0103', name: 'New RMB Loans', unit: '100M CNY' },
}

const CHINA_DEFAULTS = ['GDP', 'CPI', 'PPI', 'PMI', 'M2', 'SOCIAL_FINANCE', 'INDUSTRIAL', 'UNEMPLOYMENT', 'RETAIL', 'FIXED_ASSET']

// ── Global indicators (jin10 datacenter) ──

interface Jin10Indicator {
  country: string
  reportType: string
  name: string
  unit: string
}

const GLOBAL_MAP: Record<string, Jin10Indicator> = {
  // US
  US_GDP: { country: 'US', reportType: 'dc_us_gdp_yoy', name: 'US GDP YoY', unit: '%' },
  US_CPI: { country: 'US', reportType: 'dc_us_cpi_yoy', name: 'US CPI YoY', unit: '%' },
  US_CORE_CPI: { country: 'US', reportType: 'dc_us_core_cpi_yoy', name: 'US Core CPI YoY', unit: '%' },
  US_PPI: { country: 'US', reportType: 'dc_us_ppi_yoy', name: 'US PPI YoY', unit: '%' },
  US_CORE_PPI: { country: 'US', reportType: 'dc_us_core_ppi_yoy', name: 'US Core PPI YoY', unit: '%' },
  US_PMI: { country: 'US', reportType: 'dc_us_pmi', name: 'US Markit Manufacturing PMI', unit: '' },
  US_ISM_PMI: { country: 'US', reportType: 'dc_us_ism_pmi', name: 'US ISM Manufacturing PMI', unit: '' },
  US_NON_FARM: { country: 'US', reportType: 'dc_us_non_farm', name: 'US Non-Farm Payrolls', unit: 'K' },
  US_UNEMPLOYMENT: { country: 'US', reportType: 'dc_us_unemployment_rate', name: 'US Unemployment Rate', unit: '%' },
  US_ADP: { country: 'US', reportType: 'dc_us_adp_employment', name: 'US ADP Employment Change', unit: 'K' },
  US_INITIAL_JOBLESS: { country: 'US', reportType: 'dc_us_initial_jobless', name: 'US Initial Jobless Claims', unit: 'K' },
  US_RETAIL: { country: 'US', reportType: 'dc_us_retail_sales', name: 'US Retail Sales MoM', unit: '%' },
  US_TRADE_BALANCE: { country: 'US', reportType: 'dc_us_trade_balance', name: 'US Trade Balance', unit: '10B USD' },
  US_FED_RATE: { country: 'US', reportType: 'dc_us_interest_rate', name: 'Fed Interest Rate Decision', unit: '%' },
  US_CONSUMER_CONFIDENCE: { country: 'US', reportType: 'dc_us_cb_consumer_confidence', name: 'CB Consumer Confidence', unit: '' },
  US_CORE_PCE: { country: 'US', reportType: 'dc_us_core_pce_price', name: 'US Core PCE Price Index YoY', unit: '%' },
  US_INDUSTRIAL_PRODUCTION: { country: 'US', reportType: 'dc_us_industrial_production', name: 'US Industrial Production MoM', unit: '%' },
  US_DURABLE_GOODS: { country: 'US', reportType: 'dc_us_durable_goods_orders', name: 'US Durable Goods Orders MoM', unit: '%' },
  US_FACTORY_ORDERS: { country: 'US', reportType: 'dc_us_factory_orders', name: 'US Factory Orders MoM', unit: '%' },
  US_SERVICES_PMI: { country: 'US', reportType: 'dc_us_services_pmi', name: 'US Markit Services PMI', unit: '' },
  US_ISM_NON_PMI: { country: 'US', reportType: 'dc_us_ism_non_pmi', name: 'US ISM Non-Manufacturing PMI', unit: '' },
  US_NAHB: { country: 'US', reportType: 'dc_us_nahb_house_market_index', name: 'US NAHB Housing Market Index', unit: '' },
  US_HOUSE_STARTS: { country: 'US', reportType: 'dc_us_house_starts', name: 'US Housing Starts Annualized', unit: 'K' },
  US_NEW_HOME_SALES: { country: 'US', reportType: 'dc_us_new_home_sales', name: 'US New Home Sales Annualized', unit: 'K' },
  US_EXIST_HOME_SALES: { country: 'US', reportType: 'dc_us_exist_home_sales', name: 'US Existing Home Sales Annualized', unit: 'M' },
  US_HOUSE_PRICE: { country: 'US', reportType: 'dc_us_house_price_index', name: 'US FHFA House Price Index MoM', unit: '%' },
  US_SPCS20: { country: 'US', reportType: 'dc_us_spcs20', name: 'US S&P/CS20 Home Price YoY', unit: '%' },
  US_PENDING_HOME: { country: 'US', reportType: 'dc_us_pending_home_sales', name: 'US Pending Home Sales MoM', unit: '%' },
  US_BUILDING_PERMITS: { country: 'US', reportType: 'dc_us_building_permits', name: 'US Building Permits', unit: 'K' },
  US_MICHIGAN_SENTIMENT: { country: 'US', reportType: 'dc_us_michigan_consumer_sentiment', name: 'Michigan Consumer Sentiment', unit: '' },
  US_NFIB: { country: 'US', reportType: 'dc_us_nfib_small_business', name: 'NFIB Small Business Optimism', unit: '' },
  US_RIG_COUNT: { country: 'US', reportType: 'dc_us_rig_count', name: 'Baker Hughes Rig Count', unit: '' },
  US_CURRENT_ACCOUNT: { country: 'US', reportType: 'dc_us_current_account', name: 'US Current Account', unit: '10B USD' },
  US_BUSINESS_INVENTORIES: { country: 'US', reportType: 'dc_us_business_inventories', name: 'US Business Inventories MoM', unit: '%' },
  US_REAL_CONSUMER_SPENDING: { country: 'US', reportType: 'dc_us_real_consumer_spending', name: 'US Real Consumer Spending QoQ', unit: '%' },
  US_PERSONAL_SPENDING: { country: 'US', reportType: 'dc_us_personal_spending', name: 'US Personal Spending MoM', unit: '%' },
  US_IMPORT_PRICE: { country: 'US', reportType: 'dc_us_import_price', name: 'US Import Price Index MoM', unit: '%' },
  US_EXPORT_PRICE: { country: 'US', reportType: 'dc_us_export_price', name: 'US Export Price Index MoM', unit: '%' },
  US_JOB_CUTS: { country: 'US', reportType: 'dc_us_job_cuts', name: 'Challenger Job Cuts', unit: 'K' },
  US_LMCI: { country: 'US', reportType: 'dc_us_lmci', name: 'Fed Labor Market Conditions Index', unit: '' },
  US_API_CRUDE: { country: 'US', reportType: 'dc_us_api_crude_stock', name: 'US API Crude Oil Stock Change', unit: 'MB' },
  US_EIA_CRUDE: { country: 'US', reportType: 'dc_us_eia_crude_stock', name: 'US EIA Crude Oil Stock Change', unit: 'MB' },
  US_EIA_PRODUCTION: { country: 'US', reportType: 'dc_us_crude_production', name: 'US Crude Oil Production', unit: 'KB/D' },

  // CFTC / Institutional
  CFTC_NC_CURRENCY: { country: 'GLOBAL', reportType: 'dc_cftc_nc_currency_holding', name: 'CFTC Non-Commercial Currency Positions', unit: 'contracts' },
  CFTC_NC_COMMODITY: { country: 'GLOBAL', reportType: 'dc_cftc_nc_commodity_holding', name: 'CFTC Non-Commercial Commodity Positions', unit: 'contracts' },
  CFTC_MERCHANT_CURRENCY: { country: 'GLOBAL', reportType: 'dc_cftc_merchant_currency_holding', name: 'CFTC Commercial Currency Positions', unit: 'contracts' },
  CFTC_MERCHANT_COMMODITY: { country: 'GLOBAL', reportType: 'dc_cftc_merchant_commodity_holding', name: 'CFTC Commercial Commodity Positions', unit: 'contracts' },
  CME_COMMODITY: { country: 'GLOBAL', reportType: 'dc_cme_merchant_commodity_holding', name: 'CME Precious Metals Positions', unit: 'contracts' },

  // Global Commodity
  GOLD_PRICE: { country: 'GLOBAL', reportType: 'dc_cons_gold', name: 'Gold Price (SPDR)', unit: 'USD/oz' },
  SILVER_PRICE: { country: 'GLOBAL', reportType: 'dc_cons_silver', name: 'Silver Price (iShares)', unit: 'USD/oz' },
  OPEC_PRODUCTION: { country: 'GLOBAL', reportType: 'dc_opec_month', name: 'OPEC Monthly Oil Production', unit: 'MB/D' },
  LME_HOLDING: { country: 'GLOBAL', reportType: 'dc_euro_lme_holding', name: 'LME Metal Holdings', unit: 'lots' },
  LME_STOCK: { country: 'GLOBAL', reportType: 'dc_euro_lme_stock', name: 'LME Metal Stock', unit: 'tons' },
  BDI: { country: 'GLOBAL', reportType: 'dc_shipping_bdi', name: 'Baltic Dry Index', unit: '' },
  BCI: { country: 'GLOBAL', reportType: 'dc_shipping_bci', name: 'Baltic Capesize Index', unit: '' },
  BPI: { country: 'GLOBAL', reportType: 'dc_shipping_bpi', name: 'Baltic Panamax Index', unit: '' },
  BCTI: { country: 'GLOBAL', reportType: 'dc_shipping_bcti', name: 'Baltic Clean Tanker Index', unit: '' },
  SOX_INDEX: { country: 'GLOBAL', reportType: 'dc_global_sox_index', name: 'Philadelphia Semiconductor Index', unit: '' },

  // Hong Kong
  HK_CPI: { country: 'HK', reportType: 'dc_hk_cpi', name: 'Hong Kong CPI', unit: '%' },
  HK_CPI_RATIO: { country: 'HK', reportType: 'dc_hk_cpi_ratio', name: 'Hong Kong CPI YoY', unit: '%' },
  HK_UNEMPLOYMENT: { country: 'HK', reportType: 'dc_hk_unemployment_rate', name: 'Hong Kong Unemployment Rate', unit: '%' },
  HK_GDP: { country: 'HK', reportType: 'dc_hk_gdp', name: 'Hong Kong GDP', unit: '' },
  HK_GDP_RATIO: { country: 'HK', reportType: 'dc_hk_gdp_ratio', name: 'Hong Kong GDP YoY', unit: '%' },
  HK_BUILDING_VOLUME: { country: 'HK', reportType: 'dc_hk_building_volume', name: 'Hong Kong Building Volume', unit: '' },
  HK_BUILDING_AMOUNT: { country: 'HK', reportType: 'dc_hk_building_amount', name: 'Hong Kong Building Amount', unit: '' },
  HK_TRADE_DIFF: { country: 'HK', reportType: 'dc_hk_trade_diff_ratio', name: 'Hong Kong Trade Balance YoY', unit: '%' },
  HK_PPI: { country: 'HK', reportType: 'dc_hk_ppi', name: 'Hong Kong Manufacturing PPI YoY', unit: '%' },

  // Eurozone
  EU_GDP: { country: 'EU', reportType: 'dc_euro_gdp_yoy', name: 'Eurozone GDP YoY', unit: '%' },
  EU_CPI: { country: 'EU', reportType: 'dc_euro_cpi_yoy', name: 'Eurozone CPI YoY', unit: '%' },
  EU_CPI_MOM: { country: 'EU', reportType: 'dc_euro_cpi_mom', name: 'Eurozone CPI MoM', unit: '%' },
  EU_PPI: { country: 'EU', reportType: 'dc_euro_ppi_mom', name: 'Eurozone PPI MoM', unit: '%' },
  EU_PMI: { country: 'EU', reportType: 'dc_euro_manufacturing_pmi', name: 'Eurozone Manufacturing PMI', unit: '' },
  EU_SERVICES_PMI: { country: 'EU', reportType: 'dc_euro_services_pmi', name: 'Eurozone Services PMI', unit: '' },
  EU_RETAIL: { country: 'EU', reportType: 'dc_euro_retail_sales_mom', name: 'Eurozone Retail Sales MoM', unit: '%' },
  EU_UNEMPLOYMENT: { country: 'EU', reportType: 'dc_euro_unemployment_rate', name: 'Eurozone Unemployment Rate', unit: '%' },
  EU_TRADE_BALANCE: { country: 'EU', reportType: 'dc_euro_trade_balance', name: 'Eurozone Trade Balance', unit: '10B EUR' },
  EU_INDUSTRIAL_PRODUCTION: { country: 'EU', reportType: 'dc_euro_industrial_production_mom', name: 'Eurozone Industrial Production MoM', unit: '%' },
  EU_ZEW: { country: 'EU', reportType: 'dc_euro_zew_economic_sentiment', name: 'Eurozone ZEW Economic Sentiment', unit: '' },
  EU_SENTIX: { country: 'EU', reportType: 'dc_euro_sentix_investor_confidence', name: 'Eurozone Sentix Investor Confidence', unit: '' },
  EU_EMPLOYMENT_CHANGE: { country: 'EU', reportType: 'dc_euro_employment_change_qoq', name: 'Eurozone Employment Change QoQ', unit: '%' },
  EU_CURRENT_ACCOUNT: { country: 'EU', reportType: 'dc_euro_current_account', name: 'Eurozone Current Account', unit: '10B EUR' },

  // Japan
  JP_BANK_RATE: { country: 'JP', reportType: 'dc_japan_interest_rate', name: 'BOJ Interest Rate Decision', unit: '%' },
  JP_CPI: { country: 'JP', reportType: 'dc_japan_cpi_yoy', name: 'Japan CPI YoY', unit: '%' },
  JP_CORE_CPI: { country: 'JP', reportType: 'dc_japan_core_cpi_yoy', name: 'Japan Core CPI YoY', unit: '%' },
  JP_UNEMPLOYMENT: { country: 'JP', reportType: 'dc_japan_unemployment_rate', name: 'Japan Unemployment Rate', unit: '%' },
  JP_LEADING_INDICATOR: { country: 'JP', reportType: 'dc_japan_leading_indicator', name: 'Japan Leading Indicator', unit: '' },

  // UK
  UK_GDP_QUARTERLY: { country: 'UK', reportType: 'dc_uk_gdp_quarterly', name: 'UK GDP QoQ Prelim', unit: '%' },
  UK_GDP_YEARLY: { country: 'UK', reportType: 'dc_uk_gdp_yoy', name: 'UK GDP YoY Prelim', unit: '%' },
  UK_CPI_MONTHLY: { country: 'UK', reportType: 'dc_uk_cpi_mom', name: 'UK CPI MoM', unit: '%' },
  UK_CPI_YEARLY: { country: 'UK', reportType: 'dc_uk_cpi_yoy', name: 'UK CPI YoY', unit: '%' },
  UK_CORE_CPI_MONTHLY: { country: 'UK', reportType: 'dc_uk_core_cpi_mom', name: 'UK Core CPI MoM', unit: '%' },
  UK_CORE_CPI_YEARLY: { country: 'UK', reportType: 'dc_uk_core_cpi_yoy', name: 'UK Core CPI YoY', unit: '%' },
  UK_PPI: { country: 'UK', reportType: 'dc_uk_ppi_yoy', name: 'UK PPI YoY', unit: '%' },
  UK_RETAIL_MONTHLY: { country: 'UK', reportType: 'dc_uk_retail_sales_mom', name: 'UK Retail Sales MoM', unit: '%' },
  UK_RETAIL_YEARLY: { country: 'UK', reportType: 'dc_uk_retail_sales_yoy', name: 'UK Retail Sales YoY', unit: '%' },
  UK_TRADE_BALANCE: { country: 'UK', reportType: 'dc_uk_trade_balance', name: 'UK Trade Balance', unit: '10B GBP' },
  UK_BANK_RATE: { country: 'UK', reportType: 'dc_uk_interest_rate', name: 'BOE Interest Rate Decision', unit: '%' },
  UK_UNEMPLOYMENT: { country: 'UK', reportType: 'dc_uk_unemployment_rate', name: 'UK Unemployment Rate', unit: '%' },
  UK_HALIFAX_MONTHLY: { country: 'UK', reportType: 'dc_uk_halifax_monthly', name: 'UK Halifax House Price MoM', unit: '%' },
  UK_HALIFAX_YEARLY: { country: 'UK', reportType: 'dc_uk_halifax_yearly', name: 'UK Halifax House Price YoY', unit: '%' },
  UK_RIGHTMOVE_MONTHLY: { country: 'UK', reportType: 'dc_uk_rightmove_monthly', name: 'UK Rightmove House Price MoM', unit: '%' },
  UK_RIGHTMOVE_YEARLY: { country: 'UK', reportType: 'dc_uk_rightmove_yearly', name: 'UK Rightmove House Price YoY', unit: '%' },

  // Germany
  DE_IFO: { country: 'DE', reportType: 'dc_germany_ifo', name: 'Germany IFO Business Climate', unit: '' },
  DE_CPI_MONTHLY: { country: 'DE', reportType: 'dc_germany_cpi_mom', name: 'Germany CPI MoM Final', unit: '%' },
  DE_CPI_YEARLY: { country: 'DE', reportType: 'dc_germany_cpi_yoy', name: 'Germany CPI YoY Final', unit: '%' },
  DE_TRADE_BALANCE: { country: 'DE', reportType: 'dc_germany_trade_balance', name: 'Germany Trade Balance SA', unit: '10B EUR' },
  DE_GDP: { country: 'DE', reportType: 'dc_germany_gdp_yoy', name: 'Germany GDP YoY', unit: '%' },
  DE_RETAIL_MONTHLY: { country: 'DE', reportType: 'dc_germany_retail_sales_mom', name: 'Germany Retail Sales MoM', unit: '%' },
  DE_RETAIL_YEARLY: { country: 'DE', reportType: 'dc_germany_retail_sales_yoy', name: 'Germany Retail Sales YoY', unit: '%' },
  DE_ZEW: { country: 'DE', reportType: 'dc_germany_zew_economic_sentiment', name: 'Germany ZEW Economic Sentiment', unit: '' },

  // Switzerland
  CH_SVME: { country: 'CH', reportType: 'dc_swiss_svme', name: 'Switzerland SVME PMI', unit: '' },
  CH_TRADE_BALANCE: { country: 'CH', reportType: 'dc_swiss_trade_balance', name: 'Switzerland Trade Balance', unit: '10B CHF' },
  CH_CPI: { country: 'CH', reportType: 'dc_swiss_cpi_yoy', name: 'Switzerland CPI YoY', unit: '%' },
  CH_GDP_QUARTERLY: { country: 'CH', reportType: 'dc_swiss_gdp_qoq', name: 'Switzerland GDP QoQ', unit: '%' },
  CH_GDP_YEARLY: { country: 'CH', reportType: 'dc_swiss_gdp_yoy', name: 'Switzerland GDP YoY', unit: '%' },
  CH_BANK_RATE: { country: 'CH', reportType: 'dc_swiss_interest_rate', name: 'SNB Interest Rate Decision', unit: '%' },

  // Interest Rates
  EU_INTERN_RATE: { country: 'EU', reportType: 'dc_euro_interest_rate', name: 'ECB Interest Rate Decision', unit: '%' },
  NZ_INTERN_RATE: { country: 'NZ', reportType: 'dc_newzealand_interest_rate', name: 'RBNZ Interest Rate Decision', unit: '%' },
  CN_INTERN_RATE: { country: 'CN', reportType: 'dc_china_interest_rate', name: 'PBOC Interest Rate Decision', unit: '%' },
  RU_INTERN_RATE: { country: 'RU', reportType: 'dc_russia_interest_rate', name: 'CBR Interest Rate Decision', unit: '%' },
  IN_INTERN_RATE: { country: 'IN', reportType: 'dc_india_interest_rate', name: 'RBI Interest Rate Decision', unit: '%' },
  BR_INTERN_RATE: { country: 'BR', reportType: 'dc_brazil_interest_rate', name: 'COPOM Interest Rate Decision', unit: '%' },

  // Australia
  AU_RETAIL: { country: 'AU', reportType: 'dc_australia_retail_sales_mom', name: 'Australia Retail Sales MoM', unit: '%' },
  AU_TRADE_BALANCE: { country: 'AU', reportType: 'dc_australia_trade_balance', name: 'Australia Trade Balance', unit: '10B AUD' },
  AU_UNEMPLOYMENT: { country: 'AU', reportType: 'dc_australia_unemployment_rate', name: 'Australia Unemployment Rate', unit: '%' },
  AU_PPI: { country: 'AU', reportType: 'dc_australia_ppi_qoq', name: 'Australia PPI QoQ', unit: '%' },
  AU_CPI_QUARTERLY: { country: 'AU', reportType: 'dc_australia_cpi_qoq', name: 'Australia CPI QoQ', unit: '%' },
  AU_CPI_YEARLY: { country: 'AU', reportType: 'dc_australia_cpi_yoy', name: 'Australia CPI YoY', unit: '%' },
  AU_BANK_RATE: { country: 'AU', reportType: 'dc_australia_interest_rate', name: 'RBA Interest Rate Decision', unit: '%' },

  // Canada
  CA_GDP_MONTHLY: { country: 'CA', reportType: 'dc_canada_gdp_mom', name: 'Canada GDP MoM', unit: '%' },
  CA_CPI_MONTHLY: { country: 'CA', reportType: 'dc_canada_cpi_mom', name: 'Canada CPI MoM', unit: '%' },
  CA_CPI_YEARLY: { country: 'CA', reportType: 'dc_canada_cpi_yoy', name: 'Canada CPI YoY', unit: '%' },
  CA_CORE_CPI_MONTHLY: { country: 'CA', reportType: 'dc_canada_core_cpi_mom', name: 'Canada Core CPI MoM', unit: '%' },
  CA_CORE_CPI_YEARLY: { country: 'CA', reportType: 'dc_canada_core_cpi_yoy', name: 'Canada Core CPI YoY', unit: '%' },
  CA_UNEMPLOYMENT: { country: 'CA', reportType: 'dc_canada_unemployment_rate', name: 'Canada Unemployment Rate', unit: '%' },
  CA_TRADE_BALANCE: { country: 'CA', reportType: 'dc_canada_trade_balance', name: 'Canada Trade Balance', unit: '10B CAD' },
  CA_RETAIL: { country: 'CA', reportType: 'dc_canada_retail_sales_mom', name: 'Canada Retail Sales MoM', unit: '%' },
  CA_BANK_RATE: { country: 'CA', reportType: 'dc_canada_interest_rate', name: 'BOC Interest Rate Decision', unit: '%' },
  CA_NEW_HOUSE: { country: 'CA', reportType: 'dc_canada_housing_starts', name: 'Canada Housing Starts', unit: 'K' },
}

const GLOBAL_DEFAULTS = [
  'US_GDP', 'US_CPI', 'US_PPI', 'US_NON_FARM', 'US_UNEMPLOYMENT', 'US_FED_RATE',
  'EU_GDP', 'EU_CPI', 'EU_PMI', 'EU_UNEMPLOYMENT', 'EU_INTERN_RATE',
  'JP_CPI', 'JP_UNEMPLOYMENT', 'JP_BANK_RATE',
  'UK_GDP_YEARLY', 'UK_CPI_YEARLY', 'UK_UNEMPLOYMENT', 'UK_BANK_RATE',
  'AU_CPI_YEARLY', 'AU_UNEMPLOYMENT', 'AU_BANK_RATE',
  'CA_CPI_YEARLY', 'CA_UNEMPLOYMENT', 'CA_BANK_RATE',
  'CN_INTERN_RATE',
]

export class StatsGovMarketHandler extends MarketHandlerShell {

  private formatDate(dateCode: string) {
    if (dateCode.length === 6) return `${dateCode.slice(0, 4)}-${dateCode.slice(4)}`
    return dateCode
  }

  private async fetchChinaIndicator(key: string): Promise<Record<string, unknown>[] | null> {
    const info = CHINA_MAP[key]
    if (!info) return null

    try {
      const json = await httpGet('https://data.stats.gov.cn/easyquery.htm', {
        m: 'QueryData',
        dbcode: info.cn,
        rowcode: 'zb',
        colcode: 'sj',
        wds: '[]',
        dfwds: `[{"wdcode":"zb","valuecode":"${info.zb}"}]`,
      }, 10000, HEADERS)

      const nodes = (json.returndata as { datanodes?: Record<string, unknown>[] })?.datanodes ?? []
      if (!nodes.length) return null

      const results: Record<string, unknown>[] = []
      for (const node of nodes) {
        const wds = (node.wds ?? []) as { wdcode?: string; valuecode?: string }[]
        const dateCode = wds.find(w => w.wdcode === 'sj')?.valuecode ?? ''
        const dataObj = node.data as { data?: unknown } | undefined
        const value = dataObj?.data ?? node.value
        if (value == null || value === '') continue
        const val = Number(value)
        if (!Number.isFinite(val)) continue
        results.push({
          indicator: key,
          indicatorName: info.name,
          date: this.formatDate(dateCode),
          value: val,
          unit: info.unit,
          country: 'CN',
          source: 'NBS',
        })
      }
      return results.length ? results : null
    } catch {
      return null
    }
  }

  private async fetchGlobalIndicator(key: string): Promise<Record<string, unknown>[] | null> {
    const info = GLOBAL_MAP[key]
    if (!info) return null

    try {
      const json = await httpGet('https://datacenter.jin10.com/get', {
        max: '24',
        report_type: info.reportType,
      }, 15000, JIN10_HEADERS)

      const data = json?.data as Record<string, unknown>[] | undefined
      if (!data?.length) return null

      const results: Record<string, unknown>[] = []
      for (const item of data) {
        const val = Number(item.data ?? item.value ?? item.now)
        if (!Number.isFinite(val)) continue
        const dateStr = String(item.date ?? item.report_date ?? '').slice(0, 10)
        results.push({
          indicator: key,
          indicatorName: info.name,
          date: dateStr,
          value: val,
          unit: info.unit,
          country: info.country,
          source: 'Jin10',
        })
      }
      return results.length ? results : null
    } catch {
      return null
    }
  }

  /**
   * Global macro indicator query — fetches economic data via stats.gov.cn + jin10 datacenter.
   *
   * @param indicator - indicator key; empty returns CN core + global core indicators
   * @returns macro indicator data array; null if no data
   */
  async macroIndicator(indicator = '') {
    const want = indicator.trim()
    const results: Record<string, unknown>[] = []

    const isChinaKey = want && (want in CHINA_MAP || want.toUpperCase() in CHINA_MAP)
    const isGlobalKey = want && want.toUpperCase() in GLOBAL_MAP

    // Query China indicators
    if (!want || isChinaKey) {
      const chinaKeys = want
        ? [want in CHINA_MAP ? want : want.toUpperCase()]
        : CHINA_DEFAULTS
      for (const key of chinaKeys) {
        const data = await this.fetchChinaIndicator(key in CHINA_MAP ? key : key.toUpperCase())
        if (data) results.push(...data)
      }
    }

    // Query global indicators
    if (!want || isGlobalKey) {
      const globalKeys = want
        ? [want.toUpperCase()]
        : GLOBAL_DEFAULTS
      for (const key of globalKeys) {
        const data = await this.fetchGlobalIndicator(key)
        if (data) results.push(...data)
      }
    }

    return results.length ? results : null
  }

}
