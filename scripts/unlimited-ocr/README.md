# 深度整理（Unlimited-OCR，可选 · 非默认）

MIT。**默认 L2 已切换为 RapidOCR ONNX**（见 `scripts/rapidocr-worker/`）。本目录仅保留可选 stub / 协议参考，不进默认路径。

兼容引擎 ID `unlimited-ocr-l2` 映射至同一 RapidOCR runner。

## 路径（历史）

`~/.opptrix/engines/unlimited-ocr/`（可用 `OPPTRIX_DATA_DIR` 覆盖根目录）

## Worker 协议

与默认 L2 相同：stdin 一行 JSON，stdout 一行 JSON。

```json
{"op":"extract","pdf_path":"/abs/file.pdf"}
```

## 许可注意

- Unlimited-OCR：MIT（可选）
- 默认路径：RapidOCR Apache-2.0 + 桌面内置 PP-OCRv4 mobile
- **禁止** PyMuPDF / AGPL 进入 Opptrix 主进程或默认依赖树
