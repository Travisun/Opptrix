#!/usr/bin/env python3
"""
Opptrix L1 pdfplumber sidecar — MIT (pdfplumber).

Protocol: one JSON request on stdin, one JSON response on stdout.
  {"op":"ping"}
  {"op":"extract","pdf_path":"/abs/path.pdf"}

Do NOT import or call PyMuPDF / fitz (AGPL).
"""
from __future__ import annotations

import json
import sys
from typing import Any


ENGINE_VERSION = "1.0.0"
CHUNK_TARGET = 2800


def respond(payload: dict[str, Any], exit_code: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    raise SystemExit(exit_code)


def ping() -> None:
    try:
        import pdfplumber  # noqa: F401
    except ImportError:
        respond({"ok": False, "error": "pdfplumber 未安装"}, 2)
    respond({"ok": True, "engine": "pdfplumber-l1", "version": ENGINE_VERSION})


def build_chunks(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    offset = 0
    for page in pages:
        text = (page.get("text") or "").strip()
        if not text:
            continue
        if len(text) <= CHUNK_TARGET:
            chunks.append({"page": page["page"], "offset": offset, "text": text})
            offset += len(text)
            continue
        start = 0
        while start < len(text):
            end = min(start + CHUNK_TARGET, len(text))
            if end < len(text):
                soft = text.rfind("\n\n", start, end)
                if soft > start + CHUNK_TARGET // 2:
                    end = soft
            slice_ = text[start:end].strip()
            if slice_:
                chunks.append({"page": page["page"], "offset": offset, "text": slice_})
                offset += len(slice_)
            start = end
    return chunks


def extract(pdf_path: str) -> None:
    try:
        import pdfplumber
    except ImportError:
        respond({"ok": False, "error": "pdfplumber 未安装"}, 2)

    pages_out: list[dict[str, Any]] = []
    empty = 0
    md_parts: list[str] = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for idx, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                text = text.replace("\r\n", "\n").strip()
                # tables → simple markdown
                tables_md: list[str] = []
                try:
                    for table in page.extract_tables() or []:
                        if not table or len(table) < 2:
                            continue
                        rows = [[(c or "").replace("|", "\\|").strip() for c in row] for row in table]
                        if not rows:
                            continue
                        header = rows[0]
                        body = rows[1:]
                        col_n = max(len(r) for r in rows)
                        def pad(r: list[str]) -> list[str]:
                            out = list(r)
                            while len(out) < col_n:
                                out.append("")
                            return out
                        header = pad(header)
                        sep = "| " + " | ".join("---" for _ in range(col_n)) + " |"
                        lines = [
                            "| " + " | ".join(header) + " |",
                            sep,
                            *("| " + " | ".join(pad(r)) + " |" for r in body),
                        ]
                        tables_md.append("\n".join(lines))
                except Exception:
                    tables_md = []

                if not text and not tables_md:
                    empty += 1
                pages_out.append({"page": idx, "text": text})
                md_parts.append(f"<!-- page:{idx} -->")
                if text:
                    md_parts.append(text)
                for t in tables_md:
                    md_parts.append(t)
                md_parts.append("")
    except Exception as exc:  # noqa: BLE001 — surface to host
        respond({"ok": False, "error": f"版面增强失败: {exc}"}, 1)

    markdown = "\n".join(md_parts).strip()
    page_count = max(len(pages_out), 0)
    empty_ratio = (empty / page_count) if page_count else 1.0
    chunks = build_chunks(pages_out)
    respond(
        {
            "ok": True,
            "pageCount": page_count,
            "charCount": len(markdown),
            "markdown": markdown,
            "chunks": chunks,
            "emptyPageRatio": empty_ratio,
            "engine": "pdfplumber-l1",
            "version": ENGINE_VERSION,
        }
    )


def main() -> None:
    raw = sys.stdin.readline()
    if not raw:
        respond({"ok": False, "error": "空请求"}, 1)
    try:
        req = json.loads(raw)
    except json.JSONDecodeError:
        respond({"ok": False, "error": "无效 JSON"}, 1)

    op = req.get("op")
    if op == "ping":
        ping()
    if op == "extract":
        pdf_path = req.get("pdf_path")
        if not isinstance(pdf_path, str) or not pdf_path:
            respond({"ok": False, "error": "缺少 pdf_path"}, 1)
        extract(pdf_path)
    respond({"ok": False, "error": f"未知 op: {op}"}, 1)


if __name__ == "__main__":
    main()
