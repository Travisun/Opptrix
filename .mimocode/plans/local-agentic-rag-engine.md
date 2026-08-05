# 本地 Agentic RAG + 研报识别引擎（定稿）

> 分支建议：`feat/local-doc-rag-engine`（从当前 PDF 文本化分支或 main 派生，由 Implementer 对齐）
> 模型下载：ModelScope 优先，失败回退镜像 / HuggingFace

## 目标

- 会话拖入 PDF/图片研报 → **自动入库**（本地知识库）
- **SHA256** 命中 → 复用已有解析，不重复跑引擎
- Agent：**list / search / read**（库范围；search = FTS + 向量融合）
- 识别级联：文本层 → 版面 → 可选视觉 OCR（默认不捆绑大模型）

## 非目标（本阶段）

- Qdrant / 云端向量库
- PyMuPDF（AGPL）默认路径
- 跨设备同步云知识库
- 主题关联图 / GraphRAG（已改为硬删，见附录）

## 架构

```
拖入 → Ingest Gate → sha256 命中? → 绑定 document_id
                  └否→ Parse Router
                         L0 TextLayer (pdf-parse, 内置)
                         L1 Layout (pdfplumber worker, MIT)
                         L2 Vision (Unlimited-OCR 可选包, MIT)
                      → Normalize + Chunk
                      → SQLite 元数据/FTS + LanceDB 向量
Agent tools → FTS ⊕ LanceDB → read chunks
```

## 技术选型（License）

| 层 | 选型 | License |
|----|------|---------|
| 元数据 / SHA / 会话绑定 | SQLite | — |
| 关键词 | FTS5 | — |
| 向量库 | **LanceDB**（嵌入式） | Apache-2.0 |
| Embedding | **multilingual-e5-small**（桌面默认内置；否则按需下载） | 遵循模型卡（商用友好） |
| L0 | 现有 pdf-parse / pdf.js | Apache-2.0 |
| L1 | pdfplumber 侧车 | MIT |
| L2 | Unlimited-OCR 可选本地包 | MIT |
| 下载 | ModelScope 优先，镜像/HF 回退 | — |

**禁止默认路径**：PyMuPDF / AGPL 链入主程序。

## 数据模型（契约草案）

- `documents`：id, content_sha256, name, mime, kind, byte_size, created_at, updated_at
- `parse_artifacts`：document_id, engine_id, engine_version, status, page_count, char_count, md_path, error, ready_at, parse_fingerprint
- `chunks`：id, document_id, page, offset, text, char_count（FTS 索引 text）
- `session_documents`：session_id, document_id, attachment_id?, linked_at
- LanceDB table：chunk_id, document_id, vector(384), 可选 text 冗余

## 分阶段交付

### Phase A — 库 + 入库 + FTS + 工具

- 文档库 CRUD + SHA256 去重
- 拖入/saveAttachment 后 upsert + 异步 L0 解析（复用现有 pdf-extract）
- FTS5 搜索
- Agent：`list_session_documents` / `search_document` / `read_document` 改为库优先（会话过滤）
- UI：整理状态可继续轮询 meta；文案保持产品口吻

### Phase B — LanceDB + e5-small

- 本地 embedding 运行时（ONNX 优先），ModelScope 下载
- 解析 ready 后异步 embed chunks → LanceDB
- search：FTS TopK ∪ 向量 TopK → RRF/加权
- 未下载 embedding：仅 FTS，不报错中断

### Phase C — L1 / L2 引擎包

- pdfplumber worker（子进程）
- Unlimited-OCR 可选安装到 `~/.opptrix/engines/unlimited-ocr/`
- Router：弱文本升 L1；扫描/用户深度整理升 L2
- 设置页：安装/卸载深度引擎与 embedding（ModelScope）

## 验收（总 AC）

- [x] 拖入 2 份电子版 PDF → 入库 → search/read 可回答并带页码
- [x] 同一文件再拖入 → SHA 命中秒级复用，不重跑 L0
- [x] 纯文本模型可用（不依赖 PDF 多模态）
- [x] 未装 embedding / L2 时功能降级可用
- [x] NOTICE/关于页列出第三方 License
- [ ] `build:packages` / 相关测试通过；有 UI 则 `check:ui`

## Subagent 分工

1. Explorer → 接入点与现有 extract/附件流
2. Architect → 最终接口与表结构
3. Implementer A/B/C → 按 Phase
4. Verifier → 门禁与 AC
5. Documenter → AGENT-GUIDE / API.md

## 附录：接口契约（Architect 定稿，2026-08-05）

### 裁决

- 独立包 `@opptrix/doc-library` + `{userDataRoot}/doc-library.db`（不用扩 `opptrix.db` 的 namespace documents）
- Phase A：仅 L0 + FTS；`searchHybrid` 先别名 `searchFts`
- 双写：`chat-attachments/.../extract.md` + `meta.extract.documentId`
- Chunk 全局 id：`{documentId}:c{seq}`；legacy JSON 仍用 `c0` 格式
- 模型下载：ModelScope → 镜像 → HF；未装则仅 FTS

### 表（v1）

`documents`（UNIQUE content_sha256）、`parse_artifacts`、`chunks`、`session_documents`、`fts_chunks`（FTS5 unicode61）

### API

`DocLibraryService`: ingestFromAttachment / linkSession / listSessionDocuments / searchFts|searchHybrid / getChunkRange / getParseStatus

### Parse

`ParseEngineId`: pdf-extract-l0 | pdfplumber-l1 | unlimited-ocr-l2  
Phase A：`selectEngine` 恒 L0；升阶规则 Phase C 启用

### 模型下载（Phase B）

桌面：`resources/llms/multilingual-e5-small/` 内置 → `~/.opptrix/llms/…` → 按需下载；LanceDB：`~/.opptrix/lancedb/doc_chunks/`

### Explorer 接入要点

- 钩子：`chat-attachments.saveAttachment` → ingest gate
- 工具：`document-tools.ts` 库优先 + attachment 回退
- UI 继续轮询 `meta.extract`；状态源以库为准、meta 镜像
- 并发：按 sha256 单飞锁

### Phase A 文件清单

见 Explorer 报告；核心新增 `packages/doc-library/**`，改造 `chat-attachments` / `document-tools` / meta 类型与测试。


## 附录：无图 Agentic Hybrid RAG（定稿 2026-08-05；Graph **硬删** 2026-08-05）

### 目标

在 parse + embed 就绪后，**不依赖主题关联图**，由 Agent 经 Hybrid 检索 + 多跳精读完成跨会话/全库研报与资讯挖掘。

### 检索主路径（Hybrid 多跳）

1. **Hybrid 召回**：`searchHybrid`（FTS ⊕ 向量，RRF 融合）；`scope=session`（本会话）| `scope=library`（跨会话全库）
2. **Agent 多跳**：`search_library` 找片段 → `read_document(document_id)` 精读 → 可换关键词重复直至信息足够（**无需先建图**）

### Agent 工具

| 场景 | 工具链 |
|------|--------|
| 本会话附件 | `list_session_documents` → `search_document` → `read_document` |
| 跨会话/全库 | `search_library` → `read_document(document_id)` 多跳 |

意图路由（`tool-route-plan.ts`）：跨研报/实体类问句 → intent **`library_search`**，首选 `search_library`；勿与 `search_document` / `list_session_documents` 混淆。

### 关联图（**硬删**，非软停用）

> 目标态：代码 / API / schema / UI **全部移除** GraphRAG，不是「字段保留 + no-op」。

- **删除**：`packages/doc-library/src/graph/**`、`scheduleGraph` / `graph_jobs` worker / LLM 边 / 社区 tick
- **删除 API**：`GET|PATCH /api/settings/doc-library`、`GET .../status`、`POST .../association/requeue`、`GET /api/doc-library/graph/search`
- **schema v5**：`DROP` `entities` / `edges` / `graph_jobs` / `graph_communities` / `graph_community_members` / `graph_community_documents`
- **schema v6**：删除列 `documents.llm_graph_at`（`DOC_LIBRARY_SCHEMA_VERSION` → 6，`MIGRATION_STEPS` 对齐）
- **死代码清理**：移除 `search_knowledge_graph` 工具注册与别名处理；清理图相关 repository / types / worker 残留
- **设置页**：无关联 UI（已移除）
- embed 完成后**仅**向量索引，不入队任何图任务

### 模型与降级

- **向量** = multilingual-e5-small + LanceDB（**桌面默认内置** `resources/llms/` → 用户目录 → 按需下载；未就绪则 FTS-only）
- **语义未就绪**：`searchHybrid` 自动降级 `searchFts`，不阻断对话

### 入库与范围

| 来源 | source_type | Hybrid 索引 |
|------|-------------|-------------|
| 研报附件 / 文档库 | `report` | ✅ |
| 新闻（feed 正文入库） | `news` | ✅（仅 parse + embed，无建图） |

### 验收（RAG AC）

- [x] 跨会话：`search_library` 命中 chunk → `read_document` 带页码引用
- [x] 未装 / 未就绪 embedding：FTS 降级仍可检索
- [ ] Graph **硬删**：无 `graph_jobs` 入队；关联设置 / graph/search 端点已移除；schema v5 DROP 图表 + v6 删除 `llm_graph_at`；无 `search_knowledge_graph` 别名
- [x] 路由黄金用例：跨研报问句首推 `search_library`（intent `library_search`）

