---
name: lean-framework-pipeline
description: LEAN 启发的算法框架流水线导航。用户说「LEAN 框架」「算法流水线」「Alpha/PCM/Risk」「framework pipeline」「/lean-framework-pipeline」时使用。方法溯源 QuantConnect LEAN Algorithm Framework 分层；只做路由与 Must-skip，不假装执行引擎。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN框架流水线
  summary: LEAN分层映射（默认CN）与技能路由
  category: quant
  slash-rank: "445"
  default-deliverable: web
  required-packs: artifacts
allowed-tools: ask_user create_web update_web read_web list_web_vendor
---

# LEAN 框架流水线

方法溯源 **QuantConnect LEAN Algorithm Framework**（Universe → Alpha → Portfolio Construction → Risk Management → Execution）。本技能是**分层导航与路由图**，**禁止假装跑完整 LEAN 引擎**，也**禁止在本技能内模拟 Execution 成交**。

## 何时使用

用户想理解「LEAN 式流水线各层做什么」（**默认 CN / A股与场内 ETF**）或要把问题路由到对应 `lean-*` 技能（LEAN 方法溯源，非美股原版照搬）。

边界：具体指标用 `@skill:lean-indicator-playbook`；均线/RSI/动量用 `@skill:lean-ma-cross-trend` / `@skill:lean-rsi-reversion` / `@skill:lean-returns-momentum`；组合权重用 `@skill:lean-equal-weight-pcm` / `@skill:lean-mean-variance` / `@skill:lean-risk-parity`；回撤规则用 `@skill:lean-drawdown-risk`；通用宇宙筛选用 `@skill:universe-screen`。本技能只做导航，不在本层硬算信号或权重。默认交付网页路由图。

## A股适配（默认）

- 导航图须注明：**默认 CN 适配层**（Universe/Alpha/PCM/Risk 路由到的 lean-* 均按 A股微观结构解读）。
- Execution 仍 Must-skip；且 A股还有涨跌停、T+1、融券限制，不得按美股可自由做空假设路由「多空执行」。
- 用户点名美股策略时再声明切换。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：用户目标落在 Framework 哪一层？应激活哪条 lean-*？
- **证据清单**：用户意图描述（事实输入）、层映射表（方法假设）、推荐技能路径（推断）
- **多维交叉验证**：一层一事；禁止把 Exec 层当成可交易建议
- **结论与不确定**：平台能力 ≠ LEAN Runtime 对等
- **风险与缺口**：意图模糊时先 ask_user
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## Exec 层 Must-skip（硬性）

| 层 | 含义 | 本平台映射 | 动作 |
|----|------|------------|------|
| Universe | 选股宇宙 | `@skill:lean-ema-cross-universe` / `@skill:universe-screen` | 可路由 |
| Alpha | 信号/洞察 | `@skill:lean-indicator-playbook` / `@skill:lean-ma-cross-trend` / `@skill:lean-rsi-reversion` / `@skill:lean-returns-momentum` / `@skill:lean-etf-ibs-reversion` / `@skill:instrument-signals` | 可路由 |
| Portfolio Construction | 组合权重 | `@skill:lean-equal-weight-pcm` / `@skill:lean-mean-variance` / `@skill:lean-risk-parity` / `@skill:lean-etf-global-rotation` | 可路由 |
| Risk | 风控 | `@skill:lean-drawdown-risk` / `@skill:stress-test` | 可路由 |
| **Execution** | 下单/成交/滑点撮合 | **无对等「实盘执行」技能** | **Must-skip**：只说明跳过原因；可指向 `@skill:execution-cost`（成本估算）或 `@skill:rebalance`（方案差额，非下单） |

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 用户目标 | 对话 / `ask_user` | 先澄清层 |
| 层映射 | 本技能内置表 | — |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| 默认CN适配层 | 路由至各 lean-* 的 CN 专节 | — |


> 本技能**不**拉行情；需要数据时路由到对应 lean-*。

## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **澄清用户目标**属于哪一层（或跨层）。
3. **声明非 LEAN Runtime**；标明 Execution **Must-skip**。
4. **输出路由表**：层 → `@skill:…` 与一句话何时用。
5. **若用户已选定层**：建议下一轮激活对应技能（本会话不越权硬算，除非用户只要导航页）。
6. **默认 `create_web`** 交付流水线导航页。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 本平台映射表（含 Exec Must-skip）  
3. 针对本次意图的推荐路径  
4. 各 lean-* 技能速查  
5. 事实 / 假设 / 推断（意图 vs 映射）  
6. 局限：平台 ≠ LEAN 对等实现  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（导航≠交易系统；无荐股）

## 禁止

- **禁止假装跑完整 LEAN 引擎**或输出伪 LEAN 日志  
- **禁止在 Exec 层给出下单/成交模拟当作事实**  
- 在本技能内替代专项技能做完整信号/优化计算（应路由）  
- 荐股  
- **禁止无交付就结束**（默认 web）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
