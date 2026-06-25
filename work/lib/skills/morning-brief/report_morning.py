#!/usr/bin/env python3
"""
开盘早报生成器 — AStockLayer 开盘早报 skill

A股开盘前（9:00-9:25）调用，生成隔夜全球市场回顾、盘前信号、
持仓风险检查、当日重要事件、资金流向等多维度分析报告。

用法:
    from a_stock_layer import AshareEngine
    from skills.morning_brief.report_morning import MorningBriefReport

    engine = AshareEngine()
    reporter = MorningBriefReport(engine)
    report = reporter.generate()
    print(report)
"""

from __future__ import annotations

import logging
from datetime import datetime, date, timedelta
from typing import Optional

from a_stock_layer import AshareEngine

logger = logging.getLogger("morning_brief")


class MorningBriefReport:
    """开盘早报生成器"""

    # 常用全球指数代码映射
    GLOBAL_INDICES = {
        "dji":  ("道琼斯", "US"),
        "spx":  ("标普500", "US"),
        "ixic": ("纳斯达克", "US"),
        "hsi":  ("恒生指数", "HK"),
        "n225": ("日经225", "JP"),
        "ftse": ("富时100", "UK"),
        "dax":  ("德国DAX", "EU"),
        "csi300": ("沪深300", "CN"),
    }

    # A股指数代码
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
        """格式化大数字为亿/万"""
        if v is None:
            return "--"
        if abs(v) >= 1e8:
            return f"{v/1e8:.2f}{unit}"
        if abs(v) >= 1e4:
            return f"{v/1e4:.2f}万"
        return f"{v:.2f}"

    def _flag(self, v: float, up_ok: bool = True) -> str:
        """涨跌标记"""
        if v > 0:
            return "🟢" if up_ok else "🔴"
        elif v < 0:
            return "🔴" if up_ok else "🟢"
        return "⚪"

    # ── 数据采集模块 ──────────────────────────────────────────────

    def _collect_global_indices(self) -> list[dict]:
        """采集全球主要指数隔夜表现"""
        results = []
        for code, (name, market) in self.GLOBAL_INDICES.items():
            r = self.engine.global_index(code)
            if r.success and r.data:
                item = r.data[0]
                results.append({
                    "code": code,
                    "name": name,
                    "market": market,
                    "price": item.price,
                    "change_pct": item.change_pct,
                    "timestamp": item.timestamp,
                })
            else:
                # fallback: try index_realtime for CN indices
                if market == "CN":
                    r2 = self.engine.index_realtime(code)
                    if r2.success and r2.data:
                        item = r2.data[0]
                        results.append({
                            "code": code, "name": name, "market": market,
                            "price": item.price, "change_pct": item.change_pct,
                            "timestamp": item.timestamp,
                        })
        return results

    def _collect_cn_indices(self) -> list[dict]:
        """采集A股主要指数昨日收盘"""
        results = []
        for code, name in self.CN_INDICES.items():
            r = self.engine.index_realtime(code)
            if r.success and r.data:
                item = r.data[0]
                results.append({
                    "code": code, "name": name,
                    "price": item.price, "change_pct": item.change_pct,
                    "pre_close": item.pre_close,
                })
        return results

    def _collect_breadth(self) -> Optional[dict]:
        """采集昨日市场情绪"""
        r = self.engine.market_breadth()
        if r.success and r.data:
            return r.data[0].to_dict()
        return None

    def _collect_limit_updown(self) -> list[dict]:
        """采集昨日涨停跌停"""
        r = self.engine.limit_updown()
        if r.success and r.data:
            return [d.to_dict() for d in r.data]
        return []

    def _collect_north_flow(self) -> list[dict]:
        """采集北向资金"""
        r = self.engine.market_money_flow("north")
        if r.success and r.data:
            return [d.to_dict() for d in r.data]
        return []

    def _collect_sector_flows(self) -> list[dict]:
        """采集行业资金流"""
        r = self.engine.sector_money_flow("industry")
        if r.success and r.data:
            return [d.to_dict() for d in r.data]
        return []

    def _collect_holdings_risk(self) -> list[dict]:
        """采集持仓风险数据"""
        risks = []
        try:
            positions = self.engine.portfolio.holdings()
            for pos in positions:
                code = pos.code
                item = {
                    "code": code, "name": pos.name,
                    "unrealized_pnl_pct": pos.unrealized_pnl_pct,
                    "market_value": pos.market_value,
                }
                # 解禁
                r = self.engine.lockup_expiry(code)
                if r.success and r.data:
                    expiries = [e.to_dict() for e in r.data[:3]
                                if e.date >= self._today()]
                    if expiries:
                        item["lockup_expiries"] = expiries

                # 业绩预告
                r = self.engine.perf_forecast(code)
                if r.success and r.data:
                    item["perf_forecast"] = r.data[0].to_dict()

                # 高管增减持
                r = self.engine.insider_trade(code)
                if r.success and r.data:
                    recent = [e.to_dict() for e in r.data[:3]]
                    if recent:
                        item["insider_trades"] = recent

                # 股东增减持计划
                r = self.engine.shareholder_plans(code)
                if r.success and r.data:
                    plans = [e.to_dict() for e in r.data[:3]]
                    if plans:
                        item["shareholder_plans"] = plans

                # 质押
                r = self.engine.share_pledge(code)
                if r.success and r.data:
                    pledges = [e.to_dict() for e in r.data[:3]
                               if e.status == "未解除"]
                    if pledges:
                        item["pledges"] = pledges

                risks.append(item)
        except Exception as e:
            logger.warning("采集持仓风险失败: %s", e)
        return risks

    def _collect_calendar_events(self) -> dict:
        """采集当日/近日事件日历"""
        events = {"ipos": [], "lockups": [], "dividends": [], "macro": []}

        # IPO数据
        r = self.engine.ipo_data()
        if r.success and r.data:
            for ipo in r.data:
                if ipo.issue_date >= self._today() or ipo.listing_date >= self._today():
                    events["ipos"].append(ipo.to_dict())

        # 宏观经济
        r = self.engine.macro_indicator()
        if r.success and r.data:
            events["macro"] = [d.to_dict() for d in r.data[:5]]

        return events

    def _collect_market_news(self) -> list[dict]:
        """采集市场热门新闻"""
        # 用几个核心指数/热门股来获取市场新闻
        hot_codes = ["000001", "399001", "600519", "000858", "300750"]
        news_list = []
        for code in hot_codes:
            r = self.engine.news(code, page=1, page_size=3)
            if r.success and r.data:
                for item in r.data:
                    news_list.append(item.to_dict())
        # 按日期排序取最新
        news_list.sort(key=lambda x: x.get("date", ""), reverse=True)
        return news_list[:10]

    # ── 分析模块 ──────────────────────────────────────────────────

    def _analyze_global_signal(self, indices: list[dict]) -> str:
        """全球市场信号分析"""
        us_indices = [i for i in indices if i["market"] == "US"]
        hk_idx = next((i for i in indices if i["code"] == "hsi"), None)
        jp_idx = next((i for i in indices if i["code"] == "n225"), None)

        signals = []
        # 美股
        if us_indices:
            avg_us = sum(i["change_pct"] or 0 for i in us_indices) / len(us_indices)
            if avg_us > 1.5:
                signals.append("美股大幅走强，对A股情绪偏正面")
            elif avg_us > 0.5:
                signals.append("美股温和上涨，外围环境平稳")
            elif avg_us < -1.5:
                signals.append("美股大幅回调，关注对A股开盘的拖累")
            elif avg_us < -0.5:
                signals.append("美股走弱，A股可能承压")
            else:
                signals.append("美股窄幅震荡，外围影响中性")
            # 纳斯达克 vs 道指
            nas = next((i for i in us_indices if i["code"] == "ixic"), None)
            dji = next((i for i in us_indices if i["code"] == "dji"), None)
            if nas and dji and nas["change_pct"] and dji["change_pct"]:
                spread = nas["change_pct"] - dji["change_pct"]
                if spread > 1:
                    signals.append("成长风格强于价值（纳指 > 道指），科技股情绪偏暖")
                elif spread < -1:
                    signals.append("价值风格占优（道指 > 纳指），防御心态升温")

        # 港股
        if hk_idx and hk_idx["change_pct"] is not None:
            if hk_idx["change_pct"] > 1:
                signals.append(f"恒指走强（{hk_idx['change_pct']:+.2f}%），对A股联动偏正面")
            elif hk_idx["change_pct"] < -1:
                signals.append(f"恒指走弱（{hk_idx['change_pct']:+.2f}%），注意AH联动影响")

        return "；".join(signals) if signals else "外围信号不明确，关注A股自身走势"

    def _analyze_market_regime(self, breadth: Optional[dict],
                                limit_ups: list) -> str:
        """市场状态研判"""
        if not breadth:
            return "数据不足，无法研判"

        advance = breadth.get("advance", 0)
        decline = breadth.get("decline", 0)
        total_amount = breadth.get("total_amount", 0)
        total = advance + decline
        ratio = advance / max(decline, 1)

        regimes = []
        if ratio > 3:
            regimes.append("强势市场（涨跌比 > 3:1）")
        elif ratio > 2:
            regimes.append("偏强（涨跌比 > 2:1）")
        elif ratio > 1:
            regimes.append("震荡偏强")
        elif ratio > 0.5:
            regimes.append("震荡偏弱")
        else:
            regimes.append("弱势市场（涨跌比 < 0.5:1）")

        # 成交额判断
        if total_amount and total_amount > 1.5e12:
            regimes.append("成交活跃（>1.5万亿）")
        elif total_amount and total_amount > 1e12:
            regimes.append("成交正常（>1万亿）")
        elif total_amount:
            regimes.append("缩量（<1万亿）")

        # 涨停家数
        limit_up_count = len(limit_ups)
        if limit_up_count > 80:
            regimes.append("情绪亢奋（涨停>80）")
        elif limit_up_count > 40:
            regimes.append("情绪较高")
        elif limit_up_count > 15:
            regimes.append("情绪一般")
        else:
            regimes.append("情绪冷淡（涨停<15）")

        return " | ".join(regimes)

    def _analyze_consecutive_flows(self, north_flows: list[dict]) -> str:
        """北向资金连续流向分析"""
        if not north_flows:
            return "暂无数据"

        recent = sorted(north_flows, key=lambda x: x.get("date", ""), reverse=True)
        if not recent:
            return "暂无数据"

        today = recent[0]
        net = today.get("net_amount", 0)

        # 判断连续方向
        consecutive_days = 0
        direction = 0
        for item in recent:
            amt = item.get("net_amount", 0)
            if amt == 0:
                break
            if direction == 0:
                direction = 1 if amt > 0 else -1
                consecutive_days = 1
            elif (amt > 0) == (direction > 0):
                consecutive_days += 1
            else:
                break

        direction_label = "净流入" if net > 0 else "净卖出"
        parts = [f"昨日北向{direction_label} {self._fmt_num(abs(net))}"]
        if consecutive_days > 1:
            parts.append(f"连续{consecutive_days}日{direction_label}")
        return "，".join(parts)

    def _analyze_sector_rotation(self, sectors: list[dict]) -> str:
        """行业轮动分析"""
        if not sectors:
            return "暂无数据"
        sorted_sectors = sorted(sectors, key=lambda x: x.get("main_net", 0) or 0, reverse=True)
        top3 = sorted_sectors[:3]
        bottom3 = sorted_sectors[-3:] if len(sorted_sectors) >= 3 else sorted_sectors

        parts = ["流入Top3: " + " / ".join(
            f"{s['sector_name']}({self._fmt_num(s.get('main_net', 0))})" for s in top3
        )]
        parts.append("流出Top3: " + " / ".join(
            f"{s['sector_name']}({self._fmt_num(abs(s.get('main_net', 0) or 0))})" for s in bottom3
        ))

        return " | ".join(parts)

    def _format_holdings_risk(self, risks: list[dict]) -> str:
        """格式化持仓风险表"""
        if not risks:
            return "无持仓数据"

        lines = []
        lines.append(f"{'代码':<8} {'名称':<10} {'盈亏%':<8} {'关注事项'}")
        lines.append("-" * 60)

        for item in risks:
            code = item.get("code", "")
            name = item.get("name", "")
            pnl = self._pct(item.get("unrealized_pnl_pct"))
            concerns = []

            if item.get("lockup_expiries"):
                concerns.append(f"近日解禁")
            if item.get("perf_forecast"):
                pf = item["perf_forecast"]
                concerns.append(f"业绩{pf.get('forecast_type', '预告')}")
            if item.get("insider_trades"):
                concerns.append("高管增减持")
            if item.get("shareholder_plans"):
                concerns.append("股东计划")
            if item.get("pledges"):
                concerns.append("质押")

            concern_str = "、".join(concerns) if concerns else "—"
            lines.append(f"{code:<8} {name:<10} {pnl:<8} {concern_str}")

        return "\n".join(lines)

    def _format_news(self, news_list: list[dict]) -> str:
        """格式化新闻摘要"""
        if not news_list:
            return "暂无"
        lines = []
        for item in news_list[:8]:
            date_str = item.get("date", "")[:10]
            title = item.get("title", "")
            if len(title) > 50:
                title = title[:48] + "..."
            lines.append(f"• [{date_str}] {title}")
        return "\n".join(lines)

    def _format_calendar(self, events: dict) -> str:
        """格式化事件日历"""
        lines = []

        if events.get("ipos"):
            lines.append("**新股动态:**")
            for ipo in events["ipos"]:
                name = ipo.get("name", "")
                code = ipo.get("code", "")
                issue_date = ipo.get("issue_date", "")
                listing_date = ipo.get("listing_date", "")
                price = ipo.get("issue_price")
                price_str = f"发行价{price}元" if price else ""
                status = ipo.get("status", "")
                lines.append(f"  - {name}({code}): {status} {price_str} {'申购日' + issue_date if issue_date else ''} {'上市日' + listing_date if listing_date else ''}")

        if events.get("macro"):
            lines.append("**经济数据:**")
            for m in events["macro"]:
                name = m.get("indicator_name", "")
                val = m.get("value")
                yoy = m.get("yoy_change")
                date_str = m.get("date", "")
                val_str = f"{val}" if val else ""
                yoy_str = f"同比{yoy:+.1f}%" if yoy else ""
                lines.append(f"  - {name}: {val_str} {yoy_str} ({date_str})")

        if not lines:
            lines.append("今日暂无重大事件")
        return "\n".join(lines)

    # ── 主生成方法 ──────────────────────────────────────────────────

    def generate(self) -> str:
        """生成开盘早报 Markdown 文本"""
        today_str = self._today()
        weekday = datetime.now().strftime("%A")

        # 并行采集
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            fut_global = pool.submit(self._collect_global_indices)
            fut_cn = pool.submit(self._collect_cn_indices)
            fut_breadth = pool.submit(self._collect_breadth)
            fut_limit = pool.submit(self._collect_limit_updown)
            fut_north = pool.submit(self._collect_north_flow)
            fut_sectors = pool.submit(self._collect_sector_flows)
            fut_risks = pool.submit(self._collect_holdings_risk)
            fut_calendar = pool.submit(self._collect_calendar_events)
            fut_news = pool.submit(self._collect_market_news)

            global_indices = fut_global.result()
            cn_indices = fut_cn.result()
            breadth = fut_breadth.result()
            limit_ups = fut_limit.result()
            north_flows = fut_north.result()
            sectors = fut_sectors.result()
            risks = fut_risks.result()
            calendar = fut_calendar.result()
            news_list = fut_news.result()

        # ── 分析 ──
        global_signal = self._analyze_global_signal(global_indices)
        regime = self._analyze_market_regime(breadth, limit_ups)
        north_summary = self._analyze_consecutive_flows(north_flows)
        sector_rotation = self._analyze_sector_rotation(sectors)

        # ── 排版 ──
        lines = []
        lines.append(f"# A股开盘早报 | {today_str}")
        lines.append("")

        # === 隔夜全球 ===
        lines.append("## 隔夜全球")
        if global_indices:
            lines.append(f"| {'' :<3} | 指数 | 收盘 | 涨跌幅 |")
            lines.append(f"|{'---'}:|{'---'}:|{'---'}:|{'---'}:|")
            for idx in global_indices:
                flag = self._flag(idx["change_pct"] or 0)
                fmt_pct = self._pct(idx["change_pct"])
                price_str = f"{idx['price']:.2f}" if idx["price"] else "--"
                lines.append(f"| {flag} | {idx['name']} | {price_str} | {fmt_pct} |")
        lines.append("")
        lines.append(f"**判断:** {global_signal}")
        lines.append("")

        # === A股盘前 ===
        lines.append("## A股盘前信号")
        if cn_indices:
            lines.append(f"| {'' :<3} | 指数 | 昨收 | 涨跌幅 |")
            lines.append(f"|{'---'}:|{'---'}:|{'---'}:|{'---'}:|")
            for idx in cn_indices:
                flag = self._flag(idx["change_pct"] or 0)
                fmt_pct = self._pct(idx["change_pct"])
                price_str = f"{idx['price']:.2f}" if idx["price"] else "--"
                lines.append(f"| {flag} | {idx['name']} | {price_str} | {fmt_pct} |")

        lines.append("")
        if breadth:
            advance = breadth.get("advance", 0)
            decline = breadth.get("decline", 0)
            total_amt = breadth.get("total_amount", 0)
            limit_up_count = breadth.get("limit_up", 0)
            limit_down_count = breadth.get("limit_down", 0)
            lines.append(f"涨跌比 {advance}:{decline} | 涨停 {limit_up_count} 家 | 跌停 {limit_down_count} 家")
            lines.append(f"成交额 {self._fmt_num(total_amt)}")
            lines.append("")

        # 涨停概念分布
        if limit_ups:
            from collections import Counter
            concepts = Counter()
            for lu in limit_ups:
                rsn = lu.get("reason") or lu.get("limit_type") or ""
                if rsn:
                    concepts[rsn] += 1
            if concepts:
                top_concepts = concepts.most_common(5)
                concept_str = " | ".join(f"{c}({n}家)" for c, n in top_concepts)
                lines.append(f"涨停概念分布: {concept_str}")
                lines.append("")

        lines.append(f"**市场状态:** {regime}")
        lines.append("")

        # === 资金流向 ===
        lines.append("## 资金流向")
        lines.append(f"**北向资金:** {north_summary}")
        lines.append(f"**行业资金:** {sector_rotation}")
        lines.append("")

        # === 今日重点 ===
        lines.append("## 今日重点")
        lines.append(self._format_calendar(calendar))
        lines.append("")

        # === 持仓风险 ===
        lines.append("## 持仓风险检查")
        lines.append(self._format_holdings_risk(risks))
        lines.append("")

        # === 隔夜新闻 ===
        lines.append("## 隔夜重要新闻")
        lines.append(self._format_news(news_list))
        lines.append("")

        # === 操作提示 ===
        lines.append("---")
        lines.append("**操作提示:**")
        lines.append(f"- 开盘关注: {north_summary}")
        if sectors:
            top_sector = sorted(sectors, key=lambda x: x.get("main_net", 0) or 0, reverse=True)
            if top_sector:
                lines.append(f"- 资金青睐板块: {top_sector[0]['sector_name']}")
        lines.append(f"- {global_signal}")
        lines.append("")

        return "\n".join(lines)


if __name__ == "__main__":
    engine = AshareEngine()
    reporter = MorningBriefReport(engine)
    print(reporter.generate())
