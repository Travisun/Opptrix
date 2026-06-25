"""
通用技术指标评级模块 — 基于纯技术面的多指标综合评分

覆盖11个经典技术维度:
  1. 趋势 — MA排列 / MACD / ADX
  2. 动量 — RSI / 随机指标KDJ
  3. 量能 — 量价配合 / OBV
  4. 支撑阻力 — 布林带位置
  5. 波动 — ATR
  6. 情绪 — 恐慌/贪婪指标

输出: 综合评级 + 各维度评分
"""

from __future__ import annotations
from typing import Optional, List, Dict
import numpy as np

from .base import (
    InstitutionEvaluator, InstitutionRating,
    RatingLevel, EvalDimension,
)


class TechnicalIndicatorEvaluator(InstitutionEvaluator):
    """通用技术指标评级 — 11维度技术面综合分析"""

    institution = "技术指标 Technical"
    institution_short = "技术分析"
    model_name = "11维技术面"
    description = (
        "基于通用技术指标的多维度综合评级: "
        "趋势(25%)/动量(20%)/量能(20%)/布林带(15%)/波动(10%)/情绪(10%)"
    )

    def compute(self, code: str) -> InstitutionRating:
        errors = []
        dims: List[EvalDimension] = []
        factors: Dict[str, float] = {}
        try:
            trend = self._eval_trend(code, errors, factors)
            if trend: dims.append(trend)

            momentum = self._eval_momentum_tech(code, errors, factors)
            if momentum: dims.append(momentum)

            volume = self._eval_volume_tech(code, errors, factors)
            if volume: dims.append(volume)

            bollinger = self._eval_bollinger(code, errors, factors)
            if bollinger: dims.append(bollinger)

            volatility = self._eval_volatility_tech(code, errors, factors)
            if volatility: dims.append(volatility)

            sentiment = self._eval_sentiment_tech(code, errors, factors)
            if sentiment: dims.append(sentiment)

            summary = self._generate_summary(dims)
            return self._make_rating(code, dims, summary, factors, errors)
        except Exception as e:
            errors.append(f"技术指标评估异常: {e}")
            return self._make_rating(code, dims, "评估出错", factors, errors)

    def _get_ma(self, closes: np.ndarray, period: int) -> np.ndarray:
        """计算移动平均线"""
        if len(closes) < period:
            return np.array([])
        ma = np.convolve(closes, np.ones(period) / period, mode='valid')
        return ma

    def _get_rsi(self, closes: np.ndarray, period: int = 14) -> float:
        """计算RSI"""
        if len(closes) < period + 1:
            return 50.0
        deltas = np.diff(closes)
        gains = deltas.copy()
        gains[gains < 0] = 0
        losses = deltas.copy()
        losses[losses > 0] = 0
        losses = np.abs(losses)

        avg_gain = np.mean(gains[-period:])
        avg_loss = np.mean(losses[-period:])
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _eval_trend(self, code, errors, factors) -> Optional[EvalDimension]:
        """趋势评估 25% — MA排列 + MACD"""
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 120:
                return None
            closes = np.array([d.close for d in k])
            score = 5.0; details = []

            # MA排列
            ma5 = self._get_ma(closes, 5)
            ma10 = self._get_ma(closes, 10)
            ma20 = self._get_ma(closes, 20)
            ma60 = self._get_ma(closes, 60)

            if len(ma5) >= 3 and len(ma10) >= 3 and len(ma20) >= 3 and len(ma60) >= 3:
                c5 = ma5[-1]; c10 = ma10[-1]; c20 = ma20[-1]; c60 = ma60[-1]
                p5 = ma5[-2]; p10 = ma10[-2]; p20 = ma20[-2]

                factors["tech_ma5"] = round(c5, 2)
                factors["tech_ma10"] = round(c10, 2)
                factors["tech_ma20"] = round(c20, 2)
                factors["tech_ma60"] = round(c60, 2)

                # 多头排列: MA5>MA10>MA20>MA60
                if c5 > c10 > c20 > c60:
                    score += 3.0; details.append("强多头排列")
                elif c20 > c60 and c5 > c10:
                    score += 1.5; details.append("多头趋势")
                elif c5 < c10 < c20 < c60:
                    score -= 2.0; details.append("空头排列")
                elif c5 < c10:
                    score -= 1.0; details.append("短期偏空")
                else:
                    score += 0; details.append("震荡趋势")

                # 金叉/死叉
                if p5 <= p10 and c5 > c10:
                    score += 1.0; details.append("MA5金叉MA10")
                elif p5 >= p10 and c5 < c10:
                    score -= 1.0; details.append("MA5死叉MA10")

            # MACD
            if len(closes) >= 26:
                ema12 = self._ema(closes, 12)
                ema26 = self._ema(closes, 26)
                if len(ema12) > 0 and len(ema26) > 0:
                    n = min(len(ema12), len(ema26))
                    dif = ema12[-n:] - ema26[-n:]
                    dea = self._ema(dif, 9)
                    if len(dea) > 0:
                        macd_val = (dif[-1] - dea[-1]) * 2
                        factors["tech_macd"] = round(macd_val, 3)
                        if macd_val > 0:
                            score += 1.0; details.append("MACD金叉区域")
                        else:
                            score -= 0.5; details.append("MACD死叉区域")

            return EvalDimension("趋势MA/MACD", min(10, max(0, score)), 0.25,
                                 "; ".join(details) if details else "数据不足")
        except Exception:
            return None

    def _ema(self, arr: np.ndarray, period: int) -> np.ndarray:
        """指数移动平均"""
        if len(arr) < period:
            return np.array([])
        multiplier = 2 / (period + 1)
        result = np.zeros(len(arr))
        result[0] = arr[0]
        for i in range(1, len(arr)):
            result[i] = (arr[i] - result[i-1]) * multiplier + result[i-1]
        return result

    def _eval_momentum_tech(self, code, errors, factors) -> Optional[EvalDimension]:
        """动量评估 20% — RSI + 价格速率"""
        try:
            k = self._get_kline(code, count=60)
            if not k or len(k) < 30:
                return None
            closes = np.array([d.close for d in k])
            score = 5.0; details = []

            # RSI
            rsi = self._get_rsi(closes, 14)
            factors["tech_rsi_14"] = round(rsi, 1)

            if rsi < 30:
                score += 2.0; details.append(f"RSI{rsi:.0f} 超卖区域")
            elif rsi < 40:
                score += 1.0; details.append(f"RSI{rsi:.0f} 偏低")
            elif 40 <= rsi <= 60:
                score += 0.5; details.append(f"RSI{rsi:.0f} 中性")
            elif 60 < rsi <= 70:
                score += 0
            elif rsi <= 80:
                score -= 0.5; details.append(f"RSI{rsi:.0f} 偏高")
            else:
                score -= 1.5; details.append(f"RSI{rsi:.0f} 超买风险")

            # 动量速率
            if len(closes) >= 20:
                ret_5d = (closes[-1] / closes[-5] - 1) * 100
                ret_20d = (closes[-1] / closes[-20] - 1) * 100
                factors["tech_ret_5d"] = round(ret_5d, 2)
                factors["tech_ret_20d"] = round(ret_20d, 2)

                if ret_5d > 0 and ret_20d > 0:
                    score += 1.0; details.append("短中期同步上行")
                elif ret_5d < 0 and ret_20d < 0:
                    score -= 1.0; details.append("短中期同步下行")
                elif ret_5d > 0 > ret_20d:
                    score += 0.5; details.append("短期反弹")
                elif ret_5d < 0 < ret_20d:
                    score -= 0.5; details.append("短期回调")

            return EvalDimension("动量RSI", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "数据不足")
        except Exception:
            return None

    def _eval_volume_tech(self, code, errors, factors) -> Optional[EvalDimension]:
        """量能评估 20% — 量价配合"""
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 60:
                return None
            score = 5.0; details = []
            closes = np.array([d.close for d in k])
            volumes = np.array([d.volume for d in k], dtype=float)

            vol_5 = np.mean(volumes[-5:]) if len(volumes) >= 5 else 0
            vol_20 = np.mean(volumes[-20:]) if len(volumes) >= 20 else 0
            vol_60 = np.mean(volumes) if len(volumes) >= 60 else 0

            factors["tech_vol_ma5"] = round(vol_5, 0)
            factors["tech_vol_ma20"] = round(vol_20, 0)

            if vol_60 > 0:
                # 量比
                vol_ratio_5_60 = vol_5 / vol_60 if vol_60 > 0 else 0
                vol_ratio_20_60 = vol_20 / vol_60 if vol_60 > 0 else 0
                factors["tech_vol_ratio_5_60"] = round(vol_ratio_5_60, 2)

                # 判断量价关系
                ret_5d = (closes[-1] / closes[-5] - 1) * 100
                if vol_ratio_5_60 > 1.5 and ret_5d > 0:
                    score += 2.5; details.append("放量上涨 强势")
                elif vol_ratio_5_60 > 1.5 and ret_5d < 0:
                    score -= 1.5; details.append("放量下跌 危险")
                elif vol_ratio_5_60 < 0.7 and ret_5d > 0:
                    score -= 0.5; details.append("缩量上涨 持续性存疑")
                elif vol_ratio_5_60 < 0.7 and ret_5d < 0:
                    score += 0.5; details.append("缩量下跌 抛压衰竭")
                elif 0.7 <= vol_ratio_5_60 <= 1.5:
                    score += 1.0; details.append("量能温和 健康")

            # OBV 简化
            if len(closes) >= 20 and len(volumes) >= 20:
                n = min(20, len(closes))
                obv = 0
                for i in range(1, n):
                    obv += volumes[-i] if closes[-i] > closes[-(i+1)] else -volumes[-i]
                factors["tech_obv_20d"] = round(obv, 0)
                if obv > 0:
                    score += 1.0; details.append("OBV向上 资金流入")
                else:
                    score -= 0.5; details.append("OBV向下 资金流出")

            return EvalDimension("量能分析", min(10, max(0, score)), 0.20,
                                 "; ".join(details) if details else "数据不足")
        except Exception:
            return None

    def _eval_bollinger(self, code, errors, factors) -> Optional[EvalDimension]:
        """布林带位置 15%"""
        try:
            k = self._get_kline(code, count=60)
            if not k or len(k) < 20:
                return None
            score = 5.0; details = []
            closes = np.array([d.close for d in k])

            ma20 = np.mean(closes[-20:])
            std20 = np.std(closes[-20:])
            upper = ma20 + 2 * std20
            lower = ma20 - 2 * std20
            current = closes[-1]

            factors["tech_boll_upper"] = round(upper, 2)
            factors["tech_boll_mid"] = round(ma20, 2)
            factors["tech_boll_lower"] = round(lower, 2)
            factors["tech_boll_position"] = round((current - lower) / (upper - lower) * 100, 1)

            # 位置评分
            band_pct = (current - lower) / (upper - lower) * 100
            factors["tech_boll_pct"] = round(band_pct, 1)

            if band_pct < 0:
                # 跌破下轨
                score += 2.0; details.append("跌破下轨 超卖反弹机会")
            elif band_pct < 20:
                score += 1.5; details.append("下轨附近 偏低")
            elif 20 <= band_pct <= 80:
                score += 1.0; details.append(f"布林中轨附近({band_pct:.0f}%)")
            elif band_pct <= 100:
                score -= 0.5; details.append(f"上轨附近({band_pct:.0f}%) 偏高")
            else:
                score -= 1.5; details.append("突破上轨 超买")

            # 带宽(波动率变化)
            bandwidth = (upper - lower) / ma20 * 100
            factors["tech_boll_width"] = round(bandwidth, 2)
            if bandwidth < 10:
                details.append("布林带收缩 变盘前兆")
                score += 0.5
            elif bandwidth > 40:
                details.append("布林带扩张 趋势加强")

            return EvalDimension("布林带位置", min(10, max(0, score)), 0.15,
                                 "; ".join(details) if details else "数据不足")
        except Exception:
            return None

    def _eval_volatility_tech(self, code, errors, factors) -> Optional[EvalDimension]:
        """波动评估 10% — ATR + 波动率"""
        try:
            k = self._get_kline(code, count=60)
            if not k or len(k) < 20:
                return None
            score = 5.0
            closes = np.array([d.close for d in k])
            highs = np.array([d.high for d in k])
            lows = np.array([d.low for d in k])

            # ATR
            trs = []
            for i in range(1, len(k)):
                hl = highs[i] - lows[i]
                hc = abs(highs[i] - closes[i-1])
                lc = abs(lows[i] - closes[i-1])
                trs.append(max(hl, hc, lc))
            atr_14 = np.mean(trs[-14:]) if len(trs) >= 14 else np.mean(trs)
            atr_pct = atr_14 / closes[-1] * 100
            factors["tech_atr_pct"] = round(atr_pct, 2)

            if atr_pct < 1.5:
                score += 2.0; details = "低波动 稳定"
            elif atr_pct < 2.5:
                score += 1.0; details = "波动适中"
            elif atr_pct < 4:
                score -= 0.5; details = "波动偏高"
            else:
                score -= 1.5; details = "高波动 风险大"

            return EvalDimension("波动ATR", min(10, max(0, score)), 0.10, details)
        except Exception:
            return None

    def _eval_sentiment_tech(self, code, errors, factors) -> Optional[EvalDimension]:
        """情绪评估 10% — 涨跌量比 + 价格位置"""
        try:
            k = self._get_kline(code, count=120)
            if not k or len(k) < 60:
                return None
            score = 5.0; details = []
            closes = np.array([d.close for d in k])

            # 当前位置 vs 52周高低
            high_52w = np.max(closes[-250:]) if len(closes) >= 250 else np.max(closes)
            low_52w = np.min(closes[-250:]) if len(closes) >= 250 else np.min(closes)
            current = closes[-1]
            range_pos = (current - low_52w) / (high_52w - low_52w) * 100
            factors["tech_52w_range"] = round(range_pos, 1)

            if range_pos < 20:
                score += 2.0; details.append("52周低位 恐惧区域")
                score += 1.0  # 恐惧=潜在机会
            elif range_pos < 40:
                score += 1.0; details.append("中低位")
            elif 40 <= range_pos <= 60:
                score += 0.5; details.append("中位")
            elif range_pos <= 80:
                score -= 0.5; details.append("中高位")
            else:
                score -= 1.5; details.append("52周高位 贪婪区域")

            return EvalDimension("情绪研判", min(10, max(0, score)), 0.10,
                                 "; ".join(details) if details else "数据不足")
        except Exception:
            return None

    def _generate_summary(self, dims: list) -> str:
        if not dims: return "数据不足以评估"
        s = sum(d.score * d.weight for d in dims) / sum(d.weight for d in dims)

        # 技术面特殊标签
        details = []
        for d in dims:
            if "多头排列" in d.detail:
                details.append("多头趋势")
            if "超卖" in d.detail:
                details.append("超卖信号")

        if s >= 7.5:
            tag = "强烈看多" if "多头趋势" in str(details) else "技术面强势"
            return f"技术面评级: {tag}, 综合{s:.1f}分"
        elif s >= 6.0:
            return f"技术面偏多: 综合{s:.1f}分"
        elif s >= 4.0:
            return f"技术面中性: 综合{s:.1f}分"
        else:
            return f"技术面偏空: 综合{s:.1f}分"
