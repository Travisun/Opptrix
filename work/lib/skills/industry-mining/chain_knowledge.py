"""
行业产业链知识库 — 极致深度拆解版本

核心原则：
1. 尽可能拆到具体技术/产品/工艺/原材料节点层级
2. 追溯每个节点的上游原材料依赖（金属/化工/稀有元素）
3. 标注每个瓶颈节点的"瓶颈类型"、"国产化率"、"技术代际"
4. 目标是找到产业链中真正的"卡脖子"环节

元数据字段说明：
  bottleneck       — 是否为瓶颈环节
  bottleneck_type  — 瓶颈的具体技术/工艺/资源类型
  domestic_rate    — 国产化率（%）
  tech_generation  — 技术代际演进路线
"""

INDUSTRY_CHAINS = {
  "半导体": {
    "name": "半导体全产业链",
    "nodes": [
      {
        "position": "上游 — 高纯硅料/硅基原材料",
        "keywords": [
          "高纯硅",
          "硅料",
          "电子级硅",
          "多晶硅",
          "单晶硅",
          "9N"
        ],
        "desc": "芯片制造的基底材料，电子级硅纯度需达99.9999999%(9N级)，全球仅信越/SUMCO可量产300mm大硅片",
        "bottleneck": True,
        "bottleneck_type": "材料纯度+大尺寸化",
        "domestic_rate": "13%",
        "tech_generation": "200mm→300mm→450mm"
      },
      {
        "position": "上游 — 光刻胶/光刻材料",
        "keywords": [
          "光刻胶",
          "ArF",
          "KrF",
          "EUV光刻胶",
          "显影液",
          "抗反射层",
          "BARC"
        ],
        "desc": "光刻胶是芯片制造核心耗材，ArF浸没式光刻胶和EUV光刻胶国产化率极低，日本JSR/TOK/信越垄断",
        "bottleneck": True,
        "bottleneck_type": "树脂合成+配方",
        "domestic_rate": "5%",
        "tech_generation": "g线/i线→KrF→ArF→ArFi→EUV"
      },
      {
        "position": "上游 — 电子特气（高纯气体）",
        "keywords": [
          "电子特气",
          "高纯气体",
          "硅烷",
          "NF3",
          "CF4",
          "刻蚀气体",
          "沉积气体",
          "C4F6"
        ],
        "desc": "芯片制造中使用50+种特种气体，三氟化氮(NF3)用量最大，高纯钨/锗烷等品种国产化率低",
        "bottleneck": True,
        "bottleneck_type": "气体纯度+品种齐全度",
        "domestic_rate": "35%"
      },
      {
        "position": "上游 — 高纯化学试剂（湿电子化学品）",
        "keywords": [
          "湿电子化学品",
          "高纯试剂",
          "双氧水",
          "硫酸",
          "氨水",
          "氢氟酸",
          "磷酸",
          "NMP"
        ],
        "desc": "晶圆清洗和刻蚀中使用的高纯度液体化学品，SEMI G4/G5级纯度是关键门槛",
        "domestic_rate": "40%"
      },
      {
        "position": "上游 — CMP材料（抛光液/抛光垫）",
        "keywords": [
          "CMP",
          "抛光液",
          "抛光垫",
          "研磨液",
          "CMP材料",
          "铜抛光液",
          "钨抛光液"
        ],
        "desc": "化学机械抛光耗材，抛光垫国产化率<10%，3M/陶氏垄断，不同制程需不同配方",
        "bottleneck": True,
        "bottleneck_type": "高分子材料+配方工艺",
        "domestic_rate": "10%"
      },
      {
        "position": "上游 — 溅射靶材/高纯金属",
        "keywords": [
          "靶材",
          "溅射靶材",
          "金属靶材",
          "合金靶材",
          "高纯金属",
          "铜靶",
          "铝靶",
          "钛靶"
        ],
        "desc": "物理气相沉积用的溅射靶材，高纯金属提纯是瓶颈，铝靶国产化较好但高纯铜/钛靶仍有差距",
        "bottleneck": True,
        "bottleneck_type": "金属提纯+致密化",
        "domestic_rate": "25%"
      },
      {
        "position": "上游 — 高纯石英/陶瓷/石墨零部件",
        "keywords": [
          "石英",
          "石英舟",
          "石英管",
          "陶瓷",
          "精密陶瓷",
          "氮化铝",
          "碳化硅",
          "石墨",
          "高纯石墨"
        ],
        "desc": "刻蚀/扩散/外延设备中的高纯耐高温零部件，石英件的纯度直接影响良率",
        "bottleneck": True,
        "bottleneck_type": "材料纯度+精密加工",
        "domestic_rate": "15%"
      },
      {
        "position": "上游 — 光刻设备（光刻机）",
        "keywords": [
          "光刻机",
          "曝光",
          "浸没式",
          "EUV",
          "DUV",
          "ArFi",
          "纳米压印",
          "NIL"
        ],
        "desc": "芯片制造皇冠，EUV仅ASML可造，浸没式DUV也高度受限，纳米压印是新兴路线",
        "bottleneck": True,
        "bottleneck_type": "光学系统+精密运动",
        "domestic_rate": "2%",
        "tech_generation": "DUV干式→DUV浸没式→EUV 0.33NA→High-NA EUV 0.55NA"
      },
      {
        "position": "上游 — 刻蚀设备（硅/介质/金属）",
        "keywords": [
          "刻蚀机",
          "等离子刻蚀",
          "ICP",
          "CCP",
          "硅刻蚀",
          "介质刻蚀",
          "TSV",
          "高深宽比刻蚀"
        ],
        "desc": "3D NAND和先进制程核心设备，层数越多刻蚀需求越大，极高深宽比(>60:1)是最大难点",
        "bottleneck": True,
        "bottleneck_type": "等离子源+反应腔设计",
        "domestic_rate": "20%"
      },
      {
        "position": "上游 — 薄膜沉积设备（PVD/CVD/ALD）",
        "keywords": [
          "薄膜沉积",
          "PVD",
          "CVD",
          "PECVD",
          "ALD",
          "外延",
          "LPCVD",
          "SACVD"
        ],
        "desc": "原子层沉积(ALD)是先进制程关键设备，High-k金属栅极必需，荷兰ASM/日本TEL领先",
        "bottleneck": True,
        "bottleneck_type": "原子层精度+前驱体",
        "domestic_rate": "15%"
      },
      {
        "position": "上游 — 检测/量测设备",
        "keywords": [
          "检测",
          "量测",
          "缺陷检测",
          "膜厚测量",
          "电子束",
          "光学检测",
          "AOI",
          "关键尺寸"
        ],
        "desc": "良率控制核心，KLA在光学和电子束检测领域基本垄断",
        "bottleneck": True,
        "bottleneck_type": "光学/电子束系统",
        "domestic_rate": "5%"
      },
      {
        "position": "上游 — 清洗/离子注入/CMP/热处理设备",
        "keywords": [
          "清洗设备",
          "离子注入",
          "热处理",
          "RTP",
          "快速退火",
          "去胶",
          "CMP设备"
        ],
        "desc": "配合核心工艺的辅助关键设备，清洗设备国内进展最快",
        "domestic_rate": "25%"
      },
      {
        "position": "中游 — EDA/电子设计自动化",
        "keywords": [
          "EDA",
          "IP核",
          "仿真",
          "验证",
          "综合",
          "物理设计",
          "OPC",
          "TCAD"
        ],
        "desc": "芯片设计的工具链，全流程EDA国产化率<5%，Cadence/Synopsys双寡头垄断",
        "bottleneck": True,
        "bottleneck_type": "软件算法+工艺库绑定",
        "domestic_rate": "5%"
      },
      {
        "position": "中游 — 数字芯片设计（CPU/GPU/SoC/FPGA）",
        "keywords": [
          "数字芯片",
          "SoC",
          "CPU",
          "GPU",
          "NPU",
          "FPGA",
          "ASIC",
          "MCU"
        ],
        "desc": "逻辑/处理器类芯片设计，AI时代GPU/NPU是核心，国产CPU多采用ARM或RISC-V架构",
        "bottleneck": True,
        "bottleneck_type": "架构授权+先进制程依赖",
        "domestic_rate": "15%"
      },
      {
        "position": "中游 — 模拟芯片设计（电源/信号链）",
        "keywords": [
          "模拟芯片",
          "电源管理",
          "信号链",
          "运放",
          "ADC",
          "DAC",
          "比较器",
          "接口"
        ],
        "desc": "连接物理世界和数字世界的桥梁，品类超10万种、生命周期长、依赖经验积累",
        "domestic_rate": "12%"
      },
      {
        "position": "中游 — 存储芯片设计（DRAM/NAND/HBM）",
        "keywords": [
          "存储芯片设计",
          "DRAM",
          "NAND",
          "HBM",
          "NOR",
          "SRAM"
        ],
        "desc": "存储器设计制程高度绑定制造工艺，HBM通过TSV+Hybrid Bonding实现超高带宽",
        "bottleneck": True,
        "bottleneck_type": "制程绑定+接口IP",
        "domestic_rate": "5%"
      },
      {
        "position": "中游 — 射频/功率半导体设计",
        "keywords": [
          "射频",
          "功率芯片",
          "MOSFET",
          "IGBT",
          "SiC",
          "GaN",
          "LNA",
          "PA",
          "射频开关"
        ],
        "desc": "射频前端和功率半导体的国产替代空间大，SiC/GaN第三代半导体设计需特殊工艺库",
        "domestic_rate": "20%"
      },
      {
        "position": "中游 — 晶圆代工（先进制程<28nm）",
        "keywords": [
          "晶圆代工",
          "Foundry",
          "先进制程",
          "7nm",
          "5nm",
          "3nm",
          "14nm",
          "FinFET",
          "GAA"
        ],
        "desc": "先进制程代工，7nm以下全球仅台积电/三星可量产，国内受设备出口管制严重制约",
        "bottleneck": True,
        "bottleneck_type": "光刻机+良率控制",
        "domestic_rate": "3%",
        "tech_generation": "28nm→14nm→7nm→5nm→3nm→GAA(2nm)"
      },
      {
        "position": "中游 — 晶圆代工（成熟制程>28nm）",
        "keywords": [
          "成熟制程",
          "28nm以上",
          "车规",
          "BCD",
          "eFlash",
          "HV",
          "CIS",
          "功率"
        ],
        "desc": "成熟制程产能紧缺(车规/工控/IoT)，国产化主力，中芯国际/华虹等推进",
        "domestic_rate": "30%"
      },
      {
        "position": "中游 — 先进封装（Chiplet/CoWoS/2.5D/3D）",
        "keywords": [
          "先进封装",
          "Chiplet",
          "SiP",
          "Fan-out",
          "CoWoS",
          "2.5D",
          "3D封装",
          "TSV",
          "Hybrid Bonding"
        ],
        "desc": "后摩尔时代性能提升关键，CoWoS是AI芯片必需，台积电CoWoS产能严重紧缺",
        "bottleneck": True,
        "bottleneck_type": "TSV深孔+混合键合",
        "domestic_rate": "15%",
        "tech_generation": "引线键合→FC→Fan-out→CoWoS→3D Hybrid Bonding"
      },
      {
        "position": "中游 — 封装基板（IC载板/ABF/BT）",
        "keywords": [
          "IC载板",
          "封装基板",
          "ABF载板",
          "BT载板",
          "FCBGA",
          "FCCSP",
          "SiP基板"
        ],
        "desc": "芯片封装的高端电路板，ABF载板供不应求，日本Ibiden/Shinko领先",
        "bottleneck": True,
        "bottleneck_type": "超精细线路+ABF树脂",
        "domestic_rate": "5%"
      },
      {
        "position": "中游 — 传统封测",
        "keywords": [
          "封装",
          "测试",
          "传统封装",
          "QFN",
          "BGA",
          "LGA",
          "SIP",
          "SOP"
        ],
        "desc": "传统封装和测试，国产化率较高(长电/通富/华天全球前十)但高端测试有缺口",
        "domestic_rate": "60%"
      },
      {
        "position": "下游 — 芯片分销/方案/IDH",
        "keywords": [
          "芯片分销",
          "方案设计",
          "模组",
          "代理",
          "IDH",
          "参考设计"
        ],
        "desc": "芯片流通和方案集成环节，国内IC分销市场集中度低"
      }
    ],
    "concepts": [
      "半导体",
      "芯片",
      "集成电路",
      "国产芯片",
      "光刻机",
      "晶圆",
      "封测",
      "DRAM",
      "NAND",
      "硅片"
    ]
  },
  "AI芯片": {
    "name": "AI芯片/算力全产业链",
    "nodes": [
      {
        "position": "上游 — 芯片原材料（高纯硅/稀土/贵金属）",
        "keywords": [
          "高纯硅",
          "稀土",
          "钕铁硼",
          "铜",
          "金",
          "银",
          "钽",
          "高纯金属",
          "电子级硅"
        ],
        "desc": "AI芯片制造底层原材料，高纯硅(9N+)仅信越/SUMCO可量产；稀土用于散热风扇电机；金/银/铜用于引线和基板",
        "bottleneck": True,
        "bottleneck_type": "原材料纯度+供应垄断",
        "domestic_rate": "15%"
      },
      {
        "position": "上游 — ABF封装基板/载板材料",
        "keywords": [
          "ABF载板",
          "BT载板",
          "FCBGA",
          "封装基板",
          "味之素堆积膜",
          "铜箔",
          "PPE树脂"
        ],
        "desc": "AI芯片封装核心基板，ABF(味之素堆积膜)全球仅日本味之素可量产，ABF载板产能直接决定AI芯片出货量",
        "bottleneck": True,
        "bottleneck_type": "ABF树脂垄断+超精细线路",
        "domestic_rate": "3%",
        "tech_generation": "BT载板→ABF载板→玻璃基板"
      },
      {
        "position": "上游 — 服务器PCB（高层数/高速材料）",
        "keywords": [
          "PCB",
          "服务器PCB",
          "高层数PCB",
          "HDI",
          "高TG",
          "超厚铜",
          "背板",
          "AnyLayer",
          "M6",
          "M7"
        ],
        "desc": "AI服务器主板需20-30层PCB，需要M6/M7级高速材料，PCB层压工艺直接影响AI服务器性能",
        "bottleneck": True,
        "bottleneck_type": "层压工艺+低损耗材料",
        "domestic_rate": "30%",
        "tech_generation": "普通FR-4→M4/M6→M7/M8超低损耗"
      },
      {
        "position": "上游 — GPU/通用训练芯片",
        "keywords": [
          "GPU",
          "训练芯片",
          "H100",
          "A100",
          "B100",
          "CUDA",
          "通用GPU",
          "Tensor Core"
        ],
        "desc": "AI训练核心计算单元，英伟达CUDA生态+硬件迭代双垄断，Blackwell/B100/Rubin加速迭代",
        "bottleneck": True,
        "bottleneck_type": "架构+CUDA生态+先进封装",
        "domestic_rate": "2%",
        "tech_generation": "Ampere→Hopper→Blackwell→Rubin"
      },
      {
        "position": "上游 — NPU/ASIC/AI推理加速芯片",
        "keywords": [
          "NPU",
          "ASIC",
          "AI加速",
          "TPU",
          "IPU",
          "DPU",
          "存算一体",
          "类脑芯片"
        ],
        "desc": "针对特定AI场景定制芯片，存算一体是前沿方向，推理芯片成本功耗远低于GPU",
        "domestic_rate": "20%"
      },
      {
        "position": "上游 — HBM高带宽内存（存力瓶颈）",
        "keywords": [
          "HBM",
          "HBM2",
          "HBM3",
          "HBM3E",
          "HBM4",
          "TSV",
          "Microbump",
          "Hybrid Bonding",
          "MR-MUF"
        ],
        "desc": "AI芯片的存力瓶颈，HBM通过TSV+Microbump实现超高带宽，SK海力士领先三星/美光",
        "bottleneck": True,
        "bottleneck_type": "TSV+混合键合+散热",
        "domestic_rate": "0%",
        "tech_generation": "HBM2→HBM3→HBM3E→HBM4→HBM4E"
      },
      {
        "position": "上游 — CoWoS/2.5D先进封装产能",
        "keywords": [
          "CoWoS",
          "2.5D封装",
          "3D封装",
          "FOWLP",
          "FOPLP",
          "硅中介层",
          "Chiplet互联",
          "UCIe"
        ],
        "desc": "AI芯片必需的高端封装技术，CoWoS产能严重紧缺限制AI芯片出货量，台积电独占",
        "bottleneck": True,
        "bottleneck_type": "硅中介层+TSV+产能",
        "domestic_rate": "2%"
      },
      {
        "position": "中游 — AI服务器/算力整机",
        "keywords": [
          "AI服务器",
          "服务器",
          "算力中心",
          "GPU服务器",
          "液冷服务器",
          "HPC",
          "机柜"
        ],
        "desc": "搭载AI芯片的整机系统，液冷散热成为刚需(单GPU>400W，单卡>700W)",
        "domestic_rate": "45%"
      },
      {
        "position": "中游 — 高速光互联/光模块",
        "keywords": [
          "光模块",
          "800G",
          "1.6T",
          "硅光",
          "CPO",
          "相干光",
          "DSP",
          "EML",
          "VCSEL"
        ],
        "desc": "数据中心内部高速互联，800G/1.6T需求爆发，EML激光器和DSP芯片是瓶颈",
        "bottleneck": True,
        "bottleneck_type": "高速激光器+DSP芯片",
        "domestic_rate": "25%",
        "tech_generation": "400G→800G→1.6T→CPO共封装光学"
      },
      {
        "position": "中游 — AI网络交换（InfiniBand/RoCE）",
        "keywords": [
          "交换机",
          "InfiniBand",
          "RoCE",
          "DPU网卡",
          "SmartNIC",
          "NVLink",
          "CX7"
        ],
        "desc": "AI集群网络通信基础设施，InfiniBand(英伟达Mellanox)在AI训练中占主导",
        "bottleneck": True,
        "bottleneck_type": "高速SerDes+协议栈",
        "domestic_rate": "10%"
      },
      {
        "position": "中游 — 液冷散热系统",
        "keywords": [
          "液冷",
          "浸没式",
          "冷板式",
          "散热",
          "服务器电源",
          "热管",
          "VC均温板",
          "水冷",
          "CDU"
        ],
        "desc": "AI芯片功耗超700W，传统风冷已到极限，液冷成必选项，冷板式当前主流",
        "domestic_rate": "40%"
      },
      {
        "position": "中游 — 服务器电源/供电模组",
        "keywords": [
          "服务器电源",
          "BMC",
          "VR",
          "Power Module",
          "GPU供电",
          "HVDC",
          "UPS",
          "数字电源"
        ],
        "desc": "AI服务器功耗密度高，GPU供电模块需高效率/大电流，数字电源芯片是关键",
        "domestic_rate": "35%"
      },
      {
        "position": "下游 — 算力运营/云服务/智算中心",
        "keywords": [
          "算力租赁",
          "云计算",
          "算力调度",
          "智算中心",
          "算力运营",
          "GPU云"
        ],
        "desc": "算力即服务，GPU云租赁模式兴起，算力资产成重资产运营"
      },
      {
        "position": "下游 — AI应用/大模型",
        "keywords": [
          "大模型",
          "LLM",
          "应用",
          "推理",
          "部署",
          "AI Agent",
          "多模态",
          "RAG"
        ],
        "desc": "AI能力的行业应用落地，模型推理成本快速下降推动应用爆发"
      }
    ],
    "concepts": [
      "AI芯片",
      "人工智能",
      "算力",
      "GPU",
      "AI",
      "HBM",
      "光模块",
      "服务器",
      "液冷",
      "CoWoS"
    ]
  },
  "具身智能": {
    "name": "具身智能/人形机器人全产业链",
    "nodes": [
      {
        "position": "上游 — 先进轻量化材料（PEEK/碳纤维/镁合金）",
        "keywords": [
          "PEEK",
          "碳纤维",
          "镁合金",
          "铝合金",
          "钛合金",
          "复合材料",
          "预浸料",
          "CFRP",
          "PPS"
        ],
        "desc": "机器人减重核心材料，PEEK(聚醚醚酮)和碳纤维复材用于机身骨架，PEEK国产化正在突破但纯度有差距",
        "bottleneck": True,
        "bottleneck_type": "高分子合成+碳纤维T700+级",
        "domestic_rate": "30%"
      },
      {
        "position": "上游 — 高性能钕铁硼永磁材料",
        "keywords": [
          "钕铁硼",
          "永磁材料",
          "烧结钕铁硼",
          "磁钢",
          "稀土永磁",
          "镝",
          "铽",
          "N52"
        ],
        "desc": "伺服电机和力矩电机的核心材料，N52及以上牌号需添加重稀土，中国掌控全球>80%稀土供应",
        "bottleneck": True,
        "bottleneck_type": "稀土永磁配方+重稀土添加",
        "domestic_rate": "70%"
      },
      {
        "position": "上游 — 精密铜合金/电磁线",
        "keywords": [
          "铜合金",
          "电磁线",
          "漆包线",
          "利兹线",
          "扁线",
          "高导电铜",
          "微细线"
        ],
        "desc": "电机绕组的关键材料，高导电率和耐温等级直接影响电机性能和寿命",
        "domestic_rate": "60%"
      },
      {
        "position": "上游 — 谐波减速器（关节核心）",
        "keywords": [
          "谐波减速器",
          "谐波",
          "柔轮",
          "刚轮",
          "波发生器",
          "HD",
          "CSF"
        ],
        "desc": "机器人轻载关节核心传动部件，哈默纳科垄断高端，柔轮寿命和精度保持性是最大难点",
        "bottleneck": True,
        "bottleneck_type": "精密齿轮加工+热处理",
        "domestic_rate": "25%"
      },
      {
        "position": "上游 — RV减速器（重载关节核心）",
        "keywords": [
          "RV减速器",
          "RV",
          "摆线针轮",
          "曲柄轴",
          "纳博特斯克"
        ],
        "desc": "机器人重载关节核心传动部件，纳博特斯克垄断，精度寿命要求极高",
        "bottleneck": True,
        "bottleneck_type": "摆线针轮精密制造+装配",
        "domestic_rate": "20%"
      },
      {
        "position": "上游 — 无框力矩电机/伺服电机",
        "keywords": [
          "无框电机",
          "力矩电机",
          "伺服电机",
          "永磁同步",
          "直驱",
          "扁线",
          "油冷"
        ],
        "desc": "关节运动的动力单元，高转矩密度/低齿槽力矩是核心指标",
        "bottleneck": True,
        "bottleneck_type": "磁路设计+绕组工艺",
        "domestic_rate": "30%"
      },
      {
        "position": "上游 — 空心杯电机（灵巧手核心）",
        "keywords": [
          "空心杯电机",
          "微型电机",
          "无铁芯电机",
          "微特电机",
          "音圈电机",
          "有刷",
          "无刷"
        ],
        "desc": "灵巧手手指驱动核心，微型化(<8mm)+高功率密度要求极高，瑞士MAXON/Faulhaber领先",
        "bottleneck": True,
        "bottleneck_type": "微细线圈绕制+磁路优化",
        "domestic_rate": "15%"
      },
      {
        "position": "上游 — 精密轴承（交叉滚子/薄壁轴承）",
        "keywords": [
          "交叉滚子轴承",
          "薄壁轴承",
          "精密轴承",
          "柔性轴承",
          "角接触球轴承"
        ],
        "desc": "机器人关节的精密旋转支撑，日本NSK/NTN/THK领先",
        "bottleneck": True,
        "bottleneck_type": "超精密磨削+热处理",
        "domestic_rate": "15%"
      },
      {
        "position": "上游 — 六维力矩传感器",
        "keywords": [
          "六维力",
          "力矩传感器",
          "扭矩传感器",
          "力传感器",
          "应变片",
          "硅微熔"
        ],
        "desc": "机器人力控交互核心，六维力需解耦算法，宇立/坤维有产品但精度和稳定性有差距",
        "bottleneck": True,
        "bottleneck_type": "弹性体设计+解耦算法+封装",
        "domestic_rate": "15%"
      },
      {
        "position": "上游 — 电子皮肤/触觉传感器",
        "keywords": [
          "触觉传感器",
          "电子皮肤",
          "压力传感器",
          "阵列式",
          "柔性传感器",
          "压阻",
          "电容"
        ],
        "desc": "灵巧手精细操作的感知基础，大面积柔性触觉阵列尚未规模化",
        "bottleneck": True,
        "bottleneck_type": "柔性电路+信号处理",
        "domestic_rate": "20%"
      },
      {
        "position": "上游 — 编码器/位置传感器",
        "keywords": [
          "编码器",
          "绝对式",
          "增量式",
          "磁编码器",
          "光电编码器",
          "旋转变压器"
        ],
        "desc": "关节的位置和速度反馈核心，高精度编码器17bit+是门槛",
        "domestic_rate": "25%"
      },
      {
        "position": "上游 — 精密线束/连接器/柔性电缆",
        "keywords": [
          "线束",
          "连接器",
          "柔性电缆",
          "拖链电缆",
          "高柔性线",
          "机器人专用电缆"
        ],
        "desc": "机器人内部动力/信号/通信线路，耐弯折>1000万次是门槛",
        "domestic_rate": "40%"
      },
      {
        "position": "中游 — 一体化关节模组",
        "keywords": [
          "关节模组",
          "执行器",
          "线性执行器",
          "旋转执行器",
          "一体化关节",
          "集成关节"
        ],
        "desc": "集成减速器+电机+编码器+驱动器的关节单元，集成度决定关节性能",
        "domestic_rate": "35%"
      },
      {
        "position": "中游 — 灵巧手/末端执行器",
        "keywords": [
          "灵巧手",
          "五指手",
          "二指夹爪",
          "末端执行器",
          "触觉",
          "抓取",
          "腱绳驱动"
        ],
        "desc": "机器人手部，自由度越多越灵活(6-12DOF)，腱绳驱动vs电机直驱路线之争",
        "bottleneck": True,
        "bottleneck_type": "微型化+多自由度+触觉集成",
        "domestic_rate": "20%"
      },
      {
        "position": "中游 — 运动控制系统（控制器/驱动器）",
        "keywords": [
          "运动控制",
          "控制器",
          "驱动器",
          "轨迹规划",
          "力控",
          "阻抗控制",
          "步态规划"
        ],
        "desc": "机器人运动的核心大脑，步态规划+全身力控算法是关键难点",
        "bottleneck": True,
        "bottleneck_type": "实时控制算法+力位混合",
        "domestic_rate": "25%"
      },
      {
        "position": "中游 — 3D视觉/深度感知",
        "keywords": [
          "3D视觉",
          "激光雷达",
          "深度相机",
          "SLAM",
          "手眼协调",
          "结构光",
          "ToF",
          "双目"
        ],
        "desc": "环境感知和定位建图，高精度3D视觉成本正快速降低",
        "domestic_rate": "30%"
      },
      {
        "position": "中游 — AI大模型/具身大脑（VLA）",
        "keywords": [
          "具身智能",
          "VLA",
          "视觉语言动作",
          "机器人大模型",
          "RT-2",
          "模仿学习",
          "强化学习"
        ],
        "desc": "机器人的决策模型，通用机器人操作能力大幅提升的关键技术",
        "bottleneck": True,
        "bottleneck_type": "通用泛化能力+实时推理",
        "domestic_rate": "15%"
      },
      {
        "position": "下游 — 人形机器人整机集成",
        "keywords": [
          "人形机器人",
          "双足机器人",
          "通用机器人",
          "整机",
          "本体",
          "Optimus",
          "Figure"
        ],
        "desc": "人形机器人整机制造，全自由度>40个，平衡控制和步态稳定性是关键",
        "domestic_rate": "25%"
      },
      {
        "position": "下游 — 精密结构件/3D打印轻量化",
        "keywords": [
          "镁合金",
          "铝合金",
          "碳纤维",
          "精密结构件",
          "轻量化",
          "3D打印",
          "增材制造"
        ],
        "desc": "机器人轻量化材料和精密结构件制造，拓扑优化+3D打印是减重新路径",
        "domestic_rate": "40%"
      }
    ],
    "concepts": [
      "机器人",
      "人形机器人",
      "具身智能",
      "减速器",
      "伺服电机",
      "传感器",
      "灵巧手",
      "PEEK",
      "钕铁硼",
      "谐波减速器"
    ]
  },
  "新能源汽车": {
    "name": "新能源汽车全产业链",
    "nodes": [
      {
        "position": "上游 — 锂矿/盐湖资源",
        "keywords": [
          "锂矿",
          "锂盐",
          "碳酸锂",
          "氢氧化锂",
          "盐湖提锂",
          "辉石提锂",
          "云母提锂",
          "锂辉石"
        ],
        "desc": "电池核心原料，全球锂资源分布不均(智利/澳洲/阿根廷)，盐湖提锂成本<5万/吨vs矿石提锂7-10万/吨",
        "bottleneck": True,
        "bottleneck_type": "资源禀赋+提锂技术",
        "domestic_rate": "30%"
      },
      {
        "position": "上游 — 镍/钴/锰/磷矿资源",
        "keywords": [
          "镍",
          "钴",
          "锰",
          "磷矿",
          "高镍",
          "NCM",
          "NCA",
          "磷酸铁",
          "红土镍矿"
        ],
        "desc": "三元正极核心元素，钴资源受刚果金制约(全球70%产能)，高镍化减少钴用量但增加镍需求",
        "bottleneck": True,
        "bottleneck_type": "战略资源对外依存",
        "domestic_rate": "10%(钴)"
      },
      {
        "position": "上游 — 稀土永磁材料（电机核心）",
        "keywords": [
          "稀土",
          "钕铁硼",
          "永磁",
          "磁材",
          "镝",
          "铽",
          "烧结磁钢",
          "高性能磁钢"
        ],
        "desc": "永磁同步电机的核心材料，中国掌控全球>80%稀土供应链但高性能磁钢需添加重稀土受限",
        "bottleneck": True,
        "bottleneck_type": "稀土配额+重稀土受限",
        "domestic_rate": "70%"
      },
      {
        "position": "上游 — 铜箔/铝箔（锂电集流体）",
        "keywords": [
          "铜箔",
          "锂电铜箔",
          "极薄铜箔",
          "复合铜箔",
          "PET铜箔",
          "铝箔",
          "涂碳铝箔"
        ],
        "desc": "锂电池集流体材料，极薄化(4.5μm→4μm→3.5μm)趋势，复合铜箔是降本+安全创新方向",
        "domestic_rate": "45%"
      },
      {
        "position": "上游 — 天然石墨/人造石墨（负极核心原料）",
        "keywords": [
          "石墨",
          "天然石墨",
          "人造石墨",
          "石墨化",
          "负极",
          "碳素",
          "针状焦"
        ],
        "desc": "锂电负极核心原料，人造石墨为主流，石墨化加工是高能耗环节(占成本~50%)",
        "bottleneck": True,
        "bottleneck_type": "石墨化工艺+能耗管控",
        "domestic_rate": "65%"
      },
      {
        "position": "中游 — 正极材料（三元/磷酸铁锂/LMFP）",
        "keywords": [
          "正极材料",
          "三元",
          "磷酸铁锂",
          "LFP",
          "NCM811",
          "高镍",
          "磷酸锰铁锂",
          "LMFP",
          "单晶"
        ],
        "desc": "锂电池能量密度核心，高镍三元vs磷酸铁锂路线分流，LMFP是折中方案",
        "domestic_rate": "55%"
      },
      {
        "position": "中游 — 负极材料（石墨/硅碳负极）",
        "keywords": [
          "负极材料",
          "人造石墨",
          "天然石墨",
          "硅碳负极",
          "硅氧负极",
          "硬碳",
          "软碳"
        ],
        "desc": "硅碳负极是下一代方向(能量密度提升>20%)，但膨胀率控制是最大技术难点",
        "bottleneck": True,
        "bottleneck_type": "硅膨胀+循环寿命",
        "domestic_rate": "50%"
      },
      {
        "position": "中游 — 电解液/六氟磷酸锂/LiFSI",
        "keywords": [
          "电解液",
          "六氟磷酸锂",
          "LiFSI",
          "溶剂",
          "添加剂",
          "VC",
          "FEC",
          "DTD"
        ],
        "desc": "离子传输介质，六氟磷酸锂价格波动极大(6万→60万/吨)，LiFSI是下一代锂盐",
        "domestic_rate": "60%"
      },
      {
        "position": "中游 — 隔膜（湿法/干法/涂覆）",
        "keywords": [
          "隔膜",
          "湿法",
          "干法",
          "涂覆",
          "基膜",
          "PVDF",
          "氧化铝涂覆",
          "勃姆石"
        ],
        "desc": "电池安全核心，湿法隔膜壁垒高，恩捷/星源材质全球领先",
        "domestic_rate": "50%"
      },
      {
        "position": "中游 — 粘结剂/导电剂（PVDF/CNT/碳纳米管）",
        "keywords": [
          "PVDF",
          "粘结剂",
          "SBR",
          "CMC",
          "导电剂",
          "炭黑",
          "CNT",
          "碳纳米管"
        ],
        "desc": "电极制造辅助材料，PVDF受树脂价格影响大，CNT导电剂正在替代传统炭黑",
        "domestic_rate": "30%"
      },
      {
        "position": "中游 — 动力电池制造（电芯/Pack/CTP/CTC）",
        "keywords": [
          "动力电池",
          "锂电池",
          "电芯",
          "电池包",
          "CTP",
          "CTC",
          "刀片电池",
          "4680",
          "大圆柱"
        ],
        "desc": "电芯制造与系统集成，CTP/CTC结构创新提升能量密度，大圆柱是特斯拉主导路线",
        "domestic_rate": "50%"
      },
      {
        "position": "中游 — 热管理系统（热泵/冷却板/PTC）",
        "keywords": [
          "热管理",
          "热泵",
          "冷媒",
          "冷却板",
          "PTC",
          "电池冷却",
          "一体化热管理"
        ],
        "desc": "电池和座舱温度控制，热泵是冬季续航提升关键(+15-30%续航)"
      },
      {
        "position": "中游 — 驱动电机（扁线/油冷/高速化）",
        "keywords": [
          "驱动电机",
          "永磁同步",
          "感应电机",
          "扁线电机",
          "油冷",
          "高速电机",
          "20000rpm"
        ],
        "desc": "驱动系统动力源，扁线/油冷/高速化(>20000rpm)是趋势",
        "domestic_rate": "50%"
      },
      {
        "position": "中游 — SiC功率器件/IGBT（电控核心）",
        "keywords": [
          "SiC",
          "碳化硅",
          "IGBT",
          "MOSFET",
          "逆变器",
          "OBC",
          "DC-DC",
          "SiC衬底",
          "SiC外延"
        ],
        "desc": "电机控制器核心器件，SiC替代IGBT提升效率~5-8%，SiC衬底长晶是最大瓶颈",
        "bottleneck": True,
        "bottleneck_type": "SiC衬底长晶+缺陷控制",
        "domestic_rate": "10%",
        "tech_generation": "IGBT→SiC MOSFET→GaN"
      },
      {
        "position": "中游 — 智驾芯片/域控制器",
        "keywords": [
          "智驾芯片",
          "域控制器",
          "Orin",
          "Thor",
          "高通",
          "地平线",
          "黑芝麻",
          "行泊一体"
        ],
        "desc": "自动驾驶的算力大脑，高算力芯片(>500TOPS)是门槛",
        "bottleneck": True,
        "bottleneck_type": "高算力+低功耗+车规",
        "domestic_rate": "15%"
      },
      {
        "position": "中游 — 感知系统（激光雷达/摄像头/4D毫米波）",
        "keywords": [
          "激光雷达",
          "摄像头",
          "毫米波雷达",
          "4D成像",
          "超声波",
          "感知",
          "融合",
          "OPA"
        ],
        "desc": "环境感知传感器组合，激光雷达从数万降至千元级别，4D毫米波雷达是新兴方向",
        "domestic_rate": "30%"
      },
      {
        "position": "中游 — 线控底盘（EMB线控制动/SBW）",
        "keywords": [
          "线控",
          "线控制动",
          "线控转向",
          "线控悬架",
          "EMB",
          "SBW",
          "EHB",
          "One-Box"
        ],
        "desc": "自动驾驶执行基础，One-Box线控制动是核心，EMB是终极方向(响应更快)",
        "bottleneck": True,
        "bottleneck_type": "冗余设计+ASIL-D安全",
        "domestic_rate": "15%"
      },
      {
        "position": "中游 — 智能座舱/HUD/AR-HUD",
        "keywords": [
          "座舱",
          "座舱芯片",
          "HUD",
          "AR-HUD",
          "液晶仪表",
          "中控",
          "语音",
          "DMS"
        ],
        "desc": "人机交互界面，AR-HUD+多屏化是趋势"
      },
      {
        "position": "中游 — 一体化压铸/超大型压铸",
        "keywords": [
          "一体化压铸",
          "压铸",
          "轻量化",
          "铝压铸",
          "超大型压铸",
          "免热处理",
          "6000T",
          "9000T"
        ],
        "desc": "特斯拉引领的一体化压铸工艺，大幅降本增效，大型压铸机(>6000T)是关键设备",
        "domestic_rate": "40%"
      },
      {
        "position": "中游 — 汽车电子（车用PCB/FPC/连接器/线束）",
        "keywords": [
          "汽车电子",
          "车用PCB",
          "FPC",
          "连接器",
          "传感器",
          "继电器",
          "线束",
          "高速连接"
        ],
        "desc": "车身电子系统的基础器件，智驾增加高速高频连接器需求",
        "domestic_rate": "35%"
      },
      {
        "position": "下游 — 整车制造",
        "keywords": [
          "新能源整车",
          "乘用车",
          "SUV",
          "MPV",
          "A级",
          "B级",
          "C级",
          "电驱桥"
        ],
        "desc": "整车厂品牌与制造，中国品牌全球市占率快速提升",
        "domestic_rate": "45%"
      },
      {
        "position": "下游 — 充电/换电基础设施（800V超充）",
        "keywords": [
          "充电桩",
          "换电",
          "快充",
          "超充",
          "充电模块",
          "充电运营",
          "V2G",
          "800V",
          "液冷超充"
        ],
        "desc": "补能基础设施，800V高压快充是趋势，SiC充电模块效率更高"
      },
      {
        "position": "下游 — 电池回收/梯次利用",
        "keywords": [
          "电池回收",
          "再生利用",
          "拆解",
          "梯次利用",
          "锂回收",
          "钴回收",
          "黑粉"
        ],
        "desc": "动力电池退役后的回收和再生利用，锂回收率>90%是技术目标",
        "domestic_rate": "40%"
      }
    ],
    "concepts": [
      "新能源汽车",
      "锂电池",
      "电动车",
      "新能源车",
      "汽车零部件",
      "充电桩",
      "智能驾驶",
      "SiC",
      "碳酸锂",
      "稀土"
    ]
  },
  "光伏": {
    "name": "光伏全产业链",
    "nodes": [
      {
        "position": "上游 — 工业硅/冶金硅",
        "keywords": [
          "工业硅",
          "冶金硅",
          "硅石",
          "金属硅",
          "化学级硅"
        ],
        "desc": "光伏最上游，高能耗环节，产能受电力限制，每吨工业硅耗电13000kWh"
      },
      {
        "position": "上游 — 多晶硅（西门子法/颗粒硅）",
        "keywords": [
          "多晶硅",
          "硅料",
          "西门子法",
          "颗粒硅",
          "改良西门子",
          "流化床"
        ],
        "desc": "光伏核心原料，颗粒硅是新技术路线能耗更低(60%)，协鑫颗粒硅领先",
        "bottleneck": True,
        "bottleneck_type": "提纯工艺+能耗",
        "domestic_rate": "80%",
        "tech_generation": "西门子法→改良西门子法→颗粒硅(FBR)"
      },
      {
        "position": "中游 — 硅片（拉棒/切片/N型/P型）",
        "keywords": [
          "硅片",
          "单晶硅",
          "N型",
          "P型",
          "拉棒",
          "切片",
          "金刚线",
          "薄片化",
          "细线化"
        ],
        "desc": "单晶替代多晶，N型替代P型，薄片化(<130μm)降本，金刚线母线细线化"
      },
      {
        "position": "中游 — 电池片（PERC/TOPCon/HJT/BC/钙钛矿）",
        "keywords": [
          "电池片",
          "PERC",
          "TOPCon",
          "HJT",
          "HIT",
          "BC电池",
          "IBC",
          "钙钛矿",
          "叠层"
        ],
        "desc": "技术路线竞争最激烈环节，TOPCon当前主流，HJT和钙钛矿是未来方向",
        "bottleneck": True,
        "bottleneck_type": "转换效率+量产良率",
        "tech_generation": "BSF→PERC→TOPCon/HJT→BC→钙钛矿叠层"
      },
      {
        "position": "中游 — 组件/封装材料（EVA/POE/光伏玻璃）",
        "keywords": [
          "组件",
          "光伏组件",
          "封装",
          "EVA",
          "POE",
          "光伏玻璃",
          "背板",
          "焊带",
          "接线盒"
        ],
        "desc": "组件封装与辅材，POE胶膜用于双玻组件抗PID，光伏玻璃供需波动大"
      },
      {
        "position": "中游 — 光伏设备（拉晶炉/切片机/PECVD/激光）",
        "keywords": [
          "光伏设备",
          "拉晶炉",
          "切片机",
          "PECVD",
          "LPCVD",
          "激光掺杂",
          "丝网印刷"
        ],
        "desc": "全产业链设备供应商，技术迭代驱动设备更新换代"
      },
      {
        "position": "中游 — 逆变器/储能变流器（组串式/微逆/PCS）",
        "keywords": [
          "逆变器",
          "微逆",
          "组串式",
          "集中式",
          "储能变流器",
          "PCS",
          "关断器",
          "优化器"
        ],
        "desc": "光伏系统电能转换核心，组串式替代集中式，微逆在分布式市场渗透率提升"
      },
      {
        "position": "下游 — 光伏电站EPC/运营",
        "keywords": [
          "光伏电站",
          "电站运营",
          "EPC",
          "分布式光伏",
          "集中式",
          "户用光伏",
          "工商业"
        ],
        "desc": "电站开发建设运营，分布式占比持续提升"
      },
      {
        "position": "下游 — 储能系统（大储/工商储/户储）",
        "keywords": [
          "储能",
          "储能电池",
          "储能系统",
          "工商储",
          "大储",
          "户储",
          "BMS",
          "EMS"
        ],
        "desc": "光储一体化，配储是并网刚需，锂电储能成本持续下降"
      }
    ],
    "concepts": [
      "光伏",
      "太阳能",
      "HIT电池",
      "HJT",
      "钙钛矿",
      "TOPCon",
      "光伏设备",
      "硅料",
      "储能"
    ]
  },
  "低空经济": {
    "name": "低空经济产业链",
    "nodes": [
      {
        "position": "上游 — 航空级电池/固态电池",
        "keywords": [
          "eVTOL电池",
          "航空电池",
          "高能量密度",
          "固态电池",
          "半固态",
          "能量密度>300"
        ],
        "desc": "eVTOL对电池能量密度要求极高(>300Wh/kg)，当前锂电约250-280Wh/kg，固态电池是关键突破方向",
        "bottleneck": True,
        "bottleneck_type": "能量密度+安全性",
        "domestic_rate": "20%"
      },
      {
        "position": "上游 — 航空材料（碳纤维复材/钛合金）",
        "keywords": [
          "碳纤维",
          "复合材料",
          "航空铝合金",
          "钛合金",
          "3D打印",
          "轻量化",
          "复材"
        ],
        "desc": "飞行器轻量化关键，碳纤维复材占eVTOL结构重量~70%",
        "domestic_rate": "35%"
      },
      {
        "position": "上游 — 航空电机/电推进系统",
        "keywords": [
          "电推进",
          "航空电机",
          "高功率密度",
          "电机",
          "电调",
          "分布式推进",
          "舵面"
        ],
        "desc": "eVTOL的分布式电推进系统，高功率密度电机和安全冗余是关键"
      },
      {
        "position": "中游 — 飞控系统/航电（三冗余）",
        "keywords": [
          "飞控",
          "航电系统",
          "飞行控制",
          "自动驾驶",
          "感知避障",
          "冗余设计",
          "三冗余"
        ],
        "desc": "eVTOL飞行安全核心，三冗余/四冗余飞控是适航认证要求",
        "bottleneck": True,
        "bottleneck_type": "冗余架构+适航认证",
        "domestic_rate": "15%"
      },
      {
        "position": "中游 — eVTOL整机",
        "keywords": [
          "eVTOL",
          "飞行汽车",
          "无人机",
          "工业无人机",
          "物流无人机",
          "垂直起降"
        ],
        "desc": "电动垂直起降飞行器整机制造，适航认证周期长(3-5年)"
      },
      {
        "position": "下游 — 低空空管/UAM基础设施",
        "keywords": [
          "空管",
          "低空空管",
          "UAM",
          "起降场",
          "通信",
          "导航",
          "监视",
          "5G低空"
        ],
        "desc": "低空空域管理和起降场基础设施"
      },
      {
        "position": "下游 — 通航运营/维修/培训",
        "keywords": [
          "通航运营",
          "低空运营",
          "租赁",
          "维修",
          "培训",
          "物流配送",
          "空中游览"
        ],
        "desc": "低空飞行器的运营服务和维护体系"
      }
    ],
    "concepts": [
      "低空经济",
      "eVTOL",
      "飞行汽车",
      "无人机",
      "通航",
      "低空"
    ]
  },
  "氢能源": {
    "name": "氢能源全产业链",
    "nodes": [
      {
        "position": "上游 — 电解槽制氢（PEM/ALK/SOEC）",
        "keywords": [
          "制氢",
          "电解槽",
          "PEM电解",
          "ALK电解",
          "SOEC",
          "绿氢",
          "灰氢",
          "蓝氢"
        ],
        "desc": "氢的来源，PEM电解槽是绿氢方向但贵金属催化剂(铱/铂)成本高，ALK碱性槽成本最低",
        "bottleneck": True,
        "bottleneck_type": "贵金属催化剂+寿命",
        "domestic_rate": "30%",
        "tech_generation": "ALK→PEM→SOEC"
      },
      {
        "position": "中游 — 储氢/运氢（高压/液氢/固态）",
        "keywords": [
          "储氢",
          "运氢",
          "高压储氢",
          "液氢",
          "固态储氢",
          "有机液态",
          "管道输氢",
          "70MPa"
        ],
        "desc": "氢储存运输环节，35/70MPa高压气态是当前主流，液氢和管道是方向但成本高",
        "bottleneck": True,
        "bottleneck_type": "储氢密度+成本"
      },
      {
        "position": "中游 — 加氢站核心设备（压缩机/储氢罐）",
        "keywords": [
          "加氢站",
          "加氢",
          "压缩机",
          "储氢罐",
          "加注",
          "45MPa",
          "90MPa"
        ],
        "desc": "加氢站基础设施建设，隔膜式压缩机是核心设备，国产化率正在提升",
        "domestic_rate": "30%"
      },
      {
        "position": "中游 — 燃料电池系统（膜电极/双极板/电堆）",
        "keywords": [
          "燃料电池",
          "膜电极",
          "双极板",
          "质子交换膜",
          "催化剂",
          "气体扩散层",
          "电堆"
        ],
        "desc": "氢能的核心应用设备，膜电极和催化剂(铂)是最高壁垒",
        "bottleneck": True,
        "bottleneck_type": "膜电极+铂催化剂",
        "domestic_rate": "25%",
        "tech_generation": "石墨板→金属双极板→超薄金属板"
      },
      {
        "position": "下游 — 燃料电池汽车/重卡/叉车",
        "keywords": [
          "氢能汽车",
          "燃料电池车",
          "FCV",
          "氢能重卡",
          "氢能叉车",
          "热电联供"
        ],
        "desc": "氢能主要消纳场景，重卡是优先方向(续航长、补能快)"
      }
    ],
    "concepts": [
      "氢能源",
      "氢能",
      "燃料电池",
      "电解槽",
      "加氢站",
      "绿氢"
    ]
  },
  "新材料": {
    "name": "先进材料产业链",
    "nodes": [
      {
        "position": "上游 — 碳纤维（T700/T800/T1000/M系列）",
        "keywords": [
          "碳纤维",
          "T700",
          "T800",
          "T1000",
          "M系列",
          "PAN基",
          "沥青基",
          "预浸料"
        ],
        "desc": "高性能纤维材料，小丝束(1-24K)技术壁垒高，航空航天级T800+是瓶颈",
        "bottleneck": True,
        "bottleneck_type": "原丝制备+碳化工艺",
        "domestic_rate": "30%",
        "tech_generation": "T300→T700→T800→T1000→M系列高模量"
      },
      {
        "position": "上游 — 高温合金（变形/铸造/粉末）",
        "keywords": [
          "高温合金",
          "变形合金",
          "铸造合金",
          "粉末合金",
          "单晶叶片",
          "涡轮盘"
        ],
        "desc": "航发和燃气轮机核心材料，单晶叶片精密铸造是最高壁垒",
        "bottleneck": True,
        "bottleneck_type": "冶炼工艺+单晶铸造",
        "domestic_rate": "30%"
      },
      {
        "position": "上游 — 钛合金/钛材",
        "keywords": [
          "钛合金",
          "钛材",
          "海绵钛",
          "钛板",
          "钛棒",
          "钛管",
          "TC4",
          "TA15"
        ],
        "desc": "航空航天和3C电子重要结构材料，海绵钛还原是能耗关键",
        "domestic_rate": "35%"
      },
      {
        "position": "上游 — 稀土永磁材料（钕铁硼）",
        "keywords": [
          "钕铁硼",
          "烧结钕铁硼",
          "粘结钕铁硼",
          "磁材",
          "伺服电机磁钢"
        ],
        "desc": "新能源汽车和机器人电机核心材料，中国掌控全球稀土供应"
      },
      {
        "position": "中游 — 先进陶瓷（氮化硅/氮化铝/氧化锆）",
        "keywords": [
          "先进陶瓷",
          "陶瓷基板",
          "LTCC",
          "HTCC",
          "氮化硅",
          "氮化铝",
          "氧化锆",
          "陶瓷轴承球"
        ],
        "desc": "电子封装和特殊场景结构陶瓷，氮化硅轴承球是高端装备瓶颈",
        "bottleneck": True,
        "bottleneck_type": "粉体制备+烧结工艺",
        "domestic_rate": "20%"
      },
      {
        "position": "中游 — PEEK/特种工程塑料",
        "keywords": [
          "PEEK",
          "特种工程塑料",
          "PI",
          "LCP",
          "PPS",
          "聚酰亚胺",
          "砜聚合物"
        ],
        "desc": "高性能有机高分子材料，PEEK是机器人轻量化关键，PEEK膜/管是高端医疗耗材",
        "bottleneck": True,
        "bottleneck_type": "聚合工艺+结晶度控制",
        "domestic_rate": "25%"
      },
      {
        "position": "中游 — 电子化学品（高纯试剂/显影液/蚀刻液）",
        "keywords": [
          "电子化学品",
          "湿电子化学品",
          "高纯试剂",
          "显影液",
          "剥离液",
          "蚀刻液"
        ],
        "desc": "半导体和面板制造中的精细化学品，G5级纯度为最高门槛",
        "domestic_rate": "30%"
      }
    ],
    "concepts": [
      "新材料",
      "碳纤维",
      "高温合金",
      "稀土永磁",
      "钛合金",
      "先进陶瓷",
      "PEEK"
    ]
  },
  "消费电子": {
    "name": "消费电子产业链",
    "nodes": [
      {
        "position": "上游 — 应用处理器/SoC芯片",
        "keywords": [
          "应用处理器",
          "SoC",
          "AP",
          "A系列",
          "骁龙",
          "天玑",
          "展讯"
        ],
        "desc": "消费电子的运算核心，先进制程是门槛",
        "bottleneck": True,
        "bottleneck_type": "先进制程依赖"
      },
      {
        "position": "上游 — 存储芯片（DRAM/NAND/UFS）",
        "keywords": [
          "DRAM",
          "NAND",
          "UFS",
          "eMMC",
          "LPDDR",
          "存储"
        ],
        "desc": "手机电脑存储介质，价格周期性波动大"
      },
      {
        "position": "上游 — CIS图像传感器",
        "keywords": [
          "CIS",
          "图像传感器",
          "CMOS",
          "像素",
          "高像素",
          "大底",
          "TOF"
        ],
        "desc": "摄像头核心感光元件，高像素大底是方向，索尼/三星领先"
      },
      {
        "position": "上游 — 显示面板（OLED/LCD/MicroLED）",
        "keywords": [
          "面板",
          "OLED",
          "LCD",
          "MiniLED",
          "MicroLED",
          "LTPS",
          "LTPO",
          "折叠屏"
        ],
        "desc": "屏幕技术路线演变，OLED渗透率提升，折叠/卷曲是创新方向",
        "bottleneck": True,
        "bottleneck_type": "蒸镀设备+材料"
      },
      {
        "position": "中游 — 高端PCB/HDI/SLP/IC载板",
        "keywords": [
          "PCB",
          "FPC",
          "HDI",
          "SLP",
          "mSAP",
          "AnyLayer",
          "IC载板"
        ],
        "desc": "电子产品基础电路板，高端HDI/载板壁垒高",
        "bottleneck": True,
        "bottleneck_type": "超精细线路工艺",
        "domestic_rate": "25%"
      },
      {
        "position": "中游 — 精密结构件/钛合金中框",
        "keywords": [
          "结构件",
          "中框",
          "外壳",
          "钛合金中框",
          "不锈钢",
          "铝合金",
          "玻璃盖板"
        ],
        "desc": "手机/笔记本框架和外观件，钛合金是趋势(强度高重量轻)"
      },
      {
        "position": "中游 — 消费电池/快充/无线充电",
        "keywords": [
          "消费电池",
          "快充",
          "无线充电",
          "充电IC",
          "电源管理",
          "BMS"
        ],
        "desc": "续航和充电体验关键"
      },
      {
        "position": "中游 — 射频前端（PA/滤波器/SAW/BAW）",
        "keywords": [
          "射频前端",
          "功率放大器",
          "滤波器",
          "SAW",
          "BAW",
          "开关",
          "LNA"
        ],
        "desc": "无线通信核心模块，BAW滤波器壁垒高",
        "bottleneck": True,
        "bottleneck_type": "MEMS+薄膜工艺",
        "domestic_rate": "15%"
      },
      {
        "position": "中游 — 声学/光学器件（扬声器/镜头/VCM）",
        "keywords": [
          "扬声器",
          "麦克风",
          "MEMS",
          "镜头",
          "棱镜",
          "潜望",
          "VCM",
          "马达"
        ],
        "desc": "音频和摄像头的精密器件"
      },
      {
        "position": "下游 — 整机组装/品牌（手机/平板/TWS/VR）",
        "keywords": [
          "手机",
          "电脑",
          "平板",
          "可穿戴",
          "TWS",
          "VR/AR",
          "智能手表"
        ],
        "desc": "终端消费电子品牌和组装制造"
      }
    ],
    "concepts": [
      "消费电子",
      "手机",
      "面板",
      "可穿戴",
      "TWS",
      "PCB",
      "折叠屏"
    ]
  },
  "医疗器械": {
    "name": "医疗器械产业链",
    "nodes": [
      {
        "position": "上游 — 核心零部件（CT球管/超声探头/探测器）",
        "keywords": [
          "CT球管",
          "超声探头",
          "探测器",
          "平板探测器",
          "传感器",
          "电机",
          "泵阀"
        ],
        "desc": "医疗设备的核心零部件，CT球管和探测器是最高壁垒环节",
        "bottleneck": True,
        "bottleneck_type": "精密制造+射线管技术"
      },
      {
        "position": "中游 — 影像设备（CT/MRI/DR/超声/PET-CT）",
        "keywords": [
          "CT",
          "MRI",
          "DR",
          "超声",
          "PET-CT",
          "DSA",
          "乳腺机",
          "C形臂"
        ],
        "desc": "大型医疗影像设备，高端CT/MR国产替代空间大",
        "domestic_rate": "30%"
      },
      {
        "position": "中游 — 内窥镜（软镜/硬镜/胶囊内镜）",
        "keywords": [
          "内窥镜",
          "软镜",
          "硬镜",
          "腹腔镜",
          "关节镜",
          "胶囊内镜",
          "3D内窥镜"
        ],
        "desc": "微创手术视觉核心，软镜CCD/CMOS图像传感器和弯曲机构是技术壁垒",
        "bottleneck": True,
        "bottleneck_type": "图像传感器+精密弯曲",
        "domestic_rate": "15%"
      },
      {
        "position": "中游 — 心血管介入/高值耗材（支架/TAVR/瓣膜）",
        "keywords": [
          "支架",
          "药物球囊",
          "TAVR",
          "心脏瓣膜",
          "起搏器",
          "封堵器",
          "导管"
        ],
        "desc": "介入心脏病学高值耗材，TAVR是增长最快方向",
        "domestic_rate": "30%"
      },
      {
        "position": "中游 — 骨科植入物（关节/脊柱/运动医学）",
        "keywords": [
          "人工关节",
          "脊柱",
          "创伤",
          "运动医学",
          "骨水泥",
          "3D打印骨"
        ],
        "desc": "骨科植入耗材，集采后国产化率提升",
        "domestic_rate": "40%"
      },
      {
        "position": "中游 — IVD体外诊断（化学发光/分子/POCT）",
        "keywords": [
          "IVD",
          "生化",
          "免疫",
          "化学发光",
          "分子诊断",
          "POCT",
          "血球",
          "凝血"
        ],
        "desc": "体外诊断试剂和仪器，化学发光是最大细分市场，国产替代加速",
        "domestic_rate": "35%"
      },
      {
        "position": "中游 — 监护/生命支持（ECMO/呼吸机/麻醉机）",
        "keywords": [
          "监护仪",
          "呼吸机",
          "麻醉机",
          "ECMO",
          "除颤仪",
          "输注泵"
        ],
        "desc": "重症监护关键设备，ECMO是高端壁垒(离心泵+氧合器)",
        "bottleneck": True,
        "bottleneck_type": "离心泵+氧合器+膜材"
      },
      {
        "position": "下游 — 流通/SPD/第三方检验",
        "keywords": [
          "医疗器械流通",
          "SPD",
          "第三方检验",
          "独立血透",
          "影像中心"
        ],
        "desc": "器械流通和医疗服务"
      }
    ],
    "concepts": [
      "医疗器械",
      "医疗设备",
      "体外诊断",
      "高值耗材",
      "IVD",
      "CT",
      "MRI",
      "内窥镜"
    ]
  },
  "人工智能": {
    "name": "人工智能产业链",
    "nodes": [
      {
        "position": "上游 — AI训练芯片（GPU/NPU/H100/训练集群）",
        "keywords": [
          "GPU",
          "NPU",
          "AI芯片",
          "训练芯片",
          "H100",
          "算力芯片",
          "加速卡"
        ],
        "desc": "AI训练的算力基础，英伟达生态垄断",
        "bottleneck": True,
        "bottleneck_type": "算力生态绑定"
      },
      {
        "position": "上游 — AI推理芯片/边缘AI",
        "keywords": [
          "推理芯片",
          "边缘AI",
          "端侧芯片",
          "NPU",
          "AI加速"
        ],
        "desc": "AI推理场景芯片，端侧AI是爆发方向"
      },
      {
        "position": "上游 — 数据中心/AI算力基础设施",
        "keywords": [
          "AI数据中心",
          "液冷",
          "智算中心",
          "GPU集群",
          "算力调度"
        ],
        "desc": "算力集群的物理基础设施"
      },
      {
        "position": "中游 — 基础大模型（LLM/多模态/基座模型）",
        "keywords": [
          "大模型",
          "LLM",
          "GPT",
          "多模态",
          "语言模型",
          "视觉模型",
          "基座模型"
        ],
        "desc": "通用大模型是AI操作系统，训练成本极高(单次训练>1亿美元)",
        "bottleneck": True,
        "bottleneck_type": "数据+算力+算法"
      },
      {
        "position": "中游 — AI开发框架/MaaS/模型部署",
        "keywords": [
          "AI框架",
          "PyTorch",
          "深度学习",
          "MaaS",
          "模型部署",
          "推理加速",
          "模型压缩"
        ],
        "desc": "AI应用开发的基础设施"
      },
      {
        "position": "中游 — 数据服务/标注/合成数据",
        "keywords": [
          "数据标注",
          "数据清洗",
          "数据采集",
          "合成数据",
          "数据库"
        ],
        "desc": "AI模型训练的数据基础"
      },
      {
        "position": "下游 — AI+行业应用（Agent/AIGC/编程）",
        "keywords": [
          "AI应用",
          "AI Agent",
          "AIGC",
          "智能客服",
          "AI编程",
          "AI医疗",
          "AI金融"
        ],
        "desc": "AI在垂直行业的落地应用"
      },
      {
        "position": "下游 — 机器人/具身智能应用",
        "keywords": [
          "具身智能",
          "人形机器人",
          "AI机器人",
          "VLA",
          "智能机器人"
        ],
        "desc": "AI与物理世界交互的终极形态"
      }
    ],
    "concepts": [
      "人工智能",
      "AI",
      "大模型",
      "算力",
      "AIGC",
      "机器人"
    ]
  },
  "创新药": {
    "name": "创新药及研发产业链",
    "nodes": [
      {
        "position": "上游 — CRO（临床前/临床研发外包）",
        "keywords": [
          "CRO",
          "临床前CRO",
          "临床CRO",
          "安评",
          "DMPK",
          "SMO"
        ],
        "desc": "药物研发外包服务，贯穿从发现到临床全流程"
      },
      {
        "position": "上游 — CDMO（原料药/制剂/生物药生产外包）",
        "keywords": [
          "CDMO",
          "原料药CDMO",
          "制剂CDMO",
          "生物药CDMO",
          "抗体CDMO"
        ],
        "desc": "药物合同生产外包，生物药CDMO壁垒高"
      },
      {
        "position": "中游 — 靶点发现/AI药物筛选",
        "keywords": [
          "靶点",
          "药物发现",
          "高通量筛选",
          "PROTAC",
          "分子胶",
          "AI制药"
        ],
        "desc": "新药研发起点，AI制药是效率革命"
      },
      {
        "position": "中游 — 抗体药物（单抗/双抗/ADC）",
        "keywords": [
          "单抗",
          "双抗",
          "ADC",
          "抗体",
          "PD-1",
          "HER2",
          "Claudin"
        ],
        "desc": "生物药主流方向，ADC是明星赛道(定点偶联/载荷)",
        "bottleneck": True,
        "bottleneck_type": "CMC+偶联技术"
      },
      {
        "position": "中游 — 细胞/基因治疗（CAR-T/AAV/mRNA）",
        "keywords": [
          "CAR-T",
          "细胞治疗",
          "基因治疗",
          "AAV",
          "溶瘤病毒",
          "mRNA"
        ],
        "desc": "前沿疗法，个体化程度高，生产工艺壁垒极高",
        "bottleneck": True,
        "bottleneck_type": "病毒载体生产+质控"
      },
      {
        "position": "中游 — 小分子化药/靶向药",
        "keywords": [
          "小分子",
          "化药",
          "靶向药",
          "抑制剂",
          "激酶抑制剂"
        ],
        "desc": "传统创新药主力，口服便利性优势"
      },
      {
        "position": "中游 — 疫苗（mRNA/重组蛋白/佐剂）",
        "keywords": [
          "疫苗",
          "mRNA疫苗",
          "重组蛋白",
          "病毒载体",
          "佐剂"
        ],
        "desc": "预防性生物制品，mRNA技术平台扩展性强"
      },
      {
        "position": "下游 — 医药流通/处方外流",
        "keywords": [
          "医药商业",
          "流通",
          "药房",
          "处方外流",
          "医药电商"
        ],
        "desc": "药品分发和零售"
      }
    ],
    "concepts": [
      "创新药",
      "生物医药",
      "CRO",
      "CXO",
      "疫苗",
      "ADC",
      "抗体",
      "细胞治疗"
    ]
  },
  "军工": {
    "name": "国防军工产业链",
    "nodes": [
      {
        "position": "上游 — 特种材料（高温合金/钛合金/隐身材料）",
        "keywords": [
          "高温合金",
          "钛合金",
          "碳纤维",
          "隐身材料",
          "装甲钢",
          "特种钢"
        ],
        "desc": "军工装备基础材料，高温合金是航发核心，隐身材料涉及电磁波吸收/反射涂层",
        "bottleneck": True,
        "bottleneck_type": "特种冶炼+材料配方"
      },
      {
        "position": "上游 — 军工电子元器件（连接器/继电器/MEMS）",
        "keywords": [
          "军用连接器",
          "继电器",
          "电容器",
          "电阻",
          "MEMS",
          "惯性器件"
        ],
        "desc": "军用电子系统元器件基础，要求宽温域/高可靠/抗辐射",
        "domestic_rate": "50%"
      },
      {
        "position": "中游 — 航空发动机（涡扇/涡喷/涡轴/叶片）",
        "keywords": [
          "航空发动机",
          "涡扇",
          "涡喷",
          "涡轴",
          "航发叶片",
          "涡轮盘",
          "加力",
          "单晶叶片"
        ],
        "desc": "军机心脏，技术壁垒最高环节，高温合金单晶叶片是核心",
        "bottleneck": True,
        "bottleneck_type": "单晶叶片+热障涂层+整机试验",
        "domestic_rate": "20%",
        "tech_generation": "涡喷→涡扇→变循环→自适应"
      },
      {
        "position": "中游 — 航空装备（战斗机/运输机/无人机）",
        "keywords": [
          "战斗机",
          "运输机",
          "轰炸机",
          "教练机",
          "直升机",
          "无人机",
          "预警机",
          "隐身"
        ],
        "desc": "各类军用飞行器整机制造，隐身/超音速巡航/超级机动是五代机标志",
        "domestic_rate": "40%"
      },
      {
        "position": "中游 — 导弹/精确制导（导引头/惯导）",
        "keywords": [
          "导弹",
          "制导炸弹",
          "火箭弹",
          "引信",
          "导引头",
          "惯导",
          "红外制导",
          "雷达制导"
        ],
        "desc": "精确打击武器，导引头(红外/雷达/激光)是核心，惯导提供自主导航",
        "bottleneck": True,
        "bottleneck_type": "导引头+惯导精度"
      },
      {
        "position": "中游 — 舰船/海洋装备（驱逐舰/潜艇/航母）",
        "keywords": [
          "舰船",
          "驱逐舰",
          "护卫舰",
          "潜艇",
          "航母",
          "船用动力",
          "全电推进"
        ],
        "desc": "海军装备制造，综合电力推进系统是趋势"
      },
      {
        "position": "中游 — 地面装备/弹药/火工品",
        "keywords": [
          "坦克",
          "装甲车",
          "火炮",
          "弹药",
          "火工品",
          "榴弹"
        ],
        "desc": "陆军装备和弹药系统"
      },
      {
        "position": "下游 — 信息化/电子战/北斗/卫星",
        "keywords": [
          "军事信息化",
          "雷达",
          "电子对抗",
          "军用通信",
          "北斗导航",
          "卫星",
          "加密",
          "数据链"
        ],
        "desc": "国防信息化和电子对抗系统，数据链和加密通信是关键",
        "bottleneck": True,
        "bottleneck_type": "射频芯片+抗干扰"
      }
    ],
    "concepts": [
      "军工",
      "国防",
      "航空航天",
      "卫星",
      "无人机",
      "北斗",
      "雷达",
      "发动机",
      "电子对抗"
    ]
  },
  "白酒": {
    "name": "白酒产业链",
    "nodes": [
      {
        "position": "上游 — 原料/包装（高粱/小麦/玻璃/陶瓷/防伪）",
        "keywords": [
          "白酒包装",
          "玻璃瓶",
          "陶瓷",
          "印刷",
          "防伪",
          "高粱",
          "小麦",
          "制曲"
        ],
        "desc": "酿造原料及包装材料，包装是防伪和品牌载体"
      },
      {
        "position": "中游 — 高端白酒（品牌壁垒/酱香/浓香）",
        "keywords": [
          "高端白酒",
          "酱香",
          "浓香",
          "高端",
          "飞天",
          "普五",
          "国窖",
          "年份酒"
        ],
        "desc": "品牌力强、定价权高，核心是品牌壁垒+产能稀缺性微生物环境",
        "bottleneck": True,
        "bottleneck_type": "品牌壁垒+基酒产能"
      },
      {
        "position": "中游 — 次高端/区域白酒",
        "keywords": [
          "次高端",
          "中端白酒",
          "区域酒",
          "清香",
          "兼香",
          "馥郁香"
        ],
        "desc": "区域龙头和次高端品牌，产品结构升级空间大"
      },
      {
        "position": "下游 — 渠道/终端（经销/电商/团购）",
        "keywords": [
          "白酒经销",
          "酒类电商",
          "酒类流通",
          "烟酒店",
          "团购"
        ],
        "desc": "流通渠道与终端零售，渠道管理能力对酒企很重要"
      }
    ],
    "concepts": [
      "白酒",
      "贵州",
      "酿酒",
      "酱香",
      "浓香"
    ]
  },
  "云计算": {
    "name": "云计算产业链",
    "nodes": [
      {
        "position": "上游 — 服务器/算力硬件",
        "keywords": [
          "服务器",
          "AI服务器",
          "GPU服务器",
          "边缘服务器",
          "存储服务器"
        ],
        "desc": "云计算的物理算力硬件"
      },
      {
        "position": "上游 — 光模块/光互联（400G/800G/1.6T）",
        "keywords": [
          "光模块",
          "光通信",
          "400G",
          "800G",
          "1.6T",
          "硅光",
          "CPO",
          "DSP"
        ],
        "desc": "数据中心内部高速互联，AI驱动800G升级",
        "bottleneck": True,
        "bottleneck_type": "高速光芯片+DSP"
      },
      {
        "position": "上游 — IDC数据中心（机柜/制冷/UPS/配电）",
        "keywords": [
          "IDC",
          "数据中心",
          "机房",
          "机柜",
          "制冷",
          "UPS",
          "配电"
        ],
        "desc": "云计算的物理基础设施"
      },
      {
        "position": "中游 — IaaS云平台（公有云/私有云/混合云）",
        "keywords": [
          "IaaS",
          "公有云",
          "私有云",
          "混合云",
          "虚拟化",
          "云操作系统"
        ],
        "desc": "云基础设施即服务，规模效应明显"
      },
      {
        "position": "中游 — PaaS平台（数据库/中间件/容器/云原生）",
        "keywords": [
          "PaaS",
          "数据库",
          "中间件",
          "容器",
          "微服务",
          "云原生"
        ],
        "desc": "云原生应用开发平台"
      },
      {
        "position": "下游 — SaaS应用（ERP/CRM/协同办公）",
        "keywords": [
          "SaaS",
          "企业服务",
          "ERP",
          "CRM",
          "协同办公",
          "视频会议",
          "HR"
        ],
        "desc": "云化企业软件服务"
      }
    ],
    "concepts": [
      "云计算",
      "数据中心",
      "SaaS",
      "光模块",
      "IDC",
      "云"
    ]
  },
  "存储芯片": {
    "name": "存储芯片产业链",
    "nodes": [
      {
        "position": "上游 — NAND/DRAM晶圆制造",
        "keywords": [
          "NAND晶圆",
          "DRAM晶圆",
          "3D NAND",
          "先进制程",
          "1znm",
          "200层以上"
        ],
        "desc": "存储芯片的晶圆制造，3D NAND层数越多成本越低，长江存储200+层追赶",
        "bottleneck": True,
        "bottleneck_type": "超高深宽比刻蚀+多层堆叠",
        "domestic_rate": "5%",
        "tech_generation": "2D→32层→64层→128层→200+层→300+层"
      },
      {
        "position": "上游 — 存储设备（高深宽比刻蚀/薄膜沉积）",
        "keywords": [
          "刻蚀设备",
          "薄膜沉积",
          "3D NAND设备",
          "高深宽比刻蚀",
          "超高深宽比"
        ],
        "desc": "3D NAND的极高深宽比(>60:1)刻蚀是核心设备壁垒",
        "bottleneck": True,
        "bottleneck_type": "极高深宽比刻蚀"
      },
      {
        "position": "中游 — NAND Flash颗粒（TLC/QLC/PLC）",
        "keywords": [
          "NAND",
          "3D NAND",
          "TLC",
          "QLC",
          "SLC",
          "闪存"
        ],
        "desc": "非易失性存储颗粒，价格周期性波动极大"
      },
      {
        "position": "中游 — DRAM颗粒（DDR5/LPDDR5/HBM）",
        "keywords": [
          "DRAM",
          "DDR5",
          "LPDDR5",
          "DDR4",
          "HBM",
          "GDDR"
        ],
        "desc": "易失性存储颗粒，HBM是AI时代明星产品"
      },
      {
        "position": "中游 — HBM高带宽内存",
        "keywords": [
          "HBM",
          "HBM3",
          "HBM3E",
          "TSV",
          "Hybrid Bonding",
          "MR-MUF"
        ],
        "desc": "AI芯片必需的超高带宽内存，供不应求，SK海力士技术领先",
        "bottleneck": True,
        "bottleneck_type": "TSV+混合键合+散热",
        "domestic_rate": "0%"
      },
      {
        "position": "下游 — 存储模组/SSD/企业级SSD",
        "keywords": [
          "SSD",
          "固态硬盘",
          "内存模组",
          "U盘",
          "存储卡",
          "企业级SSD"
        ],
        "desc": "存储颗粒的封装和模组制造"
      },
      {
        "position": "下游 — 存储控制器/主控芯片",
        "keywords": [
          "存储主控",
          "SSD主控",
          "UFS主控",
          "eMMC主控",
          "NAND控制器"
        ],
        "desc": "存储设备的大脑，管理和控制数据读写"
      }
    ],
    "concepts": [
      "存储芯片",
      "DRAM",
      "NAND",
      "HBM",
      "闪存",
      "内存",
      "SSD"
    ]
  },
  "航空航天": {
    "name": "航空航天装备产业链",
    "nodes": [
      {
        "position": "上游 — 航空特种材料（高温合金/钛合金/复材/陶瓷基复材）",
        "keywords": [
          "高温合金",
          "钛合金",
          "碳纤维",
          "陶瓷基复材",
          "CMC",
          "SiC纤维",
          "铝锂合金"
        ],
        "desc": "航空航天装备材料基础，陶瓷基复材(CMC)用于航发热端部件，SiC纤维是瓶颈",
        "bottleneck": True,
        "bottleneck_type": "材料配方+精密铸造",
        "domestic_rate": "25%",
        "tech_generation": "铝合金→钛合金→复材→陶瓷基复材"
      },
      {
        "position": "上游 — 航电系统/机载芯片",
        "keywords": [
          "航电",
          "机载芯片",
          "飞控计算机",
          "无线电",
          "雷达",
          "导航",
          "座舱显示"
        ],
        "desc": "飞机的大脑和神经，高可靠/抗辐射/冗余设计是核心要求",
        "bottleneck": True,
        "bottleneck_type": "高可靠芯片+冗余架构",
        "domestic_rate": "20%"
      },
      {
        "position": "中游 — 航空发动机整机",
        "keywords": [
          "航空发动机",
          "涡扇",
          "涡轮盘",
          "风扇叶片",
          "燃烧室",
          "加力",
          "FADEC"
        ],
        "desc": "航空器心脏，全球仅GE/PW/RR三巨头可造大型民航航发",
        "bottleneck": True,
        "bottleneck_type": "单晶叶片+热障涂层+整机认证",
        "domestic_rate": "15%",
        "tech_generation": "涡喷→涡扇→齿轮传动涡扇→开式转子"
      },
      {
        "position": "中游 — 飞机机体/机翼/结构件",
        "keywords": [
          "机体",
          "机翼",
          "机身",
          "尾翼",
          "起落架",
          "舱门",
          "整体壁板"
        ],
        "desc": "飞机构造的主承力结构，大型整体壁板数控加工是核心能力"
      },
      {
        "position": "中游 — 航天装备（火箭/卫星/飞船/空间站）",
        "keywords": [
          "火箭",
          "卫星",
          "飞船",
          "空间站",
          "推进剂",
          "姿控",
          "太阳翼",
          "可回收"
        ],
        "desc": "航天装备制造，火箭可回收复用是降本关键(SpaceX领先)"
      },
      {
        "position": "中游 — 卫星制造/通信/遥感/导航",
        "keywords": [
          "卫星制造",
          "通信卫星",
          "遥感卫星",
          "导航卫星",
          "SAR",
          "光学遥感"
        ],
        "desc": "卫星制造和载荷，SAR雷达卫星和低轨通信星座是热点",
        "domestic_rate": "25%"
      },
      {
        "position": "下游 — 民航MRO/维修/大修",
        "keywords": [
          "MRO",
          "飞机维修",
          "大修",
          "发动机维修",
          "部附件",
          "起落架大修"
        ],
        "desc": "航空器维修维护，发动机大修是核心，CAAC认证是关键壁垒"
      },
      {
        "position": "下游 — 机场设备/空管系统",
        "keywords": [
          "机场设备",
          "空管",
          "导航台",
          "雷达",
          "廊桥",
          "行李系统",
          "安检"
        ],
        "desc": "机场地面和空管基础设施"
      }
    ],
    "concepts": [
      "航空航天",
      "航空",
      "航天",
      "发动机",
      "卫星",
      "火箭",
      "大飞机",
      "C919"
    ]
  },
  "船舶制造": {
    "name": "船舶制造产业链",
    "nodes": [
      {
        "position": "上游 — 造船板材/特种钢",
        "keywords": [
          "造船板",
          "特种钢",
          "高强度钢",
          "耐腐蚀钢",
          "殷瓦钢",
          "LNG储罐"
        ],
        "desc": "船舶建造基础材料，LNG船用殷瓦钢(Invar 36)仅法国GTT可授权",
        "bottleneck": True,
        "bottleneck_type": "殷瓦钢+焊接工艺",
        "domestic_rate": "20%"
      },
      {
        "position": "上游 — 船用发动机/动力系统",
        "keywords": [
          "船用发动机",
          "低速机",
          "中速机",
          "双燃料",
          "LNG动力",
          "氨燃料",
          "电力推进"
        ],
        "desc": "船舶动力核心，低速柴油机由MAN/WinGD设计专利授权垄断",
        "bottleneck": True,
        "bottleneck_type": "大功率低速机+专利授权",
        "domestic_rate": "30%",
        "tech_generation": "重油→LNG双燃料→氨燃料→甲醇燃料"
      },
      {
        "position": "上游 — 船用电子/导航/通信系统",
        "keywords": [
          "船用电子",
          "导航",
          "雷达",
          "GPS",
          "ECDIS",
          "GMDSS",
          "自动舵"
        ],
        "desc": "船舶驾驶和通信系统"
      },
      {
        "position": "中游 — 船体建造/分段制造",
        "keywords": [
          "船体",
          "分段",
          "总段",
          "船坞",
          "船台",
          "焊接",
          "精度控制"
        ],
        "desc": "船舶建造的核心环节，精度控制决定造船质量和效率"
      },
      {
        "position": "中游 — LNG船/超大型集装箱船/高端船型",
        "keywords": [
          "LNG船",
          "集装箱船",
          "FPSO",
          "邮轮",
          "LPG船",
          "汽车船",
          "破冰船"
        ],
        "desc": "高附加值船型，LNG船和邮轮是造船业皇冠",
        "bottleneck": True,
        "bottleneck_type": "LNG围护系统+船型设计",
        "domestic_rate": "30%"
      },
      {
        "position": "下游 — 海工装备（钻井平台/FPSO/风电安装）",
        "keywords": [
          "海工",
          "钻井平台",
          "FPSO",
          "风电安装船",
          "铺管船",
          "半潜"
        ],
        "desc": "海洋工程装备，FPSO是海上油气核心"
      },
      {
        "position": "下游 — 船舶配套/港口设备",
        "keywords": [
          "船舶配套",
          "港口",
          "岸桥",
          "堆场",
          "自动化码头",
          "AGV"
        ],
        "desc": "船舶配套和港口装卸设备"
      }
    ],
    "concepts": [
      "船舶",
      "造船",
      "船",
      "LNG船",
      "海工",
      "集装箱船",
      "航运"
    ]
  },
  "工业母机": {
    "name": "工业母机/数控机床产业链",
    "nodes": [
      {
        "position": "上游 — 数控系统/CNC控制器",
        "keywords": [
          "数控系统",
          "CNC",
          "控制器",
          "伺服驱动",
          "数控系统",
          "发那科",
          "西门子",
          "海德汉"
        ],
        "desc": "机床的大脑，发那科/西门子/海德汉三巨头垄断高端，华中数控/科德数控在追赶",
        "bottleneck": True,
        "bottleneck_type": "CNC内核+伺服算法",
        "domestic_rate": "10%",
        "tech_generation": "3轴→5轴联动→五轴RTCP→智能数控"
      },
      {
        "position": "上游 — 精密主轴/转台（电主轴/直驱转台）",
        "keywords": [
          "主轴",
          "电主轴",
          "机械主轴",
          "转台",
          "直驱转台",
          "摆头",
          "A/C轴"
        ],
        "desc": "机床的核心运动部件，高速电主轴(>20000rpm)和直驱转台是技术壁垒",
        "bottleneck": True,
        "bottleneck_type": "精密轴承+动平衡",
        "domestic_rate": "20%"
      },
      {
        "position": "上游 — 精密导轨/丝杠（直线导轨/滚珠丝杠）",
        "keywords": [
          "导轨",
          "直线导轨",
          "丝杠",
          "滚珠丝杠",
          "线性模组",
          "NSK",
          "THK",
          "Hiwin"
        ],
        "desc": "机床直线运动精度的核心，日本THK/NSK和台湾上银/银泰主导",
        "bottleneck": True,
        "bottleneck_type": "精密磨削+材料热处理",
        "domestic_rate": "15%"
      },
      {
        "position": "上游 — 机床铸件/床身/结构件",
        "keywords": [
          "铸件",
          "床身",
          "立柱",
          "工作台",
          "矿物铸件",
          "铸铁",
          "焊接结构"
        ],
        "desc": "机床的基础支承件，矿物铸件(人造花岗岩)的减振性优于铸铁"
      },
      {
        "position": "中游 — 五轴加工中心/高端机床",
        "keywords": [
          "五轴",
          "加工中心",
          "龙门",
          "卧加",
          "立加",
          "五轴联动"
        ],
        "desc": "高端数控机床的核心品类，五轴联动是航空/模具/汽车的关键装备",
        "bottleneck": True,
        "bottleneck_type": "热补偿+RTCP算法+装配",
        "domestic_rate": "15%",
        "tech_generation": "三轴→四轴→五轴3+2→五轴联动→并联机床"
      },
      {
        "position": "中游 — 高精度磨床/车床/镗床",
        "keywords": [
          "磨床",
          "车床",
          "镗床",
          "坐标镗",
          "高精度",
          "数控磨床"
        ],
        "desc": "精密加工的关键设备"
      },
      {
        "position": "中游 — 电加工机床/激光加工/增材制造",
        "keywords": [
          "线切割",
          "电火花",
          "EDM",
          "激光加工",
          "3D打印",
          "增材",
          "SLM"
        ],
        "desc": "特种加工和增材制造设备，SLM金属3D打印用于航空航天复杂零部件"
      },
      {
        "position": "下游 — 刀具/刀片/工具系统",
        "keywords": [
          "刀具",
          "刀片",
          "硬质合金",
          "陶瓷刀具",
          "CBN",
          "PCD",
          "HSK",
          "BT"
        ],
        "desc": "机床切削工具，硬质合金/涂层技术是核心",
        "bottleneck": True,
        "bottleneck_type": "涂层工艺+基体材料",
        "domestic_rate": "35%"
      }
    ],
    "concepts": [
      "工业母机",
      "数控机床",
      "五轴",
      "CNC",
      "精密加工",
      "机床",
      "刀具"
    ]
  },
  "通信设备": {
    "name": "通信设备/5G-6G产业链",
    "nodes": [
      {
        "position": "上游 — 基站芯片/射频芯片/FPGA",
        "keywords": [
          "基站芯片",
          "射频芯片",
          "FPGA",
          "PA",
          "LNA",
          "ADC",
          "DAC",
          "收发信机"
        ],
        "desc": "通信设备的核心芯片，基站用高速ADC/DAC和FPGA是壁垒",
        "bottleneck": True,
        "bottleneck_type": "高速ADC/DAC+FPGA",
        "domestic_rate": "15%"
      },
      {
        "position": "上游 — 光通信芯片/激光器/探测器",
        "keywords": [
          "光芯片",
          "激光器",
          "探测器",
          "EML",
          "VCSEL",
          "DFB",
          "APD",
          "硅光芯片"
        ],
        "desc": "光传输系统的核心器件，25G/100G EML激光器和相干光DSP是瓶颈",
        "bottleneck": True,
        "bottleneck_type": "高速激光器+相干DSP",
        "domestic_rate": "10%"
      },
      {
        "position": "上游 — 高频高速PCB/陶瓷滤波器",
        "keywords": [
          "高频PCB",
          "高速PCB",
          "陶瓷滤波器",
          "介质滤波器",
          "LTCC",
          "天线材料"
        ],
        "desc": "5G基站的高频电路板和滤波器，陶瓷介质滤波器是Massive MIMO关键",
        "domestic_rate": "40%"
      },
      {
        "position": "中游 — 基站设备（宏基站/小基站/AAU/BBU）",
        "keywords": [
          "基站",
          "宏基站",
          "小基站",
          "AAU",
          "BBU",
          "Massive MIMO",
          "毫米波"
        ],
        "desc": "5G/6G基站主设备，华为领先全球，Massive MIMO天线阵列是核心技术",
        "domestic_rate": "60%"
      },
      {
        "position": "中游 — 光传输设备（OTN/ROADM/CPE）",
        "keywords": [
          "光传输",
          "OTN",
          "ROADM",
          "WDM",
          "CPE",
          "SDH",
          "PTN"
        ],
        "desc": "骨干网和接入网的光传输系统"
      },
      {
        "position": "中游 — 核心网/交换/路由设备",
        "keywords": [
          "核心网",
          "交换机",
          "路由器",
          "5GC",
          "UPF",
          "SDN",
          "NFV",
          "边缘计算"
        ],
        "desc": "网络核心节点设备，华为/思科/诺基亚主导"
      },
      {
        "position": "下游 — 通信运营/IDC/CDN/边缘节点",
        "keywords": [
          "通信运营",
          "IDC",
          "CDN",
          "边缘节点",
          "5G应用",
          "网络优化"
        ],
        "desc": "通信网络运营和服务"
      },
      {
        "position": "下游 — 5G行业应用（工业互联网/车联网/远程医疗）",
        "keywords": [
          "5G应用",
          "工业互联网",
          "车联网V2X",
          "远程医疗",
          "超高清",
          "云游戏"
        ],
        "desc": "5G赋能垂直行业应用"
      }
    ],
    "concepts": [
      "通信",
      "5G",
      "6G",
      "光通信",
      "基站",
      "光模块",
      "芯片",
      "华为"
    ]
  }
}

# ── 别名映射 ──────────────────────────────────────────────────────

INDUSTRY_ALIASES = {
    "5G": "通信设备",
    "6G": "通信设备",
    "ADC": "创新药",
    "AI": "人工智能",
    "AIGC": "人工智能",
    "AI算力": "AI芯片",
    "CXO": "创新药",
    "DRAM": "存储芯片",
    "GPU": "AI芯片",
    "HBM": "存储芯片",
    "HJT": "光伏",
    "IDC": "云计算",
    "LLM": "人工智能",
    "LNG船": "船舶制造",
    "NAND": "存储芯片",
    "OLED": "消费电子",
    "PCB": "消费电子",
    "PEEK": "新材料",
    "SaaS": "云计算",
    "TOPCon": "光伏",
    "eVTOL": "低空经济",
    "云计算": "云计算",
    "五轴": "工业母机",
    "人形机器人": "具身智能",
    "传感器": "具身智能",
    "低空": "低空经济",
    "光伏": "光伏",
    "光模块": "AI芯片",
    "光通信": "通信设备",
    "具身": "具身智能",
    "内存": "存储芯片",
    "军工": "军工",
    "减速器": "具身智能",
    "医疗": "医疗器械",
    "医药": "创新药",
    "单抗": "创新药",
    "卫星": "航空航天",
    "发动机": "航空航天",
    "国防": "军工",
    "基站": "通信设备",
    "大模型": "人工智能",
    "大飞机": "航空航天",
    "太阳能": "光伏",
    "存储": "存储芯片",
    "封测": "半导体",
    "工业母机": "工业母机",
    "手机": "消费电子",
    "数控": "工业母机",
    "新材料": "新材料",
    "新能源": "新能源汽车",
    "新能源车": "新能源汽车",
    "无人机": "低空经济",
    "晶圆": "半导体",
    "机器人": "具身智能",
    "机床": "工业母机",
    "毛泽东思想": "军工",
    "氢能": "氢能源",
    "消费电子": "消费电子",
    "灵巧手": "具身智能",
    "燃料电池": "氢能源",
    "电动车": "新能源汽车",
    "白酒": "白酒",
    "硅片": "半导体",
    "碳纤维": "新材料",
    "稀土": "新材料",
    "算力": "AI芯片",
    "绿氢": "氢能源",
    "航天": "航空航天",
    "航空": "航空航天",
    "航空航天": "航空航天",
    "船": "船舶制造",
    "船舶": "船舶制造",
    "芯片": "半导体",
    "通信": "通信设备",
    "造船": "船舶制造",
    "酒": "白酒",
    "钙钛矿": "光伏",
    "锂电": "新能源汽车",
    "闪存": "存储芯片",
    "集成电路": "半导体",
    "面板": "消费电子",
    "飞行汽车": "低空经济",
    "高温合金": "新材料",
}


def resolve_industry(query: str) -> tuple:
    """解析行业名称 → (标准行业名, 产业链结构)
    支持: 精确匹配 → 别名匹配 → 关键词模糊匹配（节点关键词/概念词）
    """
    q = query.strip()
    if q in INDUSTRY_CHAINS:
        return q, INDUSTRY_CHAINS[q]
    if q in INDUSTRY_ALIASES:
        target = INDUSTRY_ALIASES[q]
        return target, INDUSTRY_CHAINS[target]
    for key, chain in INDUSTRY_CHAINS.items():
        for concept in chain.get("concepts", []):
            if len(q) >= 2 and concept in q:
                return key, chain
        for node in chain.get("nodes", []):
            for kw in node.get("keywords", []):
                if len(q) >= 2 and kw in q:
                    return key, chain
    return None, None


def get_all_industry_names() -> list:
    return list(INDUSTRY_CHAINS.keys())


def get_bottleneck_nodes(industry_name: str) -> list:
    """返回指定行业的瓶颈环节列表"""
    chain = INDUSTRY_CHAINS.get(industry_name)
    if not chain:
        return []
    return [n for n in chain["nodes"] if n.get("bottleneck")]


def get_bottleneck_summary(industry_name: str) -> list:
    """返回瓶颈环节的详细摘要（含bottleneck_type/domestic_rate/tech_generation）"""
    chain = INDUSTRY_CHAINS.get(industry_name)
    if not chain:
        return []
    result = []
    for n in chain["nodes"]:
        if n.get("bottleneck"):
            result.append({
                "position": n["position"],
                "type": n.get("bottleneck_type", ""),
                "domestic_rate": n.get("domestic_rate", "未知"),
                "tech_generation": n.get("tech_generation", ""),
                "desc": n["desc"][:100],
            })
    return result


def get_tech_generation_map(industry_name: str) -> dict:
    """返回行业的技术代际演进路线图"""
    chain = INDUSTRY_CHAINS.get(industry_name)
    if not chain:
        return {}
    result = {}
    for n in chain["nodes"]:
        if n.get("tech_generation"):
            result[n["position"]] = n["tech_generation"]
    return result
