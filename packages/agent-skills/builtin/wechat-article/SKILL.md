---
name: wechat-article
description: 公众号三 Agent 成稿。用户说「公众号文章」「写一篇长文」「作者编辑读者」「可发布中文」「/wechat-article」时使用。作者→编辑→读者协作产出可发布中文长文；非投研决策主路径。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 公众号三Agent成稿
  summary: 作者写、编辑修、读者审，交付可发布中文长文
  category: deliverable
  slash-rank: "205"
  default-deliverable: web
  required-packs: news fundamentals artifacts workspace
allowed-tools: ask_user list_news_articles get_news_article get_instrument_notices get_notice_content http_fetch browser_navigate search_instruments get_instrument_financials run_subagent list_subagents reclaim_subagent activate_agent_skill opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 公众号三 Agent 成稿

> 署名：**Opptrix · AI Berkshire 分析**（内容向；非买卖建议）

## 何时使用 / 边界

| 使用 | 不要用本技能 |
|------|----------------|
| 主题明确，要一篇可发布中文公众号长文 | 多篇《看懂 XX》系列 → `@skill:deep-company-series` |
| 需要作者/编辑/读者三角色强制外部视角 | 财报团队成稿 → `@skill:earnings-team` |
| | 投研决策备忘版式 → `@skill:investment-memo-craft` |

## 定位确认（`ask_user`）

| 维度 | 默认 |
|------|------|
| 目标读者 | 有点背景但非该领域专家 |
| 深度 | 中深度 |
| 长度 | 3000–4000 字 |
| 风格 | 对话式（写给聪明的朋友） |

## 流程

### 阶段 1：研究素材

并行 `run_subagent`（2–3 个）：核心内容 / 行业应用 /（可选）对比脉络。工具：`list_news_articles`、`http_fetch`、`browser_navigate`；涉财务数字走 `@skill:financial-data` 验算。整理：核心论点一句、3–5 数据点、大纲 6–8 节 → `workspace_write`。

### 阶段 2：作者初稿

`run_subagent` 作者角色：纯中文、强钩子开头、公式须大白话、不用 emoji、段不过长。初稿写入 workspace。

### 阶段 3：编辑 + 读者并行

同轮两个 `run_subagent`：

- **编辑**：标题/开头/结构/节奏/结尾传播力；给「原文→建议」对照。  
- **读者**：按目标画像答「前 3 段是否继续」「何处看不懂」「会否转发」。

双方都指出的问题必须改；矛盾时偏向读者体验。

### 阶段 4：定稿交付

综合修改 → `create_web`（长文可读排版）。文末可附资料链接。配图：若环境无法可靠提取论文高清图，诚实说明并用文字/表格替代，**禁止**假称已插入高清原图。

## 写作红线

1. 不虚构数据；搜不到标估计并降级。  
2. 禁止套话腔（「让我们一起来看看」等）。  
3. 不过度承诺「颠覆/革命」。  
4. 涉财务关键数字须可追溯来源。  
5. 结尾须有一句可传播的判断（非荐股口号）。

## 网页目录

1. 标题与读者定位  
2. 正文（定稿）  
3. 编辑/读者关键改动摘要（可折叠短节）  
4. 来源与缺口  
5. 免责声明

## 禁止

- 把本技能当深度买卖决策主路径  
- 用训练知识冒充已检索原文  
- 无交付结束
