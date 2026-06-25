"""
巨潮资讯网（cninfo.com.cn）Driver — 上市公司公告全文

覆盖: 上市公司公告检索、获取公告摘要和全文链接
优先级: 25（低于东财、新浪、腾讯等主行情源）
特点: 官方披露平台，公告数据最全（含PDF原文）
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import List, Optional

from a_stock_layer.core.schema import (
    Capability,
)
from a_stock_layer.drivers.base import BaseDriver

logger = logging.getLogger("a_stock_layer.driver.cninfo")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://www.cninfo.com.cn/new/commonUrl?url=disclosure/list/notice",
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
}


class CninfoDriver(BaseDriver):
    """巨潮资讯网驱动 — 上市公司公告"""

    def name(self) -> str:
        return "cninfo"

    def priority(self) -> int:
        return 25

    def capabilities(self) -> List[Capability]:
        return [
            Capability.NEWS,
        ]

    def _post(self, url: str, data: dict) -> Optional[dict]:
        """向巨潮API发POST请求。"""
        try:
            from a_stock_layer.utils.http_client import get_session
            session = get_session()
            resp = session.post(url, data=data, headers=HEADERS, timeout=10)
            if resp.status_code == 200:
                return resp.json()
            return None
        except Exception as e:
            logger.debug("巨潮POST失败: %s", e)
            return None

    def _search_stock_id(self, code: str) -> Optional[str]:
        """根据股票代码查询巨潮内部orgId。"""
        try:
            c = code.strip().zfill(6)
            url = "https://www.cninfo.com.cn/new/information/topInfo/topInfoStock"
            params = {"stockCode": c}
            from a_stock_layer.utils.http_client import get_session
            session = get_session()
            resp = session.get(url, params=params, headers=HEADERS, timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                items = data if isinstance(data, list) else data.get("data", data.get("stockList", []))
                if items and len(items) > 0:
                    return items[0].get("orgId", "")
            return None
        except Exception as e:
            logger.debug("巨潮stockId查询失败: %s", e)
            return None

    def news(self, code: str, page: int = 1, page_size: int = 10,
             news_type: str = "all") -> Optional[List]:
        """获取上市公司公告。

        通过巨潮资讯网官方API查询公告列表。
        """
        try:
            c = code.strip().zfill(6)
            # 先查orgId
            org_id = self._search_stock_id(c)

            # 构建请求
            if org_id:
                data = {
                    "stock": f"{c},{org_id}",
                    "pageNum": str(page),
                    "pageSize": str(page_size),
                    "tabid": "fulltext",
                    "seDate": "",
                    "searchkey": "",
                    "isHLtitle": "true",
                }
            else:
                data = {
                    "stock": c,
                    "pageNum": str(page),
                    "pageSize": str(page_size),
                    "tabid": "fulltext",
                    "seDate": "",
                    "searchkey": "",
                    "isHLtitle": "true",
                }

            result = self._post("https://www.cninfo.com.cn/new/hisAnnouncement/query", data)
            if not result:
                return None

            announcements = result.get("announcements") or []
            if not announcements:
                return None

            # 映射到 NewsItem
            from a_stock_layer.core.schema import NewsItem
            results = []
            for item in announcements:
                title = item.get("announcementTitle", item.get("title", ""))
                # 去除HTML标签
                import re
                title = re.sub(r'<[^>]+>', '', title)

                results.append(NewsItem(
                    code=c,
                    date=str(item.get("announcementDate", ""))[:10],
                    title=title,
                    summary=item.get("announcementContent", ""),
                    url=f"https://www.cninfo.com.cn/new/disclosure/detail?orgId={org_id or ''}&announcementId={item.get('announcementId', '')}&announcementTime={item.get('announcementDate', '')}",
                    source="巨潮资讯网",
                    content_type="announcement",
                    is_important=True,
                ))

            return results if results else None
        except Exception as e:
            logger.debug("巨潮公告查询失败 [%s]: %s", code, e)
            return None
