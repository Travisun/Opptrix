# 深度整理侧车（RapidOCR ONNX，默认 L2）

Apache-2.0（RapidOCR）。桌面安装包默认内置 PP-OCRv4 mobile 权重；运行时经 Python 侧车调用，**不**链入主进程。

**禁止** PyMuPDF / fitz（AGPL）。

## 路径

| 用途 | 路径 |
|------|------|
| Worker / venv | `~/.opptrix/engines/rapidocr-worker/` |
| 用户模型副本 | `~/.opptrix/llms/rapidocr-ppocrv4-mobile/`（兼容旧 `~/.opptrix/models/…`） |
| 安装包内置模型 | `resources/llms/rapidocr-ppocrv4-mobile/` → `llms/…` |
| 安装包内置 wheels | `resources/engines/<platform>-<arch>/rapidocr-worker/wheels/` |

可用 `OPPTRIX_DATA_DIR` 覆盖用户根目录；`OPPTRIX_RAPIDOCR_MODEL_DIR` 强制模型目录；`OPPTRIX_RAPIDOCR_BUNDLED_DIR` / `OPPTRIX_RAG_ENGINES_BUNDLED_DIR` 指向内置目录。`prepare` 优先离线 pip。

## 协议

stdin 一行 JSON，stdout 一行 JSON（与 L1 相同）：

```json
{"op":"ping"}
{"op":"extract","pdf_path":"/abs/file.pdf"}
```

成功：

```json
{
  "ok": true,
  "pageCount": 1,
  "charCount": 120,
  "markdown": "<!-- page:1 -->\n…",
  "chunks": [{"page": 1, "offset": 0, "text": "…"}],
  "emptyPageRatio": 0,
  "engine": "rapidocr-l2",
  "version": "1.0.0"
}
```

无模型时清晰失败（不崩宿主）：

```json
{"ok": false, "error": "深度整理模型未就绪"}
```

## 准备

```bash
# API: POST /api/settings/parse-engines/deep/prepare
# 同步 worker、创建 venv、pip install、ping 成功后写 READY
```

开发态无内置模型时，prepare 会尝试下载到用户模型目录（ModelScope → HF 镜像 → HF）。

## 可选：Unlimited-OCR

旧 stub 仍保留于 `scripts/unlimited-ocr/`，**不**进默认路径；引擎 ID `unlimited-ocr-l2` 为兼容别名，映射同一 RapidOCR runner。
