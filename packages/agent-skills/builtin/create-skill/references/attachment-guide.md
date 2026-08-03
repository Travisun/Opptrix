# 工作流技能附件结构

技能根目录下可选三个子目录（路径均相对技能根，禁止 `..`）：

```
<skill-name>/
├── SKILL.md              # 必填：frontmatter + 步骤正文
├── references/           # 知识库、模板、JSON、长文参考
├── scripts/              # 辅助脚本（正文说明用法）
└── assets/               # 图片等静态资源
```

## frontmatter `references`

在 `SKILL.md` 顶部 YAML 中列出附加文件相对路径，例如：

```yaml
references:
  - references/knowledge.json
  - references/output-template.md
```

- 最多 16 条
- 运行时通过 `get_agent_skill_file` 按需读取
- 创建时若传 `files: [{ path, content }]`，路径会自动并入 `references`（去重）

## 创建时写入附件

`create_agent_skill` 支持：

```json
{
  "files": [
    { "path": "references/notes.md", "content": "# 笔记\n…" }
  ]
}
```

约束：

| 项 | 限制 |
|----|------|
| 允许前缀 | `references/`、`scripts/`、`assets/` |
| 单文件大小 | ≤ 200KB |
| 文件数量 | ≤ 16（含 references 数组） |
| Markdown 附件 | 须通过 injection 校验 |

## 步骤中如何引用

正文写清 Agent 应调用的工具，例如：

```
用 get_agent_skill_file(skill_name="my-skill", path="references/knowledge.json") 读取知识库。
```

## 安全

- 路径经 `resolveConfinedPath` 限制在技能根内
- 禁止绝对路径与 `..` 穿越
- 附件内容不得含 prompt 注入指令
