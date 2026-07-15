/** Auto-derived from data.eastmoney.com/cjsj left nav — do not hand-edit foreign/hyzs lists lightly. */

export interface EmMacroForeignItem {
  key: string
  name: string
  indicatorId: string
  mkt: number
  country: string
  unit: string
}

export interface EmMacroIndustryItem {
  key: string
  name: string
  indicatorId: string
}

/** foreign_X_Y → RPT_ECONOMICVALUE_{suffix} */
export const EM_FOREIGN_MKT_SUFFIX = [
  "USANEW", "GER", "CH", "JPAN", "BRITAIN", "AUSTRALIA", "EURONEW", "CA", "HK",
] as const

export const EM_MACRO_FOREIGN: EmMacroForeignItem[] = 
[
  {
    "key": "foreign_0_0",
    "name": "ISM制造业指数",
    "indicatorId": "EMG00002790",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_1",
    "name": "ISM非制造业指数",
    "indicatorId": "EMG00002791",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_10",
    "name": "零售销售月率",
    "indicatorId": "EMG00003721",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_11",
    "name": "消费者物价指数月率",
    "indicatorId": "EMG00000770",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_12",
    "name": "消费者物价指数年率",
    "indicatorId": "EMG00000733",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_13",
    "name": "核心消费者物价指数月率",
    "indicatorId": "EMG00000771",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_14",
    "name": "核心消费者物价指数年率",
    "indicatorId": "EMG00000746",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_15",
    "name": "新屋开工",
    "indicatorId": "EMG00003224",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_16",
    "name": "密歇根消费者信心指数初值",
    "indicatorId": "EMG00002846",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_17",
    "name": "成屋销售",
    "indicatorId": "EMG00003078",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_18",
    "name": "耐用品订单月率",
    "indicatorId": "EMG00342254",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_19",
    "name": "耐用品订单月率(除运输外)",
    "indicatorId": "EMG01421900",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_2",
    "name": "非农就业人数变化",
    "indicatorId": "EMG00152118",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_20",
    "name": "咨商会消费者信心指数",
    "indicatorId": "EMG00002847",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_21",
    "name": "GDP年率初值",
    "indicatorId": "EMG00159633",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_22",
    "name": "央行公布利率决议（上限）",
    "indicatorId": "EMG00342250",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_3",
    "name": "贸易帐",
    "indicatorId": "EMG00000700",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_4",
    "name": "失业率",
    "indicatorId": "EMG00001039",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_5",
    "name": "未决房屋销售月率",
    "indicatorId": "EMG00342249",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_6",
    "name": "生产者物价指数月率",
    "indicatorId": "EMG00177897",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_7",
    "name": "核心生产者物价指数月率",
    "indicatorId": "EMG00177909",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_8",
    "name": "核心生产者物价指数年率",
    "indicatorId": "EMG00177799",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_0_9",
    "name": "核心零售销售月率",
    "indicatorId": "EMG00003722",
    "mkt": 0,
    "country": "美国",
    "unit": ""
  },
  {
    "key": "foreign_1_0",
    "name": "Ifo商业景气指数",
    "indicatorId": "EMG00179154",
    "mkt": 1,
    "country": "德国",
    "unit": ""
  },
  {
    "key": "foreign_1_1",
    "name": "消费者物价指数月率终值",
    "indicatorId": "EMG00009758",
    "mkt": 1,
    "country": "德国",
    "unit": ""
  },
  {
    "key": "foreign_1_2",
    "name": "消费者物价指数年率终值",
    "indicatorId": "EMG00009756",
    "mkt": 1,
    "country": "德国",
    "unit": ""
  },
  {
    "key": "foreign_1_3",
    "name": "贸易帐(季调後)",
    "indicatorId": "EMG00009753",
    "mkt": 1,
    "country": "德国",
    "unit": ""
  },
  {
    "key": "foreign_1_4",
    "name": "GDP",
    "indicatorId": "EMG00009720",
    "mkt": 1,
    "country": "德国",
    "unit": ""
  },
  {
    "key": "foreign_1_5",
    "name": "实际零售销售月率",
    "indicatorId": "EMG01333186",
    "mkt": 1,
    "country": "德国",
    "unit": ""
  },
  {
    "key": "foreign_1_6",
    "name": "实际零售销售年率",
    "indicatorId": "EMG01333192",
    "mkt": 1,
    "country": "德国",
    "unit": ""
  },
  {
    "key": "foreign_1_7",
    "name": "ZEW经济景气指数",
    "indicatorId": "EMG00172577",
    "mkt": 1,
    "country": "德国",
    "unit": ""
  },
  {
    "key": "foreign_2_0",
    "name": "SVME采购经理人指数",
    "indicatorId": "EMG00341602",
    "mkt": 2,
    "country": "瑞士",
    "unit": ""
  },
  {
    "key": "foreign_2_1",
    "name": "贸易帐",
    "indicatorId": "EMG00341603",
    "mkt": 2,
    "country": "瑞士",
    "unit": ""
  },
  {
    "key": "foreign_2_2",
    "name": "消费者物价指数年率",
    "indicatorId": "EMG00341604",
    "mkt": 2,
    "country": "瑞士",
    "unit": ""
  },
  {
    "key": "foreign_2_3",
    "name": "GDP季率",
    "indicatorId": "EMG00341600",
    "mkt": 2,
    "country": "瑞士",
    "unit": ""
  },
  {
    "key": "foreign_2_4",
    "name": "GDP年率",
    "indicatorId": "EMG00341601",
    "mkt": 2,
    "country": "瑞士",
    "unit": ""
  },
  {
    "key": "foreign_2_5",
    "name": "央行公布利率决议",
    "indicatorId": "EMG00341606",
    "mkt": 2,
    "country": "瑞士",
    "unit": ""
  },
  {
    "key": "foreign_3_0",
    "name": "央行公布利率决议",
    "indicatorId": "EMG00342252",
    "mkt": 3,
    "country": "日本",
    "unit": ""
  },
  {
    "key": "foreign_3_1",
    "name": "全国消费者物价指数年率",
    "indicatorId": "EMG00005004",
    "mkt": 3,
    "country": "日本",
    "unit": ""
  },
  {
    "key": "foreign_3_2",
    "name": "全国核心消费者物价指数年率",
    "indicatorId": "EMG00158099",
    "mkt": 3,
    "country": "日本",
    "unit": ""
  },
  {
    "key": "foreign_3_3",
    "name": "失业率",
    "indicatorId": "EMG00005047",
    "mkt": 3,
    "country": "日本",
    "unit": ""
  },
  {
    "key": "foreign_3_4",
    "name": "领先指标终值",
    "indicatorId": "EMG00005117",
    "mkt": 3,
    "country": "日本",
    "unit": ""
  },
  {
    "key": "foreign_4_0",
    "name": "Halifax房价指数月率",
    "indicatorId": "EMG00342256",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_1",
    "name": "Halifax房价指数年率",
    "indicatorId": "EMG00010370",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_10",
    "name": "Rightmove房价指数年率",
    "indicatorId": "EMG00341608",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_11",
    "name": "Rightmove房价指数月率",
    "indicatorId": "EMG00341607",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_12",
    "name": "GDP季率初值",
    "indicatorId": "EMG00158277",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_13",
    "name": "GDP年率初值",
    "indicatorId": "EMG00158276",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_14",
    "name": "失业率",
    "indicatorId": "EMG00010348",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_2",
    "name": "贸易帐",
    "indicatorId": "EMG00158309",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_3",
    "name": "央行公布利率决议",
    "indicatorId": "EMG00342253",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_4",
    "name": "核心消费者物价指数年率",
    "indicatorId": "EMG00010279",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_5",
    "name": "核心消费者物价指数月率",
    "indicatorId": "EMG00010291",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_6",
    "name": "消费者物价指数年率",
    "indicatorId": "EMG00010267",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_7",
    "name": "消费者物价指数月率",
    "indicatorId": "EMG00010280",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_8",
    "name": "零售销售月率",
    "indicatorId": "EMG00158298",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_4_9",
    "name": "零售销售年率",
    "indicatorId": "EMG00158297",
    "mkt": 4,
    "country": "英国",
    "unit": ""
  },
  {
    "key": "foreign_5_0",
    "name": "零售销售月率",
    "indicatorId": "EMG00152903",
    "mkt": 5,
    "country": "澳大利亚",
    "unit": ""
  },
  {
    "key": "foreign_5_1",
    "name": "贸易帐",
    "indicatorId": "EMG01417908",
    "mkt": 5,
    "country": "澳大利亚",
    "unit": ""
  },
  {
    "key": "foreign_5_2",
    "name": "失业率",
    "indicatorId": "EMG00101141",
    "mkt": 5,
    "country": "澳大利亚",
    "unit": ""
  },
  {
    "key": "foreign_5_3",
    "name": "生产者物价指数季率",
    "indicatorId": "EMG00152722",
    "mkt": 5,
    "country": "澳大利亚",
    "unit": ""
  },
  {
    "key": "foreign_5_4",
    "name": "消费者物价指数季率",
    "indicatorId": "EMG00101104",
    "mkt": 5,
    "country": "澳大利亚",
    "unit": ""
  },
  {
    "key": "foreign_5_5",
    "name": "消费者物价指数年率",
    "indicatorId": "EMG00101093",
    "mkt": 5,
    "country": "澳大利亚",
    "unit": ""
  },
  {
    "key": "foreign_5_6",
    "name": "央行公布利率决议",
    "indicatorId": "EMG00342255",
    "mkt": 5,
    "country": "澳大利亚",
    "unit": ""
  },
  {
    "key": "foreign_6_0",
    "name": "核心消费者物价指数月率终值",
    "indicatorId": "EMG00008252",
    "mkt": 6,
    "country": "欧元区",
    "unit": ""
  },
  {
    "key": "foreign_6_1",
    "name": "GDP年率终值",
    "indicatorId": "EMG00007355",
    "mkt": 6,
    "country": "欧元区",
    "unit": ""
  },
  {
    "key": "foreign_6_2",
    "name": "消费者信心指数终值",
    "indicatorId": "EMG01357119",
    "mkt": 6,
    "country": "欧元区",
    "unit": ""
  },
  {
    "key": "foreign_6_3",
    "name": "零售销售月率(%)",
    "indicatorId": "EMG01555816",
    "mkt": 6,
    "country": "欧元区",
    "unit": ""
  },
  {
    "key": "foreign_6_4",
    "name": "零售销售年率(%)",
    "indicatorId": "EMG01555817",
    "mkt": 6,
    "country": "欧元区",
    "unit": ""
  },
  {
    "key": "foreign_6_5",
    "name": "央行公布利率决议",
    "indicatorId": "EMG00342251",
    "mkt": 6,
    "country": "欧元区",
    "unit": ""
  },
  {
    "key": "foreign_6_6",
    "name": "贸易帐(季调後)",
    "indicatorId": "EMG01340964",
    "mkt": 6,
    "country": "欧元区",
    "unit": ""
  },
  {
    "key": "foreign_7_0",
    "name": "新屋开工",
    "indicatorId": "EMG00342247",
    "mkt": 7,
    "country": "加拿大",
    "unit": ""
  },
  {
    "key": "foreign_7_1",
    "name": "失业率",
    "indicatorId": "EMG00157746",
    "mkt": 7,
    "country": "加拿大",
    "unit": ""
  },
  {
    "key": "foreign_7_2",
    "name": "贸易帐",
    "indicatorId": "EMG00102022",
    "mkt": 7,
    "country": "加拿大",
    "unit": ""
  },
  {
    "key": "foreign_7_3",
    "name": "零售销售月率(%)",
    "indicatorId": "EMG00159111",
    "mkt": 7,
    "country": "加拿大",
    "unit": ""
  },
  {
    "key": "foreign_7_4",
    "name": "央行公布利率决议",
    "indicatorId": "EMG00342248",
    "mkt": 7,
    "country": "加拿大",
    "unit": ""
  },
  {
    "key": "foreign_7_5",
    "name": "核心消费者物价指数年率",
    "indicatorId": "EMG00102030",
    "mkt": 7,
    "country": "加拿大",
    "unit": ""
  },
  {
    "key": "foreign_7_6",
    "name": "核心消费者物价指数月率",
    "indicatorId": "EMG00102044",
    "mkt": 7,
    "country": "加拿大",
    "unit": ""
  },
  {
    "key": "foreign_7_7",
    "name": "消费者物价指数年率",
    "indicatorId": "EMG00102029",
    "mkt": 7,
    "country": "加拿大",
    "unit": ""
  },
  {
    "key": "foreign_7_8",
    "name": "消费者物价指数月率",
    "indicatorId": "EMG00158719",
    "mkt": 7,
    "country": "加拿大",
    "unit": ""
  },
  {
    "key": "foreign_7_9",
    "name": "GDP月率(%)",
    "indicatorId": "EMG00159259",
    "mkt": 7,
    "country": "加拿大",
    "unit": ""
  },
  {
    "key": "foreign_8_0",
    "name": "消费者物价指数",
    "indicatorId": "EMG01351916",
    "mkt": 8,
    "country": "中国香港",
    "unit": ""
  },
  {
    "key": "foreign_8_1",
    "name": "消费者物价指数年率",
    "indicatorId": "EMG01351917",
    "mkt": 8,
    "country": "中国香港",
    "unit": ""
  },
  {
    "key": "foreign_8_2",
    "name": "失业率",
    "indicatorId": "EMG00059647",
    "mkt": 8,
    "country": "中国香港",
    "unit": ""
  },
  {
    "key": "foreign_8_3",
    "name": "香港GDP",
    "indicatorId": "EMG01337008",
    "mkt": 8,
    "country": "中国香港",
    "unit": ""
  },
  {
    "key": "foreign_8_4",
    "name": "香港GDP同比",
    "indicatorId": "EMG01337009",
    "mkt": 8,
    "country": "中国香港",
    "unit": ""
  },
  {
    "key": "foreign_8_5",
    "name": "香港楼宇买卖合约数量",
    "indicatorId": "EMG00158055",
    "mkt": 8,
    "country": "中国香港",
    "unit": ""
  },
  {
    "key": "foreign_8_6",
    "name": "香港楼宇买卖合约成交金额",
    "indicatorId": "EMG00158066",
    "mkt": 8,
    "country": "中国香港",
    "unit": ""
  },
  {
    "key": "foreign_8_7",
    "name": "香港商品贸易差额年率",
    "indicatorId": "EMG00157898",
    "mkt": 8,
    "country": "中国香港",
    "unit": ""
  },
  {
    "key": "foreign_8_8",
    "name": "香港制造业PPI年率",
    "indicatorId": "EMG00157818",
    "mkt": 8,
    "country": "中国香港",
    "unit": ""
  }
]

export const EM_MACRO_INDUSTRY: EmMacroIndustryItem[] = 
[
  {
    "key": "hyzs_list_EMI00662543",
    "name": "农副指数",
    "indicatorId": "EMI00662543"
  },
  {
    "key": "hyzs_list_EMI00009275",
    "name": "菜篮子产品批发价格指数",
    "indicatorId": "EMI00009275"
  },
  {
    "key": "hyzs_list_EMI00009274",
    "name": "农产品批发价格总指数",
    "indicatorId": "EMI00009274"
  },
  {
    "key": "hyzs_list_EMI01508580",
    "name": "美原油指数CONC",
    "indicatorId": "EMI01508580"
  },
  {
    "key": "hyzs_list_EMI00662539",
    "name": "能源指数",
    "indicatorId": "EMI00662539"
  },
  {
    "key": "hyzs_list_EMI00662535",
    "name": "大宗商品价格指数",
    "indicatorId": "EMI00662535"
  },
  {
    "key": "hyzs_list_EMI00018828",
    "name": "焦炭指数:综合",
    "indicatorId": "EMI00018828"
  },
  {
    "key": "hyzs_list_EMI00662540",
    "name": "化工指数",
    "indicatorId": "EMI00662540"
  },
  {
    "key": "hyzs_list_EMI00055562",
    "name": "费城半导体指数(SOX)",
    "indicatorId": "EMI00055562"
  },
  {
    "key": "hyzs_list_EMI00055551",
    "name": "义乌小商品指数:电子元器件:价格指数",
    "indicatorId": "EMI00055551"
  },
  {
    "key": "hyzs_list_EMI00055525",
    "name": "华强北价格指数:综合指数",
    "indicatorId": "EMI00055525"
  },
  {
    "key": "hyzs_list_EMI00662545",
    "name": "钢铁指数",
    "indicatorId": "EMI00662545"
  },
  {
    "key": "hyzs_list_EMI00064821",
    "name": "普钢指数:综合",
    "indicatorId": "EMI00064821"
  },
  {
    "key": "hyzs_list_EMI00064805",
    "name": "铁矿石指数:综合",
    "indicatorId": "EMI00064805"
  },
  {
    "key": "hyzs_list_EMI00662542",
    "name": "有色指数",
    "indicatorId": "EMI00662542"
  },
  {
    "key": "hyzs_list_EMI00135907",
    "name": "有色金属指数:镍",
    "indicatorId": "EMI00135907"
  },
  {
    "key": "hyzs_list_EMI00135905",
    "name": "有色金属指数:锌",
    "indicatorId": "EMI00135905"
  },
  {
    "key": "hyzs_list_EMI00135904",
    "name": "有色金属指数:铅",
    "indicatorId": "EMI00135904"
  },
  {
    "key": "hyzs_list_EMI00135903",
    "name": "有色金属指数:铝",
    "indicatorId": "EMI00135903"
  },
  {
    "key": "hyzs_list_EMI00135902",
    "name": "有色金属指数:铜",
    "indicatorId": "EMI00135902"
  },
  {
    "key": "hyzs_list_EMI01559105",
    "name": "主要城市混凝土价格:C20:均价",
    "indicatorId": "EMI01559105"
  },
  {
    "key": "hyzs_list_EMI00662541",
    "name": "建材指数",
    "indicatorId": "EMI00662541"
  },
  {
    "key": "hyzs_list_EMI00237146",
    "name": "建材价格指数:总指数",
    "indicatorId": "EMI00237146"
  },
  {
    "key": "hyzs_list_EMI00223622",
    "name": "生产资料价格指数:机械设备:定基数",
    "indicatorId": "EMI00223622"
  },
  {
    "key": "hyzs_list_EMI00136089",
    "name": "中国玻璃综合指数",
    "indicatorId": "EMI00136089"
  },
  {
    "key": "hyzs_list_EMI01415600",
    "name": "五金机电价格指数:总指数",
    "indicatorId": "EMI01415600"
  },
  {
    "key": "hyzs_list_EMI00890442",
    "name": "新造船价格指数:CNTPI指数",
    "indicatorId": "EMI00890442"
  },
  {
    "key": "hyzs_list_EMI00316914",
    "name": "永康五金交易价格指数:总指数",
    "indicatorId": "EMI00316914"
  },
  {
    "key": "hyzs_list_EMI00340996",
    "name": "GAIN.整体价格变换指数:汽车",
    "indicatorId": "EMI00340996"
  },
  {
    "key": "hyzs_list_EMI00223628",
    "name": "生产资料价格指数:汽车:定基数",
    "indicatorId": "EMI00223628"
  },
  {
    "key": "hyzs_list_EMI01587365",
    "name": "价格:VA:国产:50万IU/g:25kg",
    "indicatorId": "EMI01587365"
  },
  {
    "key": "hyzs_list_EMI00102651",
    "name": "中药材周价格定基指数",
    "indicatorId": "EMI00102651"
  },
  {
    "key": "hyzs_list_EMI00352262",
    "name": "物流景气指数",
    "indicatorId": "EMI00352262"
  },
  {
    "key": "hyzs_list_EMI00108768",
    "name": "民航货运量:当月值",
    "indicatorId": "EMI00108768"
  },
  {
    "key": "hyzs_list_EMI00108735",
    "name": "民航客运量:当月值",
    "indicatorId": "EMI00108735"
  },
  {
    "key": "hyzs_list_EMI00108261",
    "name": "全国主要港口:旅客吞吐量:当月值",
    "indicatorId": "EMI00108261"
  },
  {
    "key": "hyzs_list_EMI00108258",
    "name": "全国主要港口:货物吞吐量:当月值",
    "indicatorId": "EMI00108258"
  },
  {
    "key": "hyzs_list_EMI00107904",
    "name": "水运货运量:当月值",
    "indicatorId": "EMI00107904"
  },
  {
    "key": "hyzs_list_EMI00107707",
    "name": "水运客运量:当月值",
    "indicatorId": "EMI00107707"
  },
  {
    "key": "hyzs_list_EMI00107669",
    "name": "成品油运输指数(BCTI)",
    "indicatorId": "EMI00107669"
  },
  {
    "key": "hyzs_list_EMI00107668",
    "name": "原油运输指数(BDTI)",
    "indicatorId": "EMI00107668"
  },
  {
    "key": "hyzs_list_EMI00107667",
    "name": "超灵便型船运价指数(BSI)",
    "indicatorId": "EMI00107667"
  },
  {
    "key": "hyzs_list_EMI00107666",
    "name": "海岬型运费指数(BCI)",
    "indicatorId": "EMI00107666"
  },
  {
    "key": "hyzs_list_EMI00107665",
    "name": "巴拿马型运费指数(BPI)",
    "indicatorId": "EMI00107665"
  },
  {
    "key": "hyzs_list_EMI00107664",
    "name": "波罗的海干散货指数(BDI)",
    "indicatorId": "EMI00107664"
  },
  {
    "key": "hyzs_list_EMI00107137",
    "name": "公路货运量:当月值",
    "indicatorId": "EMI00107137"
  },
  {
    "key": "hyzs_list_EMI00106940",
    "name": "公路客运量:当月值",
    "indicatorId": "EMI00106940"
  },
  {
    "key": "hyzs_list_EMI00106265",
    "name": "铁路货运量:当月值",
    "indicatorId": "EMI00106265"
  },
  {
    "key": "hyzs_list_EMI00106130",
    "name": "铁路客运量:当月值",
    "indicatorId": "EMI00106130"
  },
  {
    "key": "hyzs_list_EMI00105644",
    "name": "货运量总计:当月值",
    "indicatorId": "EMI00105644"
  },
  {
    "key": "hyzs_list_EMI00105511",
    "name": "客运量总计:当月值",
    "indicatorId": "EMI00105511"
  },
  {
    "key": "hyzs_list_EMI00319930",
    "name": "交易景气指数:安防产品",
    "indicatorId": "EMI00319930"
  },
  {
    "key": "hyzs_list_EMI00112872",
    "name": "中关村电子产品价格指数:软件产品",
    "indicatorId": "EMI00112872"
  },
  {
    "key": "hyzs_list_EMI00112802",
    "name": "华强北价格指数:电子元器件",
    "indicatorId": "EMI00112802"
  },
  {
    "key": "hyzs_list_EMI00112801",
    "name": "华强北价格指数:综合指数",
    "indicatorId": "EMI00112801"
  },
  {
    "key": "hyzs_list_EMI00117870",
    "name": "义乌小商品价格指数:工艺品类",
    "indicatorId": "EMI00117870"
  },
  {
    "key": "hyzs_list_EMI01565209",
    "name": "国内新开业酒店数:三星级以上:合计",
    "indicatorId": "EMI01565209"
  },
  {
    "key": "hyzs_list_EMI00780900",
    "name": "国内饭店餐饮收入比:当月值",
    "indicatorId": "EMI00780900"
  },
  {
    "key": "hyzs_list_EMI00780899",
    "name": "国内饭店客房收入比:当月值",
    "indicatorId": "EMI00780899"
  },
  {
    "key": "hyzs_list_EMI00780896",
    "name": "国内饭店平均房价(ADR平均):当月值",
    "indicatorId": "EMI00780896"
  },
  {
    "key": "hyzs_list_EMM00121987",
    "name": "国房景气指数",
    "indicatorId": "EMM00121987"
  },
  {
    "key": "hyzs_list_EMI01523157",
    "name": "商品房销售额:当月值",
    "indicatorId": "EMI01523157"
  },
  {
    "key": "hyzs_list_EMI00120219",
    "name": "房地产开发投资完成额:累计值",
    "indicatorId": "EMI00120219"
  },
  {
    "key": "hyzs_list_EMM00088870",
    "name": "原保险保费收入:寿险合计",
    "indicatorId": "EMM00088870"
  },
  {
    "key": "hyzs_list_EMI01516267",
    "name": "银行理财产品发行数量:当月值",
    "indicatorId": "EMI01516267"
  },
  {
    "key": "hyzs_list_EMI00301953",
    "name": "证券市场交易结算资金余额:期末数",
    "indicatorId": "EMI00301953"
  },
  {
    "key": "hyzs_list_EMI00135095",
    "name": "总资产:银行业金融机构",
    "indicatorId": "EMI00135095"
  },
  {
    "key": "hyzs_list_EMI00551421",
    "name": "全国百家重点大型零售企业商品零售额:当月同比",
    "indicatorId": "EMI00551421"
  },
  {
    "key": "hyzs_list_EMI00135323",
    "name": "社会消费品零售总额:当月值",
    "indicatorId": "EMI00135323"
  },
  {
    "key": "hyzs_list_EMM00189661",
    "name": "城镇固定资产投资:电信、广播电视和卫星传输服务:全国:累计值",
    "indicatorId": "EMM00189661"
  },
  {
    "key": "hyzs_list_EMM00027197",
    "name": "城镇固定资产投资完成额:水利、环境和公共设施管理业:累计值",
    "indicatorId": "EMM00027197"
  },
  {
    "key": "hyzs_list_EMM00027179",
    "name": "固定资产投资完成额:电力、煤气、及水的生产和供应业:累计值",
    "indicatorId": "EMM00027179"
  },
  {
    "key": "hyzs_list_EMM00008598",
    "name": "出口交货值:电气机械及器材制造业:当月值",
    "indicatorId": "EMM00008598"
  },
  {
    "key": "hyzs_list_EMI00319429",
    "name": "交易价格指数:电子电工:电线、电缆:电气设备用电缆",
    "indicatorId": "EMI00319429"
  },
  {
    "key": "hyzs_list_EMI00225823",
    "name": "手机出货量:当月值",
    "indicatorId": "EMI00225823"
  },
  {
    "key": "hyzs_list_EMI00183065",
    "name": "中国电信:移动用户数:当月新增",
    "indicatorId": "EMI00183065"
  },
  {
    "key": "hyzs_list_EMI00011561",
    "name": "用电量:工业:当月值",
    "indicatorId": "EMI00011561"
  },
  {
    "key": "hyzs_list_EMM00072926",
    "name": "RPI:金银珠宝:环比",
    "indicatorId": "EMM00072926"
  },
  {
    "key": "hyzs_list_EMI00662788",
    "name": "黄金指数",
    "indicatorId": "EMI00662788"
  }
]

