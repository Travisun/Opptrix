# 第三方组件说明（草稿）

本文件记录 Opptrix 发行物中与特定功能相关的第三方依赖许可摘要。完整依赖树以各包 `package.json` / lockfile 为准；本仓库主体许可证见根目录 [LICENSE](../LICENSE)（Apache-2.0）。

> 状态：按功能分节追加。桌面安装包级完整归因表可在发版流程中再汇总。

## Document Library（Phase A + B + C）

本地会话研报库（`@opptrix/doc-library`）：PDF 附件 ingest → Parse Router 级联整理 → SQLite 元数据 / 正文 chunk + FTS；可选语义向量索引（LanceDB + e5-small）与混合检索（FTS ⊕ 向量 RRF）。Agent 侧经 `list_session_documents` / `search_document` / `read_document` 按需阅读。附件 meta 镜像字段见 [API.md · AttachmentExtractMeta](./API.md)（`extract.documentId`）。

### 已纳入（运行时 / 可选下载）

| 组件 | 用途 | 许可（声明） | 备注 |
|------|------|--------------|------|
| **SQLite**（经 **better-sqlite3**） | `doc-library.db` 持久化；chunk 表 + **FTS5** 全文检索 | MIT（better-sqlite3）；SQLite 本身为公共领域（blessing） | 路径：`~/.opptrix/doc-library/` |
| **pdf-parse** | L0 PDF 文本抽取（`packages/agent` → `pdf-extract` / ParseRunner） | MIT | 默认路径；弱文本时升阶 |
| **pdfplumber** | L1 版面增强（Python **侧车** `child_process`，非主进程链入） | MIT | 可选；`~/.opptrix/engines/pdfplumber-worker/`；见 `scripts/pdfplumber-worker/` |
| **LanceDB**（`@lancedb/lancedb`） | chunk 向量索引 / 混合检索后端 | Apache-2.0 | 路径：`~/.opptrix/lancedb/doc_chunks/`；未装 embedding 时不强制使用 |
| **@huggingface/transformers** | 本地加载 e5 ONNX、分词与 mean-pool | Apache-2.0 | 推理依赖；**不**打包模型权重 |
| **multilingual-e5-small**（Xenova ONNX 布局） | 文本向量化（dim=384） | 遵循模型卡 / 上游声明（商用友好） | **按需下载**至 `~/.opptrix/models/multilingual-e5-small/`；默认不进安装包 |
| **Unlimited-OCR**（可选本地包） | L2 深度整理（扫描件 / 图像 PDF） | MIT | **默认不捆绑权重**；`~/.opptrix/engines/unlimited-ocr/`；未配置时清晰失败并保留 L0/L1 最佳结果 |

### 禁止默认路径

- **PyMuPDF / fitz（AGPL）**：不得链入 Opptrix 主进程或默认依赖树。

### 模型下载源（开发者说明）

安装语义检索模型时，下载顺序为：

1. **ModelScope**（可用 `OPPTRIX_MODELSCOPE_BASE`、`OPPTRIX_E5_MODELSCOPE_REPO` 覆盖）
2. **HF 镜像**（默认 `https://hf-mirror.com`，`OPPTRIX_HF_MIRROR`）
3. **Hugging Face** 官方（`OPPTRIX_E5_HF_REPO`，默认 `Xenova/multilingual-e5-small`）

日志只记录源标签与错误类型，不打印完整 URL / token。未安装模型时检索自动降级为纯 FTS，不中断入库。

### Parse 升阶（Phase C）

| 层 | 用户文案 | 触发 |
|----|----------|------|
| L0 | 基础整理 | 默认 |
| L1 | 版面增强 | L0 弱文本且侧车可用 |
| L2 | 深度整理 | 已安装 **且**（`deepParse` / `forceEngine`） |

安装说明：`scripts/pdfplumber-worker/README.md`、`scripts/unlimited-ocr/README.md`。

### 实现索引

| 项 | 位置 |
|----|------|
| 文档库包 | `packages/doc-library` |
| ParseRouter | `packages/doc-library/src/parse-router.ts` |
| Agent 桥接 / ingest | `packages/agent/src/doc-library-bridge.ts` |
| Agent 工具 | `packages/agent/src/document-tools.ts` |
| 语义模型 API | `GET/POST /api/settings/semantic-model*` |
| 解析引擎 API | `GET/POST /api/settings/parse-engines*` |
| 行为说明 | [AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)（多媒体） |
