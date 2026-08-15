---
name: create-web
description: 投研 HTML 报告默认载体（工具 create_web）。用户说「网页」「HTML」「报告页」「离线图表页」「交互页面」「做个网页」「create_web」「/create-web」时使用；投研技能默认也经本路径交付。用 create_web 交付单入口 index.html，脚本只许 /opptrix-vendor，禁止外网 CDN。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 网页报告
  summary: 可预览的投研 HTML 报告页
  category: deliverable
  slash-rank: "200"
  default-deliverable: web
  required-packs: artifacts
allowed-tools: create_web update_web read_web list_web_vendor
---

# 投研 HTML 报告（默认交付载体）

## 何时使用

- 用户要**可预览的 HTML 网页/报告页**（交互图表、筛选器、多章节离线页）
- **投研工作流默认交付物**：早报、收盘、尽调、财报、信号、产业链、ETF、组合、回测、策略报告等，除非用户点名画布或脑图，否则走本技能路径（`create_web`）

不是 TSX 画布，也不是聊天正文 chart 围栏。

## 与画布 / 脑图 / 围栏的分工

| 形态 | 何时用 |
|------|--------|
| **`create_web`（本技能，默认）** | 投研 HTML 报告页、可预览离线页、本地 vendor 图表 |
| `create_canvas`（`@skill:create-canvas`） | 用户明确要「画布 / 一页式机构报告」 |
| `create_mindmap`（`@skill:create-mindmap`） | 用户只要「结构图 / 脑图」 |
| 正文 chart 围栏 | 聊天内插一张小图，无需本技能 |

## 投研报告页最低结构（建议）

1. 标题与时效 / 数据截止说明  
2. 问题与分析框架（可选短段）  
3. 证据与数据章节（表/图）  
4. 交叉验证结论（**事实 / 推断分栏**）  
5. 风险与缺口  
6. 免责声明（无荐股）

## 步骤

1. **确认需求**：投研交付默认网页；用户点名画布/脑图则转对应技能。
2. **查可用库**：需要图表等脚本前先 `list_web_vendor`，按返回的 `hrefPrefix` / 文件路径引用。
3. **创建网页**：`create_web`——**单入口** `index.html`，可选同目录相对路径 css/js（`files=[{path,content}]`）。资源一律相对路径。
4. **脚本与样式**：只许 `/opptrix-vendor/<lib>/...`；**禁止** jsDelivr、unpkg、cdnjs 等外网 CDN，禁止远程字体/追踪脚本。
5. **更新**：已有网页先 `read_web`，再 `update_web`。
6. **内容边界**：展示事实与结构化结论；**不给出**买卖建议；数据缺口写明。

## 禁止

- 外网 CDN / 远程脚本 / 远程样式  
- 用 `workspace_write` 冒充网页制品  
- 把用户明确要的画布需求误做成 HTML（应转 `@skill:create-canvas`）  
- 荐股或编造数据

## 交付提示

创建成功后引导用户在附件/右侧预览打开网页；相对资源由会话附件 `web/*` 与 `/opptrix-vendor` 提供。用户应感到「拿到了一份可打开的报告」。
