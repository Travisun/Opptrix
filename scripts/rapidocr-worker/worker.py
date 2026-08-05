#!/usr/bin/env python3
"""
Opptrix L2 RapidOCR (ONNX) sidecar — Apache-2.0 (RapidOCR).

Protocol: one JSON request on stdin, one JSON response on stdout.
  {"op":"ping"}
  {"op":"extract","pdf_path":"/abs/path.pdf"}

Do NOT import or call PyMuPDF / fitz (AGPL). Use pypdfium2 for PDF rasterization.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from typing import Any

ENGINE_ID = "rapidocr-l2"
ENGINE_VERSION = "1.0.0"
CHUNK_TARGET = 2800

DET_NAME = "ch_PP-OCRv4_det_mobile.onnx"
REC_NAME = "ch_PP-OCRv4_rec_mobile.onnx"
CLS_NAME = "ch_ppocr_mobile_v2.0_cls_mobile.onnx"
KEYS_NAME = "ppocr_keys_v1.txt"
REQUIRED_MODEL_FILES = (DET_NAME, REC_NAME, CLS_NAME, KEYS_NAME)


def respond(payload: dict[str, Any], exit_code: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    raise SystemExit(exit_code)


def model_dir() -> str | None:
    raw = os.environ.get("OPPTRIX_RAPIDOCR_MODEL_DIR", "").strip()
    return raw or None


def missing_model_files(root: str) -> list[str]:
    return [name for name in REQUIRED_MODEL_FILES if not os.path.isfile(os.path.join(root, name))]


def build_engine() -> Any:
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        respond({"ok": False, "error": "深度整理依赖未安装"}, 2)

    root = model_dir()
    if not root:
        respond({"ok": False, "error": "深度整理模型未就绪"}, 2)
    missing = missing_model_files(root)
    if missing:
        respond({"ok": False, "error": "深度整理模型未就绪"}, 2)

    return RapidOCR(
        det_model_path=os.path.join(root, DET_NAME),
        cls_model_path=os.path.join(root, CLS_NAME),
        rec_model_path=os.path.join(root, REC_NAME),
        rec_keys_path=os.path.join(root, KEYS_NAME),
    )


def ping() -> None:
    try:
        import pypdfium2  # noqa: F401
        import rapidocr_onnxruntime  # noqa: F401
    except ImportError:
        respond({"ok": False, "error": "深度整理依赖未安装"}, 2)

    root = model_dir()
    if not root or missing_model_files(root):
        respond({"ok": False, "error": "深度整理模型未就绪"}, 2)

    respond({"ok": True, "engine": ENGINE_ID, "version": ENGINE_VERSION})


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


def ocr_image(engine: Any, image_path: str) -> str:
    result, _elapse = engine(image_path)
    if not result:
        return ""
    lines: list[str] = []
    for item in result:
        if not item or len(item) < 2:
            continue
        text = item[1]
        if isinstance(text, str) and text.strip():
            lines.append(text.strip())
    return "\n".join(lines)


def extract(pdf_path: str) -> None:
    if not isinstance(pdf_path, str) or not pdf_path or not os.path.isfile(pdf_path):
        respond({"ok": False, "error": "无效的研报文件"}, 1)

    try:
        import pypdfium2 as pdfium
    except ImportError:
        respond({"ok": False, "error": "深度整理依赖未安装"}, 2)

    engine = build_engine()
    pages_out: list[dict[str, Any]] = []
    empty = 0
    md_parts: list[str] = []

    try:
        pdf = pdfium.PdfDocument(pdf_path)
    except Exception as exc:  # noqa: BLE001
        respond({"ok": False, "error": f"深度整理失败: {exc}"}, 1)

    try:
        page_count = len(pdf)
        with tempfile.TemporaryDirectory(prefix="opptrix-rapidocr-") as tmp:
            for idx in range(page_count):
                page_no = idx + 1
                try:
                    page = pdf[idx]
                    # ~150 DPI equivalent scale for mobile OCR
                    bitmap = page.render(scale=2.0)
                    pil = bitmap.to_pil()
                    img_path = os.path.join(tmp, f"page-{page_no}.png")
                    pil.save(img_path, format="PNG")
                    text = ocr_image(engine, img_path).strip()
                except Exception:
                    text = ""

                if not text:
                    empty += 1
                pages_out.append({"page": page_no, "text": text})
                md_parts.append(f"<!-- page:{page_no} -->")
                if text:
                    md_parts.append(text)
                md_parts.append("")
    finally:
        try:
            pdf.close()
        except Exception:
            pass

    markdown = "\n".join(md_parts).strip()
    n = max(len(pages_out), 0)
    empty_ratio = (empty / n) if n else 1.0
    chunks = build_chunks(pages_out)
    respond(
        {
            "ok": True,
            "pageCount": n,
            "charCount": len(markdown),
            "markdown": markdown,
            "chunks": chunks,
            "emptyPageRatio": empty_ratio,
            "engine": ENGINE_ID,
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
        extract(req.get("pdf_path"))
    respond({"ok": False, "error": f"未知 op: {op}"}, 1)


if __name__ == "__main__":
    main()
