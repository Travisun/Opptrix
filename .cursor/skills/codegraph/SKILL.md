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

## 首选：MCP 工具

```
codegraph_explore
  query: "<自然语言问题或符号名>"
  projectPath: "/Users/mac/Documents/Opptrix"  # 可选，默认当前工作区
```

一次调用即返回：相关符号的**完整源码**（带行号）、调用关系、影响范围摘要。把返回的源码视为已 Read，勿重复打开同一文件。

## CLI 回退（终端 / MCP 未加载时）

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /Users/mac/Documents/Opptrix

codegraph explore "聊天侧栏如何在小窗口下浮层显示？"
codegraph query ChatApp --limit 5
codegraph callers ChatView
codegraph impact ChatApp --depth 2
codegraph status
```

## 索引生命周期

| 场景 | 操作 |
|------|------|
| 首次克隆 / 无 `.codegraph/` | `codegraph init` |
| 日常开发 | 自动同步（MCP `serve --mcp` 启动后监听变更） |
| 怀疑索引过期 | `codegraph status` 查看 Pending sync |
| 沙箱 / 禁用守护进程 | 改完后手动 `codegraph sync` |

## 注意事项

- 索引数据在 `.codegraph/`，已 gitignore，勿提交数据库
- 遥测已关闭：`codegraph telemetry off` / `CODEGRAPH_TELEMETRY=0`
- 安装 CLI：`curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh \| sh`
- 接入 Cursor：`codegraph install --target=cursor --yes`，然后**重启 Cursor**

## 与其他工具的关系

CodeGraph 负责**探索与定位**；确定修改点后仍用 Read 精确定位、用编辑工具改代码。若返回 ⚠️ 待同步横幅，对该文件用 Read 取最新内容。
