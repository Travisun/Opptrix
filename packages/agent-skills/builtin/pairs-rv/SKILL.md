---
name: pairs-rv
description: 配对/价差相对价值工作流。用户说「配对交易」「价差」「相对价值」「pairs」「协整」「/pairs-rv」时使用。assumption-only：双侧行情对照 + 沙盒价差；无原生协整库。默认 create_web 交付。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 配对价差
  summary: 双边价差与相对价值假设框架
  category: quant
  slash-rank: "275"
  default-deliverable: web
  required-packs: market workspace artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart get_instrument_quotes ask_user opptrix_run workspace_write create_web update_web read_web list_web_vendor
---

# 配对价差（相对价值）

## 何时使用

用户要研究**两只（或一组）标的的价差/比值相对价值**，而非单边趋势或组合因子暴露。边界：组合行业/风格暴露用 `@skill:factor-exposure`；本技能做**双侧价差/比值框架**（assumption-only，无原生协整库）。

**完整度**：`assumption-only`。本地**无原生协整/Johansen 库**；不得假装已做严格统计协整检验，除非用户自备脚本且结果可复核。

## 分析架构（投研方法）

- **问题/假设**：价差是否偏离历史区间？偏离是否可由基本面解释？
- **证据清单**：双侧快照与图表、沙盒计算的价差序列
- **多维交叉验证**：价格比 vs 价差；短期冲击 vs 中期区间
- **结论与不确定**：均值回归仅为假设；无协整证明不得写成「已协整」
- **事实 | 假设 | 推断** 分栏

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 配对确认 | `search_instruments` / `ask_user` | 先确认双侧代码 |
| 双侧行情 | `get_instrument_snapshot` / `get_instrument_quotes` | 标明缺失侧 |
| 双侧图表 | `get_instrument_chart`（两侧都要） | 仅文字描述，勿画假图 |
| 价差序列 | `opptrix_run`（可 `workspace_write`） | 用离散点手工表并标假设 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |

## 步骤

1. **确认配对**与价差定义（价差 / 比值 / 对数比）。
2. **拉取双侧**快照与 chart（报告须有双侧图或明确缺失）。
3. **沙盒价差**：`opptrix_run` 计算；**声明无原生协整库**。
4. **区间与偏离**：历史分位仅为描述统计，不作交易信号承诺。
5. **交付网页（默认）**：双侧图 + 价差图；见 `@skill:create-web`。

## 网页报告建议目录

1. 配对定义、假设与能力声明（无原生协整库）
2. 双侧行情卡片
3. 双侧价格/结构图
4. 价差或比值序列与描述统计
5. 事实 / 假设 / 推断分栏
6. 风险与缺口
7. 免责声明（无开平仓建议）

## 禁止

- 荐股或「开多A空B」指令
- 编造协整 p 值或假装调用了专业协整库
- 只分析单边却自称配对研究
- **禁止无交付就结束**
