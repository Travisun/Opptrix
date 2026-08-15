---
name: create-web
description: HTML 网页制品工作流（工具 create_web）。用户说「网页」「HTML」「离线图表页」「交互页面」「做个网页」「create_web」「可交互图表页」「/create-web」时使用。用 create_web 交付单入口 index.html，脚本只许 /opptrix-vendor，禁止外网 CDN。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.1"
  required-packs: artifacts
allowed-tools: create_web update_web read_web list_web_vendor
---

# HTML 网页 / 离线交互页

## 何时使用

用户要一份**可在预览里打开的 HTML 网页**（交互图表、筛选器、多页签离线页），而不是 TSX 画布报告，也不是聊天正文里的 chart 围栏。

## 与画布 / 围栏的分工

| 形态 | 何时用 |
|------|--------|
| 正文 chart 围栏 | 聊天内插图，无需本技能 |
| `create_canvas`（`` `@skill:create-canvas` ``） | 机构风投研画布 / 一页式报告（TSX + `@opptrix/canvas`） |
| `create_web`（本技能） | 浏览器 HTML + 本地钉版本库的交互页 |

## 步骤

1. **确认需求**：交互、自选图表库、或用户明确要 HTML/网页时走本技能；纯报告排版优先画布。
2. **查可用库**：需要图表等脚本前先 `list_web_vendor`，按返回的 `hrefPrefix` / 文件路径引用。
3. **创建网页**：激活后直接调 `create_web`——**单入口** `index.html`，可选同目录相对路径 css/js（`files=[{path,content}]`）。资源一律相对路径，勿写绝对本机路径。
4. **脚本与样式来源**：只许 `/opptrix-vendor/<lib>/...`（与 `list_web_vendor` 清单一致）；**禁止** jsDelivr、unpkg、cdnjs 等外网 CDN，禁止远程字体/追踪脚本。
5. **更新**：已有网页先 `read_web`，再 `update_web`。
6. **内容边界**：展示事实与结构化结论；**不给出**买卖建议；数据缺口写明。

## 禁止

- 外网 CDN / 远程脚本 / 远程样式
- 用 `workspace_write` 冒充网页制品
- 把画布报告需求误做成 HTML（应转 `` `@skill:create-canvas` ``）
- 荐股或编造数据

## 交付提示

创建成功后引导用户在附件/右侧预览打开网页；相对资源由会话附件 `web/*` 与 `/opptrix-vendor` 提供。
