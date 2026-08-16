---
name: cn-momentum-construct
description: A股动量因子构造（振幅切割）。用户说「A股动量」「振幅切割动量」「开源动量」「/cn-momentum-construct」时使用。按日振幅分割涨跌幅，低振幅日收益加总为动量 A。默认 create_web。勿与 lean-returns-momentum 合并。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: A股动量构造
  summary: 振幅切割的 A 股动量/反转因子
  category: quant
  slash-rank: "513"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_chart batch_instrument_snapshots get_index_constituents ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
references:
  - scripts/cn_momentum_construct.py
  - scripts/fixtures/sample_input.json
---

# A股动量因子构造

方法溯源 **开源证券《A股市场中如何构造动量因子》**：在长窗口内按**日振幅**切割涨跌幅——低振幅日收益加总为 **A（动量）**，高振幅为 **B（偏反转）**。

## 何时使用

用户要构造/比较 A 股**振幅切割动量**，而非简单 N 日涨跌幅。默认网页。

边界：简单收益动量用 `@skill:lean-returns-momentum`（**勿合并**）；因子检验用 `@skill:factor-research`。

## 取数与运行

1. 确认宇宙；窗口默认 N=120，λ=0.3。
2. 写入日 K `bars`（high/low/close）。
3. 运行：

```bash
python scripts/cn_momentum_construct.py --input data.json --output result.json
```

4. `create_web`。

### 参数

- `params.window` / `params.N`：主窗口（默认 120）  
- `params.lambda`：低振幅占比（默认 0.3）  
- `params.windows`：可选多窗口列表，如 `[60,120,180]`

### 输出

- `signal`：按 A 因子降序 ranking（含 `A_N` / `B_N`）  
- `series`：各窗口 A/B 截面

## 依赖

仅标准库。

## 禁止

- 与 `lean-returns-momentum` 混名冒充；荐股；无 web 结束
