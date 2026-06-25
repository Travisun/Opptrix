"""
工具函数 — 证券代码转换、数据清洗
"""

from __future__ import annotations

from typing import Optional

# 已知的上海交易所指数代码（以 000 开头）
SH_INDEX_PREFIXES = {"000", "001", "003", "008"}

# 已知的上海指数代码集合（常见）
SH_INDEX_CODES = {
    "000001",  # 上证指数
    "000002",  # 上证A指
    "000003",  # 上证B指
    "000010",  # 上证180
    "000016",  # 上证50
    "000300",  # 沪深300
    "000688",  # 科创50
    "000905",  # 中证500
    "000906",  # 中证800
    "000922",  # 中证红利
    "000932",  # 中证消费
    "000963",  # 中证医疗
    "000985",  # 中证全指
    "001112",  # 中证白酒
    "001113",  # 中证新能源
}

# 已知的深圳指数代码（以 399 开头）
SZ_INDEX_CODES = {
    "399001",  # 深证成指
    "399005",  # 中小板指
    "399006",  # 创业板指
    "399007",  # 深证300
    "399008",  # 中小300
    "399009",  # 深证200
    "399010",  # 深证700
    "399011",  # 深证1000
    "399012",  # 创业板50
    "399013",  # 深证成份
    "399015",  # 中小创新
    "399016",  # 深证创新
    "399017",  #  SME
    "399018",  # 创业板300
    "399050",  # 深证50
    "399100",  # 深证综指
    "399300",  # 沪深300(深圳)
    "399330",  # 深证100
    "399393",  # 国证芯片
    "399440",  # 国证钢铁
    "399550",  # 深证成长
    "399610",  # TMT50
    "399620",  # 中创100
    "399660",  # 深证能源
    "399670",  # 深证材料
    "399680",  # 深证工业
    "399690",  # 深证可选
    "399700",  # 深证消费
    "399705",  # 深证医药
    "399710",  # 深证金融
    "399720",  # 深证信息
    "399730",  # 深证电信
    "399750",  # 深证公用
    "399910",  # 深证治理
    "399995",  # 国证军工
}


def resolve_secid(code: str) -> str:
    """解析证券代码为东方财富 secid 格式。

    Returns:
        "1.600519" (上交所股票) / "0.000001" (深交所股票或指数)
        对于已知指数代码做特殊处理:
        - 000XXX 开头的 -> 上海指数 (1.)
        - 399XXX 开头的 -> 深圳指数 (0.)
    """
    c = code.strip().zfill(6)

    # 指数代码特殊处理
    if c in SH_INDEX_CODES:
        return f"1.{c}"
    if c in SZ_INDEX_CODES:
        return f"0.{c}"

    # 如果以 399 开头且不在已知列表中，默认深圳指数
    if c.startswith("399"):
        return f"0.{c}"

    # 上海股票: 6xx, 68x, 9xx
    if c.startswith(("6", "68", "9")):
        return f"1.{c}"

    # 默认深圳
    return f"0.{c}"


def resolve_full_code(code: str) -> str:
    """解析为带交易所前缀的代码，如 'sh600519'/'sz000001'。"""
    c = code.strip().zfill(6)

    if c in SH_INDEX_CODES:
        return f"sh{c}"
    if c in SZ_INDEX_CODES:
        return f"sz{c}"
    if c.startswith("399"):
        return f"sz{c}"

    if c.startswith(("6", "68", "9")):
        return f"sh{c}"
    return f"sz{c}"


def safe_float(v) -> Optional[float]:
    """安全转 float。"""
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def normalize_change_pct(v) -> Optional[float]:
    """归一化涨跌幅到百分比（部分接口可能返回万分之一单位）。"""
    f = safe_float(v)
    if f is None:
        return None
    # 如果绝对值 > 50，可能是万分比（如 -153 = -1.53%）
    if abs(f) > 50:
        return f / 100.0
    return f


def normalize_price(v) -> Optional[float]:
    """归一化价格到元。"""
    f = safe_float(v)
    if f is None:
        return None
    # 如果值 > 100000，可能是分而不是元
    if abs(f) > 100000:
        return f / 100.0
    return f
