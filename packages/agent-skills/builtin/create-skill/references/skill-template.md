# 工作流技能最小模板

复制并改写以下结构（`---` 元数据区块 + Markdown 正文）：

```markdown
---
name: my-skill-name
description: 一句话说明何时使用；含触发词，如「用户说 XXX 时使用」。
license: Apache-2.0
metadata:
  author: user
  version: "1.0"
references:
  - references/notes.md
---

# 技能标题

## 何时使用

说明场景边界（不是什么）。

## 步骤

1. 第一步：…
2. 第二步：调用 `某工具` …
3. 输出：按 Schema 或格式交付

## 输出 Schema（可选）

```json
{
  "field": "string"
}
```

## 注意

- 事实导向，数据缺失时说明，禁止编造。
```

## name 规则

- 小写字母、数字、连字符
- 1–64 字符
- 不以连字符开头或结尾
- 不含连续 `--`
- 须与目录名一致

## description 规则

- 非空，≤ 1024 字符
- 面向 Agent：写清触发条件与能力，而非实现细节
