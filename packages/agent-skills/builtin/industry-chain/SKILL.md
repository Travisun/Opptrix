---
name: industry-chain
description: 产业链透视工作流技能。用户说「产业链」「上下游」「行业透视」「梳理半导体产业链」「新能源车产业链」时使用。读取内置产业链知识库，匹配节点并补全代表公司，输出结构化 JSON 与 Mermaid 图。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
references:
  - references/chain-knowledge.json
---

# 产业链透视

## 何时使用

用户要对某**行业/主题**做产业链上下游梳理（不是单股深度分析，也不是单纯板块成分列表）。

## 步骤

1. **读取知识库**：用 `get_agent_skill_file(skill_name="industry-chain", path="references/chain-knowledge.json")` 读取内置产业链知识库（JSON）。
2. **匹配行业**：在知识库中按 key 包含或 `concepts`/`keywords` 命中找到最匹配的产业链条目；未命中时说明并停止。
3. **梳理节点**：从条目的 `nodes` 提取上中下游节点（position / desc / bottleneck / domestic_rate 等）。
4. **补全代表公司（可选）**：用 `get_sector_list` 找相关板块/行业目录，再用 `get_sector_constituents` 取成分股；或用 `search_instruments` 按节点关键词搜代表公司。勿编造未返回的公司。
5. **输出 JSON**：按下方 Schema 输出，含产业链概览、Mermaid 图、关键节点与代表公司。

## 输出 JSON Schema

```json
{
  "industry": "string — 行业名称，如「半导体」",
  "summary": "string — 产业链一句话概述",
  "chain_overview": "string — 上中下游结构简述",
  "mermaid": "string — Mermaid mindmap 源码，展示产业链结构",
  "key_companies": ["string — 关键代表公司（来自知识库或工具返回）"],
  "companies": [
    {
      "name": "string — 公司名",
      "code": "string — 代码",
      "position": "string — 所处节点"
    }
  ],
  "chain_nodes": [
    {
      "position": "string — 节点位置",
      "desc": "string — 节点描述",
      "bottleneck": "boolean — 是否卡脖子环节",
      "domestic_rate": "string — 国产化率"
    }
  ],
  "notes": ["string — 免事项：知识库未覆盖、公司数据缺口等"]
}
```

## 注意

- 产业链梳理以**知识库事实**为主，公司列表须来自工具返回，禁止编造。
- 知识库未覆盖该行业时在 `notes` 说明，勿强行套用相邻条目。
- 与板块成分列表区分：本技能聚焦上下游叙事与卡脖子环节，不是单纯成分股罗列。
