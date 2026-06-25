"""
东方财富股吧 Driver — 舆情数据

覆盖: 个股股吧讨论热度、帖子列表，用于舆情分析
优先级: 15
特点: 从东方财富股吧抓取讨论帖，分析市场情绪
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import List, Optional

from a_stock_layer.core.schema import (
    Capability, SentimentData,
)
from a_stock_layer.drivers.base import BaseDriver
from a_stock_layer.utils.http_client import get as http_get

logger = logging.getLogger("a_stock_layer.driver.guba")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://guba.eastmoney.com/",
}


class GubaDriver(BaseDriver):
    """东方财富股吧舆情驱动"""

    def name(self) -> str:
        return "guba"

    def priority(self) -> int:
        return 15

    def capabilities(self) -> List[Capability]:
        return [
            Capability.SENTIMENT,
            Capability.NEWS,
        ]

    def _get_guba_json(self, code: str, page: int = 1, page_size: int = 20) -> Optional[dict]:
        """从东方财富股吧JSON接口获取帖子数据。"""
        try:
            c = code.strip().zfill(6)
            # 判断市场
            market = "1" if c.startswith(("6", "9")) else "0"
            url = "https://guba.eastmoney.com/default,{}_{}.html".format(market, c)
            # 股吧有JSON接口: list,type,page
            url = f"https://guba.eastmoney.com/list,{c},f_{page}.html"
            resp = http_get(url, headers=HEADERS, timeout=8)
            if resp.status_code != 200:
                return None

            html = resp.text
            # 提取帖子列表（从HTML中提取JSON数据块）
            # 股吧页面内嵌了 list 数据的 script 标签
            # 尝试提取 resultData 或 list 等关键块
            match = re.search(r'var\s+resultData\s*=\s*(\[.*?\]);', html, re.DOTALL)
            if match:
                return json.loads(match.group(1))
            return None
        except Exception as e:
            logger.debug("股吧数据获取失败 [%s]: %s", code, e)
            return None

    def sentiment(self, code: str) -> Optional[List[SentimentData]]:
        """查询个股舆情热度。"""
        try:
            c = code.strip().zfill(6)
            data = self._get_guba_json(c)
            if not data:
                return None

            total_posts = len(data)
            # 计算简单的情绪指标
            # 统计阅读量和评论数作为热度指标
            total_read = 0
            total_reply = 0
            for post in data[:min(100, len(data))]:
                if isinstance(post, dict):
                    total_read += int(post.get("readCount", post.get("click_count", 0)) or 0)
                    total_reply += int(post.get("replyCount", post.get("comment_count", 0)) or 0)

            # 如果readCount不够，通过以下字段获取
            if total_read == 0:
                for post in data[:min(50, len(data))]:
                    if isinstance(post, dict):
                        total_read += int(post.get("click", 0) or 0)
                        total_reply += int(post.get("comment", 0) or 0)

            # 热度评分 (0-100)
            hot_score = min(100, (total_read / max(len(data), 1) / 1000) if len(data) > 0 else 0)

            return [SentimentData(
                code=c,
                date=datetime.now().strftime("%Y-%m-%d"),
                sentiment_score=0.0,  # 暂无法从股吧准确判断情感倾向
                hot_score=round(min(100, hot_score), 2),
                mention_count=total_posts,
                related_news_count=total_posts,
            )]
        except Exception as e:
            logger.debug("股吧舆情失败 [%s]: %s", code, e)
            return None

    def news(self, code: str, page: int = 1, page_size: int = 10,
             news_type: str = "all") -> Optional[List]:
        """从股吧获取讨论帖（作为新闻补充源）。"""
        try:
            c = code.strip().zfill(6)
            data = self._get_guba_json(c, page=page, page_size=page_size)
            if not data:
                return None

            from a_stock_layer.core.schema import NewsItem
            results = []
            for post in data[:page_size]:
                if not isinstance(post, dict):
                    continue
                title = post.get("postTitle", post.get("title", ""))
                # 去除HTML标签
                title = re.sub(r'<[^>]+>', '', title) if title else ""
                if not title:
                    continue

                results.append(NewsItem(
                    code=c,
                    date=str(post.get("postDate", post.get("date", "")))[:10],
                    title=title,
                    summary=post.get("postContent", post.get("content", "")) or "",
                    url=post.get("url", f"https://guba.eastmoney.com/news,{c},{post.get('id', '')}.html"),
                    source="东方财富股吧",
                    content_type="news",
                    is_important=False,
                ))
            return results if results else None
        except Exception as e:
            logger.debug("股吧帖子失败 [%s]: %s", code, e)
            return None
