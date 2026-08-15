---
name: ipo-note
description: 新股笔记工作流。用户说「新股」「IPO」「招股书」「上市笔记」「/ipo-note」时使用。assumption-only：招股结构化弱则诚实降级。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 新股笔记
  summary: 新股/招股假设框架笔记
  category: event
  slash-rank: "345"
  default-deliverable: web
  required-packs: fundamentals news browser artifacts
allowed-tools: search_instruments get_instrument_profile get_instrument_financials get_instrument_notices get_notice_content list_news_articles browser_navigate browser_snapshot ask_user create_web update_web read_web list_web_vendor
---

# 新股笔记

## 何时使用

用户要做**IPO/新股招股要点笔记**。边界：首次覆盖长文用 `@skill:coverage-initiation`；上市后全面尽调用 `@skill:equity-deep-dive`。本技能聚焦**招股/发行材料要点与缺口诚实声明**，不是覆盖报告或日常尽调。

**完整度**：`assumption-only`。招股说明书结构化字段往往很弱；缺章节须诚实写缺口，禁止拼凑「标准招股摘要」。

## 分析架构（投研方法）

- **问题/假设**：业务、募资用途、风险因素与可比叙事是什么？
- **证据清单**：概况/财务（若已有）、公告、browser 招股页
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的 | `search_instruments` / `ask_user` | 先确认 |
| 概况财务 | `get_instrument_profile` / `get_instrument_financials` | 标明上市前数据受限 |
| 公告 | `get_instrument_notices` / `get_notice_content` | browser |
| 招股页 | `browser_navigate` / `browser_snapshot` | 仅用可得碎片并标缺口 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认代码/公司**与材料来源。
2. **抽取要点**；结构化弱则 **assumption-only 横幅**。
3. **风险因素**单独成章；交付网页。

## 网页报告建议目录

1. 能力/完整性声明（assumption-only）
2. 发行与公司要点
3. 财务与募资（若有）
4. 风险因素
5. 事实 / 假设 / 推断
6. 免责声明（非打新建议）

## 禁止

- 编造招股章节或「机构配售必赚」
- 打新荐股；**禁止无交付就结束**
