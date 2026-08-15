---
name: equity-deep-dive
description: 个股深度分析工作流。适用于用户要求「深度分析」「全面研究」「帮我看看这只股票怎么样」、个股尽调或多维度解读时。按步骤收集快照、基本面、资金与资讯证据后给出结构化结论。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
allowed-tools: create_canvas create_web get_instrument_profile get_instrument_financials get_instrument_money_flow get_instrument_chart
---

# 个股深度分析

## 何时使用

用户要对**单只股票/标的**做较完整的投研解读（非只要现价）。

## 步骤

1. **确认标的**：用搜索工具定位 `instrument`；若有多候选，用选择题请用户确认。
2. **取数与制品**：激活本技能时已按 `allowed-tools` 挂上相关工具包（含画布/网页与基本面等）；本轮可直接调用，无需再手动激活工具包。若仍缺能力，再列出工具包并补充激活。
3. **快照与行情**：拉取标的快照与最新行情，记下价格、涨跌与关键状态。
4. **基本面**：视市场拉取概况、财务与关键披露；数据缺失时明确说明缺口。
5. **补充维度（按需）**：资金流向、机构观点、近期公告/资讯摘要；勿编造未返回的数字。
6. **结构化输出**：
   - 事实摘要（带时效）
   - 推断与假设（分开写）
   - 风险与不确定性
   - 适合时可用画布或网页交付多章节图文（`create_canvas` / `create_web`）；完整流程见 `` `@skill:create-canvas` `` / `` `@skill:create-web` ``
   - **不给出**买卖建议、目标价或仓位建议

## 注意

- 系统底线优先：禁止荐股与编造数据。
- 降级或本地兜底数据须标注可信度受限。
