---
name: codegraph
description: >-
  Query the local CodeGraph knowledge graph for surgical code context instead of
  grep/Read crawls. Use when exploring architecture, call flows, dependencies,
  impact radius, or any "how does X work" question in this repo. 100% local index
  at .codegraph/ — no code sent to cloud.
---

# CodeGraph 本地代码索引

## 何时使用

- 理解模块如何工作、请求如何流转、谁调用谁
- 改代码前评估影响范围（callers / blast radius）
- 定位符号、路由、跨文件依赖
- **不要**用 Grep/Glob 全库扫一遍再 Read — 先问 CodeGraph

## 首选：CLI（MiMo 环境）

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/mac/Documents/Opptrix

codegraph explore "聊天侧栏如何在小窗口下浮层显示？"
codegraph query ChatApp --limit 5
codegraph callers ChatView
codegraph impact ChatApp --depth 2
codegraph status
```

若 MCP 已配置 `codegraph` 服务，优先用 `codegraph_explore`。

一次调用即返回：相关符号的**完整源码**（带行号）、调用关系、影响范围摘要。把返回的源码视为已 Read，勿重复打开同一文件。

## 工具优先级（从高到低）

1. **`codegraph explore` / MCP `codegraph_explore`**
2. **Read** — 已定位后打开要改的具体文件/行
3. **Grep / Glob / Shell** — 极窄验证，或 CodeGraph 无法覆盖的场景
4. **子 agent** — 不得替代 CodeGraph 扫库；派发探索时 prompt 须写明先 CodeGraph

## 禁止

- 会话开始就 `Glob **/*`、逐目录 Read、Grep 摸结构
- CodeGraph 能答却用 Read/Grep 循环拼上下文
- 把「读很多文件找答案」交给 subagent 而未先查 CodeGraph

## 允许跳过

1. 已给出目标 — 仅需 Read 编辑具体行
2. 无 `.codegraph/` — 提示 `codegraph init`，或只处理 configs/docs
3. 返回 ⚠️「待同步」且刚编辑过 — 对该文件 Read 最新内容
4. 非图谱内容：环境变量、锁文件、二进制、用户粘贴的日志

## 索引生命周期

| 场景 | 操作 |
|------|------|
| 首次克隆 / 无 `.codegraph/` | `codegraph init` |
| 日常开发 | MCP serve 监听变更；或改完后 `codegraph sync` |
| 怀疑过期 | `codegraph status` |
| 遥测 | `CODEGRAPH_TELEMETRY=0` / `codegraph telemetry off` |

## 改代码时

CodeGraph 负责**探索与定位**；确定修改点后用编辑工具改代码。

涉及**行情 / 数据拉取 / Hub 接口**时，探索目标须包含 `queryInstrumentData`、`InstrumentDataCapability`、现有 capability 调用链；不得跳过标准层直接找 Provider。见 skill `data-layer`。

完整规则原文：`.cursor/rules/codegraph.mdc`。
