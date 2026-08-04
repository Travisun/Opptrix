# 深度整理（Unlimited-OCR L2，可选）

MIT。默认**不**随 Opptrix 安装包分发模型权重。体积大时仅安装框架 stub，运行时清晰失败并保留 L0/L1 最佳结果。

## 路径

`~/.opptrix/engines/unlimited-ocr/`（可用 `OPPTRIX_DATA_DIR` 覆盖根目录）

## 安装钩子

```bash
# 准备目录 + stub（不下载权重）
# API: POST /api/settings/parse-engines/deep/prepare

# 按上游 Unlimited-OCR 文档安装依赖与模型后，替换 worker.py，再：
# API: POST /api/settings/parse-engines/deep/mark-ready
# 或:  touch ~/.opptrix/engines/unlimited-ocr/READY
```

## Worker 协议

与 L1 相同：stdin 一行 JSON，stdout 一行 JSON。

```json
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
  "emptyPageRatio": 0
}
```

失败（不崩宿主）：

```json
{"ok": false, "error": "深度整理引擎尚未安装或未配置模型"}
```

## 许可注意

- Unlimited-OCR：MIT
- **禁止** PyMuPDF / AGPL 进入 Opptrix 主进程或默认依赖树
