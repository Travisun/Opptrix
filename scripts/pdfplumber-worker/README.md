# 版面增强侧车（pdfplumber L1）

MIT 许可。通过 Node `child_process.spawn` 调用，**不**链入 Electron 主进程。

## 安装到用户目录

```bash
# 从仓库根目录
INSTALL_DIR="${OPPTRIX_DATA_DIR:-$HOME/.opptrix}/engines/pdfplumber-worker"
mkdir -p "$INSTALL_DIR"
cp scripts/pdfplumber-worker/worker.py scripts/pdfplumber-worker/requirements.txt "$INSTALL_DIR/"
cd "$INSTALL_DIR"
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
date -u +%Y-%m-%dT%H:%M:%SZ > READY
```

或调用 API：`POST /api/settings/parse-engines/layout/prepare`（同步脚本 → 创建 venv → pip；桌面内置 wheels 时离线 `--no-index --find-links`）。

桌面打包：`apps/desktop/scripts/stage-rag-engines.mjs` → `resources/engines/<platform>-<arch>/pdfplumber-worker/wheels/`。

## 协议

stdin 一行 JSON，stdout 一行 JSON：

- `{"op":"ping"}` → `{"ok":true,"engine":"pdfplumber-l1","version":"…"}`
- `{"op":"extract","pdf_path":"/abs/file.pdf"}` → `pageCount` / `charCount` / `markdown` / `chunks` / `emptyPageRatio`

超时由宿主 kill。禁止使用 PyMuPDF。
