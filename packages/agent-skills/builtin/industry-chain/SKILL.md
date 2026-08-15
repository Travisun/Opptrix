---
name: industry-chain
description: 产业链透视工作流。用户说「产业链」「上下游」「行业透视」「梳理半导体产业链」「新能源车产业链」时使用。读取内置知识库并补全代表公司；默认用 create_web 交付可预览 HTML 产业链报告（用户只要结构图才用 create_mindmap）。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 产业链
  summary: 上下游节点与代表公司一页梳理
  category: equity
  slash-rank: "70"
  default-deliverable: web
  required-packs: industry artifacts
allowed-tools: get_sector_list get_sector_constituents get_agent_skill_file create_web update_web read_web list_web_vendor create_canvas create_mindmap
references:
  - references/chain-knowledge.json
---

# 产业链透视

## 何时使用

用户要对某**行业/主题**做产业链上下游梳理（不是单股深度分析，也不是单纯板块成分列表）。默认交付**可预览网页报告**。

## 分析架构（投研方法）

- **问题/假设**：该主题的价值如何在上中下游分配？哪些环节是瓶颈/国产化关键点？
- **证据清单**：内置知识库节点、板块目录与成分、代表公司代码（工具返回）
- **多维交叉验证**：知识库节点 vs 板块成分是否可映射；「卡脖子」标签须有知识库字段支撑
- **结论与不确定**：结构叙事 + 关键节点；知识库未覆盖则停止硬套
- **风险与缺口**：知识库未收录、成分接口失败
- **事实与推断必须分开**：知识库字段与工具返回公司为事实；竞争格局判断为推断

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 知识库 | `get_agent_skill_file(skill_name="industry-chain", path="references/chain-knowledge.json")` | 未命中则说明并停止 |
| 行业匹配 | key / concepts / keywords | 勿套用相邻行业 |
| 节点属性 | nodes：position / desc / bottleneck / domestic_rate | 缺字段则留空 |
| 代表公司 | `get_sector_list` → `get_sector_constituents` 或 `search_instruments` | 不编造公司 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认行业/主题关键词**。
2. **读取知识库并匹配**；未命中说明并停止。
3. **梳理节点**；按需补全代表公司（禁止编造）。
4. **交付网页（默认）**：`list_web_vendor` → `create_web`（上中下游章节 + 公司表；可用简单示意图）。已有则 `read_web` / `update_web`。
5. **备选**：用户只要「结构图/脑图」用 `create_mindmap`；点名画布用 `create_canvas`。

## 网页报告建议目录

1. 行业与一句话概述  
2. 上中下游结构说明  
3. 关键节点表（瓶颈、国产化等可得字段）  
4. 代表公司列表（代码来源注明）  
5. 观察焦点（推断标注）  
6. 数据说明：知识库覆盖范围与缺口

## 禁止

- 编造公司或节点数据  
- 知识库未覆盖时强行套相邻条目  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
