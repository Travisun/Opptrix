# 第三方组件说明（草稿）

本文件记录 Opptrix 发行物中与特定功能相关的第三方依赖许可摘要。完整依赖树以各包 `package.json` / lockfile 为准；本仓库主体许可证见根目录 [LICENSE](../LICENSE)（Apache-2.0）。

> 状态：按功能分节追加。桌面安装包级完整归因表可在发版流程中再汇总。

## Agent Canvas 预览（@opptrix/canvas）

画布预览宿主加载 `@opptrix/canvas/styles.css`，渲染 Agent TSX 中从 `@opptrix/canvas` 公开导出的 curated 组件（流体 `Surface`、版式与数据展示组件）。主题经预览根 `data-theme`（light/dark）与 `useCanvasTheme` 解析。

| 组件 | 用途 | 许可（声明） | 备注 |
|------|------|--------------|------|
| **@opptrix/canvas** | Agent 分析面板组件与语义主题 | 与本仓库主体一致（Apache-2.0） | 工作区内包；无额外第三方 UI 框架 |
| **Apache ECharts**（`echarts`） | `@opptrix/canvas` 的 `Chart`（bar/line/pie/heatmap）渲染 | Apache-2.0 | 仅经 canvas 封装；Agent 画布 TSX **禁止**直接 `import echarts` |

## 脑图预览 / 编辑（mind-elixir）

右侧附件预览与弹层中的脑图编辑器使用开源 **mind-elixir**（框架无关核心）。会话附件存盘格式仍为 Opptrix 扁平 JSON（`version` / `rootId` / `nodes`），经 `mindmapElixirBridge` 与 mind-elixir 树形 `nodeData` 互转；消息内缩略卡不嵌入完整编辑器。

| 组件 | 用途 | 许可（声明） | 备注 |
|------|------|--------------|------|
| **mind-elixir** | 脑图布局、编辑、缩放、PNG 导出 | MIT | `client-ui` 依赖；主题跟随应用 light/dark（`THEME` / `DARK_THEME`） |

## Document Library（Phase A + B + C）

本地会话研报库（`@opptrix/doc-library`）：多格式附件 ingest（文本 / `.doc` / `.docx` / `.ppt` / `.pptx` / 图片 / PDF）→ Parse Router → SQLite 元数据 / 正文 chunk + FTS；语义向量索引（LanceDB + e5-small，**桌面默认内置**）与混合检索（FTS ⊕ 向量 RRF；未就绪降级 FTS）。Agent 侧经 `list_session_documents` / `search_document` / `read_document` / `search_library`（跨库 Hybrid 多跳）按需阅读。**无主题关联图**。附件 meta 镜像字段见 [API.md · AttachmentExtractMeta](./API.md)（`extract.documentId`）。

### 已纳入（运行时 / 可选下载）

| 组件 | 用途 | 许可（声明） | 备注 |
|------|------|--------------|------|
| **SQLite**（经 **better-sqlite3**） | `doc-library.db` 持久化；chunk 表 + **FTS5** 全文检索 | MIT（better-sqlite3）；SQLite 本身为公共领域（blessing） | 路径：`~/.opptrix/doc-library/` |
| **pdf-parse** | PDF 文本抽取（`packages/agent` → `pdf-extract` / `pdf-extract-l0`） | MIT | PDF 默认路径；弱文本时升 OCR |
| **mammoth** | `.docx` 纯文本抽取（`office-l0`） | BSD-2-Clause | OOXML Word |
| **word-extractor** | `.doc`（OLE）纯文本抽取（`office-l0`） | MIT | 用户无需自行转换 |
| **jszip** | `.pptx` 读 slide XML `<a:t>`；docx/pptx 抽内嵌图（`office-l0` + embedded-images） | MIT | 按幻灯片分 chunk；图内文字并入对应页 |
| **ppt-to-text** | `.ppt`（97–2003）文本抽取（`office-l0`） | Apache-2.0 | 纯 Node 正文抽取；不认图、无格式转换 |
| **@gutenye/ocr-node** + **onnxruntime-node** | Node ONNX OCR（`ocr-l2`）；内嵌图复用 `ocrImageBuffer` | Apache-2.0 / MIT（见上游） | **默认深度整理路径**；复用 PP-OCRv4 mobile ONNX；含图内文字 |
| **@hyzyla/pdfium** | PDF 页栅格化 + 页内图像对象导出（供 OCR，非 AGPL） | 遵循上游 PDFium 声明 | 配合 sharp 出 PNG；禁 PyMuPDF |
| **sharp** | OCR 前图像编码 | Apache-2.0 | |
| **LanceDB**（`@lancedb/lancedb`） | chunk 向量索引 / 混合检索后端 | Apache-2.0 | 路径：`~/.opptrix/lancedb/doc_chunks/` |
| **@huggingface/transformers** | 本地加载 e5 ONNX、分词与 mean-pool | Apache-2.0 | |
| **multilingual-e5-small**（Xenova ONNX 布局） | 文本向量化（dim=384） | 遵循模型卡 / 上游声明 | **桌面默认内置** `resources/llms/multilingual-e5-small/` |
| **PP-OCRv4 mobile ONNX**（RapidAI / PaddleOCR 衍生） | det/rec/cls + keys | Apache-2.0（上游声明） | **桌面默认内置** `resources/llms/rapidocr-ppocrv4-mobile/` |
| **rapidocr-l2 / unlimited-ocr-l2** | 历史引擎 ID 别名 | — | 读旧 artifact 映射至 `ocr-l2`；Python RapidOCR worker **非必须** |

### 禁止默认路径

- **PyMuPDF / fitz（AGPL）**：不得链入 Opptrix 主进程或默认依赖树。
- **pdfplumber L1**：已从默认路径与设置页移除（代码可保留兼容导出，不进 stage）。

### 模型下载源（开发者说明）

桌面发版时 `stage-e5.mjs` / `stage-rapidocr.mjs` 将权重 stage 进安装包。`stage-rag-engines.mjs` 不再下载 Python wheels（OCR 已 Node 化）。用户侧无内置、或开发态按需安装时，模型下载顺序为：

1. **ModelScope**（e5：`OPPTRIX_E5_MODELSCOPE_REPO`；OCR：`OPPTRIX_RAPIDOCR_MODELSCOPE_REPO`，默认 `RapidAI/RapidOCR`）
2. **HF 镜像**（默认 `https://hf-mirror.com`，`OPPTRIX_HF_MIRROR`）
3. **Hugging Face** 官方

日志只记录源标签与错误类型，不打印完整 URL / token。未就绪时检索自动降级为纯 FTS，不中断入库。卸载设置项仅清除用户目录副本，不删除安装包内置文件。

### Parse 路由

| 引擎 ID | 用户文案 | 触发 |
|---------|----------|------|
| `text-l0` | 基础整理 | `.txt` / `.md` 等文本 |
| `office-l0` | 基础整理 | `.docx` / `.doc` / `.pptx` / `.ppt`；docx/pptx 含图内文字（OCR 就绪时） |
| `pdf-extract-l0` | 基础整理 | PDF 默认；可复制文本 + 页内嵌图文字（OCR 就绪时） |
| `ocr-l2` | 深度整理 | 图片（必经）；或 PDF 弱文本 / `deepParse`（整页扫描）；模型就绪；未就绪时友好失败 |

### 实现索引

| 项 | 位置 |
|----|------|
| 文档库包 | `packages/doc-library` |
| ParseRouter | `packages/doc-library/src/parse-router.ts` |
| Agent 桥接 / ingest | `packages/agent/src/doc-library-bridge.ts` |
| Agent 工具 | `packages/agent/src/document-tools.ts` |
| 语义模型 API | `GET/POST /api/settings/semantic-model*` |
| 桌面 stage / 内置 | `stage-e5.mjs`、`stage-rapidocr.mjs`；`extraResources` → `llms/` |
| 解析引擎 API | `GET/POST /api/settings/parse-engines*` |
| 行为说明 | [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)（多媒体）；桌面内置见 [DESKTOP.md](./DESKTOP.md) |
