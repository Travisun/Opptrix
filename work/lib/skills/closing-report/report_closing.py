#!/usr/bin/env python3
"""
收盘报告生成器 — AStockLayer 收盘报告 skill

A股收盘后（15:30 后）调用，生成当日市场全景复盘：
大盘表现、资金流向、涨停跌停、龙虎榜、热点板块、成交量能、
市场状态研判、持仓盈亏、重要事件回顾、隔夜展望。

用法:
    from a_stock_layer import AshareEngine
    from skills.closing_report.report_closing import ClosingReport

    engine = AshareEngine()
    reporter = ClosingReport(engine)
    report = reporter.generate()
    print(report)
"""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from a_stock_layer import AshareEngine

logger = logging.getLogger("closing_report")


class ClosingReport:
    """收盘报告生成器"""

    CN_INDICES = {
        "000001": "上证指数",
        "399001": "深证成指",
        "399006": "创业板指",
        "000688": "科创50",
        "000016": "上证50",
        "000300": "沪深300",
        "000905": "中证500",
        "000852": "中证1000",
    }

    def __init__(self, engine: AshareEngine):
        self.engine = engine

    # ── 公用辅助 ──────────────────────────────────────────────────

    def _today(self) -> str:
        return date.today().isoformat()

    def _pct(self, v: Optional[float]) -> str:
        if v is None:
            return "--"
        return f"{v:+.2f}%"

    def _fmt_num(self, v: Optional[float], unit: str = "亿") -> str:
        if v is None:
            return "--"
        if abs(v) >= 1e8:
            return f"{v/1e8:.2f}{unit}"
        if abs(v) >= 1e4:
            return f"{v/1e4:.2f}万"
        return f"{v:.2f}"

    def _flag(self, v: float) -> str:
        if v > 0:
            return "🟢"
        elif v < 0:
            return "🔴"
        return "⚪"

    # ── 数据采集模块 ──────────────────────────────────────────────

    def _collect_indices(self) -> list[dict]:
        items = []
        for code, name in self.CN_INDICES.items():
            r = self.engine.index_realtime(code)
            if r.success and r.data:
                d = r.data[0]
                items.append({
                    "code": code, "name": name,
                    "price": d.price, "change_pct": d.change_pct,
                    "pre_close": d.pre_close, "open": d.open,
                    "high": d.high, "low": d.low,
                    "volume": d.volume, "amount": d.amount,
                })
        return items

    def _collect_breadth(self) -> Optional[dict]:
        r = self.engine.market_breadth()
        if r.success and r.data:
            return r.data[0].to_dict()
        return None

    def _collect_limit_updown(self) -> list[dict]:
        r = self.engine.limit_updown()
        if r.success and r.data:
            return [d.to_dict() for d in r.data]
        return []

    def _collect_north_flow(self) -> list[dict]:
        r = self.engine.market_money_flow("north")
        if r.success and r.data:
            return [d.to_dict() for d in r.data]
        return []

    def _collect_sector_flows(self) -> list[dict]:
        r = self.engine.sector_money_flow("industry")
        if r.success and r.data:
            return [d.to_dict() for d in r.data]
        return []

    def _collect_dragon_tiger(self) -> list[dict]:
        r = self.engine.dragon_tiger()
        if r.success and r.data:
            return [d.to_dict() for d in r.data]
        return []

    def _collect_margin_data(self, codes: list[str] = None) -> list[dict]:
        """采集融资融券数据（如果有关注的股票）"""
        if not codes:
            return []
        results = []
        for code in codes[:10]:
            r = self.engine.margin_trade(code)
            if r.success and r.data:
                results.append(r.data[0].to_dict())
        return results

    def _collect_convertible_bonds(self) -> list[dict]:
        r = self.engine.convertible_bonds()
        if r.success and r.data:
            return [d.to_dict() for d in r.data]
        return []

    def _collect_positions(self) -> list[dict]:
        """采集持仓盈亏"""
        try:
            summary = self.engine.portfolio.summary()
            holdings = self.engine.portfolio.holdings()
            if not holdings:
                return []

            # 获取每只持仓的当日K线来判断今日涨跌
            today = self._today()
            results = []
            for pos in holdings:
                item = {
                    "code": pos.code, "name": pos.name,
                    "shares": pos.shares,
                    "cost_basis": pos.cost_basis,
                    "current_price": pos.current_price,
                    "market_value": pos.market_value,
                    "unrealized_pnl": pos.unrealized_pnl,
                    "unrealized_pnl_pct": pos.unrealized_pnl_pct,
                    "realized_pnl": pos.realized_pnl,
                }
                # 获取今日涨跌幅
                k = self.engine.kline(pos.code, period="daily",
                                      start=today, end=today)
                if k.success and k.data:
                    item["today_change_pct"] = k.data[0].change_pct
                results.append(item)
            return results
        except Exception as e:
            logger.warning("采集持仓数据失败: %s", e)
            return []

    def _collect_holdings_news(self, positions: list[dict]) -> list[dict]:
        """获取持仓股票的今日公告"""
        news_list = []
        for pos in positions[:5]:
            r = self.engine.news(pos.get("code", ""), page=1, page_size=3)
            if r.success and r.data:
                for item in r.data:
                    nd = item.to_dict()
                    nd["stock_name"] = pos.get("name", "")
                    news_list.append(nd)
        news_list.sort(key=lambda x: x.get("date", ""), reverse=True)
        return news_list[:10]

    # ── 分析模块 ──────────────────────────────────────────────────

    def _analyze_style_rotation(self, indices: list[dict]) -> str:
        """风格轮动分析"""
        if not indices:
            return "数据不足"

        idx_map = {i["code"]: i for i in indices}

        # 大票 vs 小票
        hs300 = idx_map.get("000300")
        zz1000 = idx_map.get("000852")
        # 主板 vs 创业板
        sz = idx_map.get("399001")
        cyb = idx_map.get("399006")

        signals = []

        if hs300 and zz1000 and hs300["change_pct"] and zz1000["change_pct"]:
            spread = zz1000["change_pct"] - hs300["change_pct"]
            if spread > 1.5:
                signals.append("小票明显强于大票（中证1000 > 沪深300），偏好中小盘")
            elif spread > 0.5:
                signals.append("小票略强于大票，中小盘风格占优")
            elif spread < -1.5:
                signals.append("大票显著强于小票（沪深300 > 中证1000），偏好权重蓝筹")
            elif spread < -0.5:
                signals.append("大票略强于小票，蓝筹风格占优")
            else:
                signals.append("大小盘风格均衡")

        if sz and cyb and sz["change_pct"] and cyb["change_pct"]:
            spread2 = cyb["change_pct"] - sz["change_pct"]
            if spread2 > 1:
                signals.append("创业板领涨，成长风格突出")
            elif spread2 < -1:
                signals.append("创业板跑输，价值风格占优")

        return " | ".join(signals) if signals else "风格不明确"

    def _analyze_breadth(self, breadth: Optional[dict]) -> str:
        """市场广度分析"""
        if not breadth:
            return "数据不足"

        advance = breadth.get("advance", 0)
        decline = breadth.get("decline", 0)
        total = advance + decline
        ratio = advance / max(decline, 1)

        if ratio > 5:
            return "全面普涨，市场做多意愿强烈"
        elif ratio > 3:
            return "市场强势，赚钱效应较好"
        elif ratio > 2:
            return "多方占优，结构性机会"
        elif ratio > 1.2:
            return "窄幅偏强，个股分化"
        elif ratio > 0.8:
            return "涨跌参半，方向不明"
        elif ratio > 0.5:
            return "空方占优，谨慎参与"
        else:
            return "全面弱势，亏钱效应明显"

    def _analyze_limit_up_down(self, limits: list[dict]) -> dict:
        """涨停跌停深度分析"""
        result = {
            "limit_up_count": 0,
            "limit_down_count": 0,
            "consecutive_board": [],      # 连板股
            "concept_distribution": {},   # 概念分布
            "failed_limit_ups": 0,        # 炸板
        }

        for item in limits:
            lt = item.get("limit_type", "")
            cd = item.get("consecutive_days", 0) or 0

            if "涨停" in lt:
                result["limit_up_count"] += 1
                if cd >= 2:
                    result["consecutive_board"].append(item)
                # 概念统计
                reason = item.get("reason", "")
                if reason:
                    concepts = [c.strip() for c in reason.replace("、", ",").split(",")]
                    for c in concepts:
                        result["concept_distribution"][c] = result["concept_distribution"].get(c, 0) + 1
            elif "跌停" in lt:
                result["limit_down_count"] += 1
            elif "炸板" in lt:
                result["failed_limit_ups"] += 1

        return result

    def _analyze_dragon_tiger(self, dragons: list[dict]) -> dict:
        """龙虎榜深度分析"""
        result = {
            "inst_buy": [],   # 机构净买入 top3
            "inst_sell": [],  # 机构净卖出 top3
            "top_net": [],    # 净额最大 top5
        }

        # 检测机构席位
        inst_buy_list = []
        inst_sell_list = []
        all_stocks = []

        for d in dragons:
            net = d.get("net_amount", 0) or 0
            all_stocks.append(d)

            buy_detail = d.get("buy_detail", []) or []
            sell_detail = d.get("sell_detail", []) or []

            # 简单检测: 席位名含"机构专用"
            inst_buy_total = 0
            inst_sell_total = 0
            for seat in buy_detail:
                if isinstance(seat, dict):
                    if "机构专用" in seat.get("name", ""):
                        inst_buy_total += seat.get("buy", 0) or 0
            for seat in sell_detail:
                if isinstance(seat, dict):
                    if "机构专用" in seat.get("name", ""):
                        inst_sell_total += seat.get("sell", 0) or 0

            if inst_buy_total > 0:
                inst_buy_list.append({
                    "code": d.get("code", ""),
                    "name": d.get("name", ""),
                    "inst_net": inst_buy_total - inst_sell_total,
                    "total_net": net,
                })
            if inst_sell_total > 0:
                inst_sell_list.append({
                    "code": d.get("code", ""),
                    "name": d.get("name", ""),
                    "inst_net": inst_buy_total - inst_sell_total,
                    "total_net": net,
                })

        inst_buy_list.sort(key=lambda x: x["inst_net"], reverse=True)
        inst_sell_list.sort(key=lambda x: x["inst_net"])
        all_stocks.sort(key=lambda x: x.get("net_amount", 0) or 0, reverse=True)

        result["inst_buy"] = inst_buy_list[:3]
        result["inst_sell"] = inst_sell_list[:3]
        result["top_net"] = all_stocks[:5]

        return result

    def _analyze_volume(self, breadth: Optional[dict],
                        indices: list[dict]) -> dict:
        """成交量能分析"""
        result = {"total_amount": None, "volume_signal": ""}
        if not breadth:
            return result

        total_amount = breadth.get("total_amount")
        result["total_amount"] = total_amount

        if total_amount:
            if total_amount > 1.5e12:
                result["volume_signal"] = "放量活跃（>1.5万亿），市场交投旺盛"
            elif total_amount > 1.2e12:
                result["volume_signal"] = "量能充沛（>1.2万亿），支撑行情"
            elif total_amount > 8e11:
                result["volume_signal"] = "量能正常（8000亿~1.2万亿），存量博弈"
            else:
                result["volume_signal"] = "缩量（<8000亿），资金观望浓厚"
        return result

    def _assess_market_regime(self, breadth: Optional[dict],
                               limit_analysis: dict,
                               volume: dict,
                               north_flows: list[dict]) -> str:
        """综合判定市场状态"""
        score = 0
        reasons = []

        # 涨跌比
        if breadth:
            advance = breadth.get("advance", 0)
            decline = breadth.get("decline", 0)
            ratio = advance / max(decline, 1)
            if ratio > 3:
                score += 3
                reasons.append("涨跌比>3:1")
            elif ratio > 2:
                score += 2
                reasons.append("涨跌比>2:1")
            elif ratio > 1.2:
                score += 1
            elif ratio < 0.5:
                score -= 2
                reasons.append("涨跌比<0.5:1")
            elif ratio < 0.8:
                score -= 1

        # 涨停跌停
        lu = limit_analysis.get("limit_up_count", 0)
        ld = limit_analysis.get("limit_down_count", 0)
        if lu > 80:
            score += 2
            reasons.append(f"涨停{lu}家")
        elif lu > 40:
            score += 1
        elif lu < 10:
            score -= 1
            reasons.append(f"涨停仅{lu}家")

        if ld > 20:
            score -= 1
            reasons.append(f"跌停{ld}家")

        # 成交额
        ta = volume.get("total_amount")
        if ta:
            if ta > 1.5e12:
                score += 2
                reasons.append("放量")
            elif ta < 7e11:
                score -= 1
                reasons.append("缩量")

        # 北向
        if north_flows:
            last_net = north_flows[0].get("net_amount", 0) or 0
            if last_net > 5e9:
                score += 2
                reasons.append("北向大幅流入")
            elif last_net < -5e9:
                score -= 2
                reasons.append("北向大幅流出")

        if score >= 5:
            regime = "强势 🟢"
            advice = "可积极操作，关注领涨板块持续性"
        elif score >= 2:
            regime = "偏强 🟡"
            advice = "结构性机会为主，注意轮动节奏"
        elif score >= -1:
            regime = "震荡 ⚪"
            advice = "控制仓位，高抛低吸"
        elif score >= -3:
            regime = "偏弱 🟤"
            advice = "降低预期，防御为主"
        else:
            regime = "弱势 🔴"
            advice = "谨慎观望，耐心等待信号"

        reason_text = "，".join(reasons) if reasons else ""
        return f"{regime} | {advice} | {reason_text}"

    def _analyze_cb_opportunities(self, cbs: list[dict]) -> list[dict]:
        """可转债机会分析"""
        opportunities = []
        for cb in cbs:
            premium = cb.get("premium_ratio")
            price = cb.get("bond_price")
            if premium is not None and price is not None:
                if premium < 0:
                    opportunities.append({
                        "type": "折价转股套利",
                        "bond": cb.get("bond_name", ""),
                        "stock": cb.get("stock_name", ""),
                        "premium": premium,
                        "price": price,
                    })
                elif premium < 10 and price < 120:
                    opportunities.append({
                        "type": "低溢价活跃",
                        "bond": cb.get("bond_name", ""),
                        "stock": cb.get("stock_name", ""),
                        "premium": premium,
                        "price": price,
                    })
        return opportunities[:5]

    # ── 格式化模块 ──────────────────────────────────────────────────

    def _format_indices_table(self, indices: list[dict]) -> str:
        if not indices:
            return "暂无数据"
        lines = [f"| {'' :<3} | 指数 | 收盘 | 涨跌幅 |"]
        lines.append(f"|{'---'}:|{'---'}:|{'---'}:|{'---'}:|")
        for idx in indices:
            flag = self._flag(idx["change_pct"] or 0)
            fmt_pct = self._pct(idx["change_pct"])
            price_str = f"{idx['price']:.2f}" if idx["price"] else "--"
            lines.append(f"| {flag} | {idx['name']} | {price_str} | {fmt_pct} |")
        return "\n".join(lines)

    def _format_limit_analysis(self, analysis: dict) -> str:
        lines = []
        lu = analysis.get("limit_up_count", 0)
        ld = analysis.get("limit_down_count", 0)
        lines.append(f"涨停 {lu} 家 | 跌停 {ld} 家")

        # 连板
        boards = analysis.get("consecutive_board", [])
        if boards:
            board_by_days = defaultdict(list)
            for b in boards:
                cd = b.get("consecutive_days", 0)
                board_by_days[cd].append(b.get("name", b.get("code", "")))
            max_board = max(board_by_days.keys()) if board_by_days else 0
            max_stocks = board_by_days.get(max_board, [])
            lines.append(f"最高连板: {max_board}板 — {', '.join(max_stocks[:3])}")

        # 概念分布
        concept_dist = analysis.get("concept_distribution", {})
        if concept_dist:
            sorted_concepts = sorted(concept_dist.items(), key=lambda x: x[1], reverse=True)
            top = sorted_concepts[:5]
            concept_str = " | ".join(f"{c}({n}家)" for c, n in top)
            lines.append(f"涨停概念: {concept_str}")

        failed = analysis.get("failed_limit_ups", 0)
        if failed > 0:
            lines.append(f"炸板 {failed} 家（情绪分歧）")

        return "\n".join(lines)

    def _format_dragon_tiger(self, analysis: dict) -> str:
        lines = []
        inst_buy = analysis.get("inst_buy", [])
        inst_sell = analysis.get("inst_sell", [])
        top_net = analysis.get("top_net", [])

        if inst_buy:
            buy_str = " / ".join(
                f"{i['name']}(净买入{self._fmt_num(i['inst_net'])})" for i in inst_buy
            )
            lines.append(f"机构净买入: {buy_str}")
        else:
            lines.append("机构净买入: 暂无数据")

        if inst_sell:
            sell_str = " / ".join(
                f"{i['name']}(净卖出{self._fmt_num(abs(i['inst_net']))})" for i in inst_sell
            )
            lines.append(f"机构净卖出: {sell_str}")

        if top_net:
            net_str = " / ".join(
                f"{t.get('name', '')}({self._fmt_num(t.get('net_amount', 0))})" for t in top_net[:3]
            )
            lines.append(f"龙虎榜净额Top3: {net_str}")

        return "\n".join(lines)

    def _format_sector_rotation(self, sectors: list[dict]) -> str:
        if not sectors:
            return "暂无数据"
        sorted_sectors = sorted(
            sectors, key=lambda x: x.get("main_net", 0) or 0, reverse=True
        )
        top3 = sorted_sectors[:3]
        bottom3 = sorted_sectors[-3:] if len(sorted_sectors) >= 3 else sorted_sectors

        lines = []
        lines.append("**流入Top3:**")
        for s in top3:
            leader = ""
            if s.get("top_stocks"):
                leaders = s["top_stocks"][:2]
                leader = " 领涨: " + " ".join(f"{l[0]}({l[1]})" for l in leaders if isinstance(l, (list, tuple)) and len(l) >= 2)
            lines.append(f"  🟢 {s['sector_name']} +{self._fmt_num(s.get('main_net', 0))}{leader}")

        lines.append("**流出Top3:**")
        for s in bottom3:
            lines.append(f"  🔴 {s['sector_name']} {self._fmt_num(s.get('main_net', 0))}")

        return "\n".join(lines)

    def _format_positions(self, positions: list[dict]) -> str:
        if not positions:
            return "无持仓数据"

        lines = []
        lines.append(f"| {'代码':<8} | {'名称':<10} | {'今日':<8} | {'累计盈亏%':<10} | {'市值':<10} | {'关注'}")
        lines.append(f"|{'---'}:|{'---'}:|{'---'}:|{'---'}:|{'---'}:|{'---'}:|")

        total_today_pnl = 0
        for pos in positions:
            code = pos.get("code", "")
            name = pos.get("name", "")
            today_str = self._pct(pos.get("today_change_pct"))
            pnl_str = self._pct(pos.get("unrealized_pnl_pct"))
            mkt_val = self._fmt_num(pos.get("market_value", 0))
            concerns = []
            if pos.get("unrealized_pnl_pct", 0) < -5:
                concerns.append("⚠️ 深度亏损")
            if pos.get("today_change_pct", 0) is not None and pos.get("today_change_pct", 0) < -3:
                concerns.append("📉 急跌")
            concern_str = " ".join(concerns) if concerns else "—"

            lines.append(f"| {code:<8} | {name:<10} | {today_str:<8} | {pnl_str:<10} | {mkt_val:<10} | {concern_str}")

        # 汇总行
        lines.append("")
        try:
            summary = self.engine.portfolio.summary()
            if summary:
                lines.append(f"**整体持仓:** 总成本 {self._fmt_num(summary.total_cost)} | "
                            f"总市值 {self._fmt_num(summary.total_market_value)} | "
                            f"总盈亏 {self._pct(summary.total_pnl_pct)}"
                            f"（已实现 {self._fmt_num(summary.total_realized_pnl)} / "
                            f"浮动 {self._fmt_num(summary.total_unrealized_pnl)}）")
        except Exception:
            pass

        return "\n".join(lines)

    # ── 主生成方法 ──────────────────────────────────────────────────

    def generate(self) -> str:
        """生成收盘报告 Markdown 文本"""
        today_str = self._today()

        # 并行采集
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            fut_indices = pool.submit(self._collect_indices)
            fut_breadth = pool.submit(self._collect_breadth)
            fut_limit = pool.submit(self._collect_limit_updown)
            fut_north = pool.submit(self._collect_north_flow)
            fut_sectors = pool.submit(self._collect_sector_flows)
            fut_dragon = pool.submit(self._collect_dragon_tiger)
            fut_cbs = pool.submit(self._collect_convertible_bonds)
            fut_positions = pool.submit(self._collect_positions)

            indices = fut_indices.result()
            breadth = fut_breadth.result()
            limits = fut_limit.result()
            north_flows = fut_north.result()
            sectors = fut_sectors.result()
            dragons = fut_dragon.result()
            cbs = fut_cbs.result()
            positions = fut_positions.result()

        # 后续依赖 positions 的
        fut_news = pool.submit(self._collect_holdings_news, positions)

        holdings_news = fut_news.result()

        # ── 分析 ──
        style_rotation = self._analyze_style_rotation(indices)
        breadth_analysis = self._analyze_breadth(breadth)
        limit_analysis = self._analyze_limit_up_down(limits)
        dragon_analysis = self._analyze_dragon_tiger(dragons)
        volume_analysis = self._analyze_volume(breadth, indices)
        regime = self._assess_market_regime(breadth, limit_analysis, volume_analysis, north_flows)
        cb_ops = self._analyze_cb_opportunities(cbs)

        # ── 排版输出 ──
        lines = []
        lines.append(f"# A股收盘报告 | {today_str}")
        lines.append("")

        # === 大盘全景 ===
        lines.append("## 大盘表现")
        lines.append(self._format_indices_table(indices))
        lines.append("")
        if breadth:
            lines.append(f"涨跌 {breadth.get('advance', 0)}:{breadth.get('decline', 0)} "
                        f"（上涨占比{breadth.get('advance_pct', 0):.1f}%）| "
                        f"涨停 {limit_analysis.get('limit_up_count', 0)} 家 | "
                        f"跌停 {limit_analysis.get('limit_down_count', 0)} 家")
            lines.append(self._format_limit_analysis(limit_analysis))
            lines.append("")
        lines.append(f"**风格:** {style_rotation}")
        lines.append(f"**广度:** {breadth_analysis}")
        lines.append(f"**量能:** {volume_analysis.get('volume_signal', '暂无')}")
        lines.append("")

        # === 市场判定 ===
        lines.append("## 市场判定")
        lines.append(regime)
        lines.append("")

        # === 资金流向 ===
        lines.append("## 资金流向")
        if north_flows:
            last_north = north_flows[0]
            net_str = self._fmt_num(last_north.get("net_amount", 0))
            dir_str = "净流入" if (last_north.get("net_amount", 0) or 0) > 0 else "净流出"
            lines.append(f"**北向资金:** {dir_str} {net_str}")
        else:
            lines.append("**北向资金:** 暂无当日数据")
        lines.append("")
        lines.append(self._format_sector_rotation(sectors))
        lines.append("")

        # === 龙虎榜 ===
        lines.append("## 龙虎榜")
        lines.append(self._format_dragon_tiger(dragon_analysis))
        lines.append("")

        # === 持仓复盘 ===
        lines.append("## 持仓复盘")
        lines.append(self._format_positions(positions))
        lines.append("")

        # === 持仓公告 ===
        if holdings_news:
            lines.append("## 持仓相关公告")
            for item in holdings_news[:6]:
                date_str = item.get("date", "")[:10]
                title = item.get("title", "")
                stock_name = item.get("stock_name", "")
                if len(title) > 50:
                    title = title[:48] + "..."
                lines.append(f"• [{date_str}] {stock_name}: {title}")
            lines.append("")

        # === 可转债观察 ===
        if cb_ops:
            lines.append("## 可转债观察")
            for op in cb_ops:
                lines.append(f"  • {op['bond']}({op['stock']}): {op['type']} 溢价率{op['premium']:+.2f}% 价格{op['price']:.2f}")
            lines.append("")

        # === 明日关注 ===
        lines.append("---")
        lines.append("## 明日关注")
        lines.append("1. 指数能否站稳/突破关键点位")
        lines.append(f"2. 北向资金能否延续方向: {north_flows[0].get('net_amount', 0) if north_flows else '—'}")
        lines.append(f"3. {style_rotation} — 对应风格是否延续")
        if limit_analysis.get("consecutive_board"):
            top_board = limit_analysis["consecutive_board"][:3]
            board_names = "、".join(f"{b.get('name', '')}({b.get('consecutive_days', 0)}板)" for b in top_board)
            lines.append(f"4. 连板高标走向: {board_names}")
        if sectors:
            top_sector = sorted(sectors, key=lambda x: x.get("main_net", 0) or 0, reverse=True)
            if top_sector:
                lines.append(f"5. 资金持续流入板块: {top_sector[0]['sector_name']}")
        if breadth:
            amt = breadth.get("total_amount")
            if amt and amt < 8e11:
                lines.append("6. ⚠️ 缩量环境中注意控制仓位")
        lines.append("")
        # 生成时间
        lines.append(f"*报告生成: {datetime.now().strftime('%Y-%m-%d %H:%M')}*")

        return "\n".join(lines)


if __name__ == "__main__":
    engine = AshareEngine()
    reporter = ClosingReport(engine)
    print(reporter.generate())
