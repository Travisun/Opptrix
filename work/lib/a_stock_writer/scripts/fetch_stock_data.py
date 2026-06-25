#!/usr/bin/env python3
"""
AStockWriter 数据采集工具
根据文章类型自动采集所需数据维度

用法:
    python3 fetch_stock_data.py <股票代码> --type <文章类型>
    
文章类型: value/technical/chain/earnings/event/compare/review
"""

import argparse
import json
import sys
from datetime import datetime, timedelta

try:
    from a_stock_layer import AshareEngine
except ImportError:
    print("ERROR: AStockLayer 未安装。请先安装 AStockLayer 插件。")
    print("pip install -e /path/to/a-stock-layer")
    sys.exit(1)


DATA_TEMPLATES = {
    "value": {
        "name": "价值分析",
        "required": ["realtime", "financials", "dividend", "main_business", "profile"],
        "recommended": ["balance_sheet", "cash_flow", "inst_holding", "peer_companies"],
    },
    "technical": {
        "name": "技术分析",
        "required": ["realtime", "kline", "tech_indicator", "money_flow"],
        "recommended": ["intraday_tick", "market_breadth", "sector_money_flow", "dragon_tiger"],
    },
    "chain": {
        "name": "产业链分析",
        "required": ["main_business", "top_customer", "top_supplier", "subsidiaries", "rd_investment"],
        "recommended": ["actual_controller", "related_party", "peer_companies", "profile"],
    },
    "earnings": {
        "name": "财报解读",
        "required": ["income_statement", "balance_sheet", "cash_flow", "financials", "realtime"],
        "recommended": ["perf_forecast", "dividend", "rd_investment", "shareholders"],
    },
    "event": {
        "name": "事件驱动",
        "required": ["news", "realtime", "sentiment", "money_flow"],
        "recommended": ["insider_trade", "lockup_expiry", "share_pledge", "intraday_tick"],
    },
    "compare": {
        "name": "对比分析",
        "required": ["profile", "financials", "main_business", "realtime"],
        "recommended": ["peer_companies", "rd_investment", "inst_holding"],
    },
    "review": {
        "name": "实盘复盘",
        "required": ["realtime", "kline", "portfolio_trades"],
        "recommended": ["money_flow", "news"],
    },
}


def query_dimension(engine, code, dim, **kwargs):
    """查询单个数据维度，返回数据或 None"""
    query_map = {
        "realtime": lambda: engine.realtime(code),
        "kline": lambda: engine.kline(code, "daily", 
            start=(datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")),
        "profile": lambda: engine.profile(code),
        "financials": lambda: engine.financials(code),
        "income_statement": lambda: engine.income_statement(code),
        "balance_sheet": lambda: engine.balance_sheet(code),
        "cash_flow": lambda: engine.cash_flow(code),
        "money_flow": lambda: engine.money_flow(code),
        "main_business": lambda: engine.main_business(code),
        "dividend": lambda: engine.dividend(code),
        "news": lambda: engine.news(code),
        "sentiment": lambda: engine.sentiment(code),
        "shareholders": lambda: engine.shareholders(code),
        "inst_holding": lambda: engine.inst_holding(code),
        "insider_trade": lambda: engine.insider_trade(code),
        "lockup_expiry": lambda: engine.lockup_expiry(code),
        "share_pledge": lambda: engine.share_pledge(code),
        "peer_companies": lambda: engine.peer_companies(code),
        "perf_forecast": lambda: engine.perf_forecast(code),
        "tech_indicator": lambda: engine.tech_indicator(code, "daily", 120),
        "rd_investment": lambda: engine.rd_investment(code),
        "actual_controller": lambda: engine.actual_controller(code),
        "subsidiaries": lambda: engine.subsidiaries(code),
        "related_party": lambda: engine.related_party_trades(code),
        "top_customer": lambda: engine.top_customer_supplier(code, "customer"),
        "top_supplier": lambda: engine.top_customer_supplier(code, "supplier"),
        "intraday_tick": lambda: engine.intraday_tick(code),
        "dragon_tiger": lambda: engine.dragon_tiger(datetime.now().strftime("%Y-%m-%d")),
        "market_breadth": lambda: engine.market_breadth(),
        "sector_money_flow": lambda: engine.sector_money_flow(),
        "global_index": lambda: engine.global_index("dji"),
        "exchange_rate": lambda: engine.exchange_rate("USDCNY"),
        "portfolio_trades": lambda: engine.portfolio.trades(code),
        "macro_indicator": lambda: engine.macro_indicator("CPI"),
    }
    
    if dim not in query_map:
        return {"error": f"未知数据维度: {dim}"}
    
    try:
        result = query_map[dim]()
        if result.success:
            return {
                "success": True,
                "source": result.source,
                "cached": result.cached,
                "data": [d.__dict__ if hasattr(d, "__dict__") else d for d in result.data]
            }
        else:
            return {"success": False, "error": result.error}
    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="AStockWriter 数据采集")
    parser.add_argument("code", help="股票代码, 如 600519")
    parser.add_argument("--type", default="value", choices=DATA_TEMPLATES.keys(),
        help="文章类型")
    parser.add_argument("--json", action="store_true", help="JSON 格式输出")
    args = parser.parse_args()
    
    engine = AshareEngine()
    template = DATA_TEMPLATES[args.type]
    
    # 先查基础行情确认股票
    rt = engine.realtime(args.code)
    if not rt.success:
        print(f"❌ 无法获取 {args.code} 的实时数据，请确认股票代码正确。")
        sys.exit(1)
    
    stock_name = rt.data[0].name
    print(f"📊 正在采集 {stock_name}({args.code}) 的 {template['name']} 数据...\n")
    
    results = {}
    all_dims = template["required"] + [d for d in template["recommended"]]
    
    for dim in all_dims:
        print(f"  ⟳ 查询 {dim}...", end=" ")
        data = query_dimension(engine, args.code, dim)
        results[dim] = data
        if data.get("success"):
            print(f"✅ 来自 {data.get('source', 'unknown')}")
        else:
            print(f"⚠️  {data.get('error', '未知错误')}")
    
    # 市场全局数据（一次就够了）
    print("\n  ⟳ 查询大盘背景...")
    for dim in ["market_breadth", "global_index", "exchange_rate"]:
        data = query_dimension(engine, args.code, dim)
        if data.get("success"):
            print(f"    ✅ {dim} 查询成功")
    
    print(f"\n✅ 数据采集完成。共查询 {len(all_dims)} 个维度。")
    
    if args.json:
        print(json.dumps(results, ensure_ascii=False, default=str, indent=2))
    else:
        print(f"\n📋 数据概要:")
        print(f"  标的: {stock_name}({args.code})")
        print(f"  类型: {template['name']}")
        print(f"  必需维度: {len(template['required'])}/{len(template['required'])}")
        print(f"  推荐维度: {sum(1 for d in template['recommended'] if results.get(d, {}).get('success'))}/{len(template['recommended'])}")


if __name__ == "__main__":
    main()
