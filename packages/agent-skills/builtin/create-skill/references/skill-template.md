# 工作流技能最小模板

复制并改写以下结构（`---` 元数据区块 + Markdown 正文）：

```markdown
---
name: my-skill-name
description: 一句话说明何时使用；含触发词；投研类写明默认用网页交付（create_web）。
license: Apache-2.0
allowed-tools: get_instrument_profile create_web update_web read_web list_web_vendor
metadata:
  author: user
  version: "1.0"
  title: 短标题
  summary: 一句结果导向说明（勿写工具名）
  category: equity
  slash-rank: "400"
  default-deliverable: web
  required-packs: fundamentals artifacts
references:
  - references/notes.md
---

# 技能标题

## 何时使用

说明场景边界（不是什么）。

## 分析架构（投研方法）

- 问题/假设 → 证据清单 → 多维交叉验证 → 结论与不确定 → 风险与缺口
- 事实与推断必须分开

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| … | … | … |

## 步骤

1. 确认范围
2. 按维度取数（点名工具）
3. 交叉验证与结构化结论
4. 交付网页（默认）：`list_web_vendor` → `create_web`
5. 仅当用户点名画布/脑图时改用对应工具

## 网页报告建议目录

…

## 禁止

- 荐股/编造；禁止无交付就结束（除非用户只要口头要点）
```

## name 规则

- 小写字母、数字、连字符
- 1–64 字符
- 不以连字符开头或结尾
- 不含连续 `--`
- 须与目录名一致

## description 规则

- 非空，≤ 1024 字符
- 面向 Agent：写清触发条件与能力；投研类写明默认网页交付

## Composer 元数据

- `title` / `summary`：用户可见，禁止工具名/API/包名
- `category`：`market` | `equity` | `portfolio` | `strategy` | `deliverable` | `ops`
- `slash-rank`：越小越靠前
- `default-deliverable`：投研 `web`；运维可 `none`

## allowed-tools / required-packs

- `allowed-tools`：空格分隔的**工具名**。投研类须含 `create_web update_web read_web list_web_vendor`。
- `metadata.required-packs`：业务 pack + `artifacts`（投研类）。
- 二者可同时使用；**不会**把 `allowed-tools` 当成拦截其它工具的硬白名单。
