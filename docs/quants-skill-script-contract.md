# Quants Skill 脚本契约（定稿）

> 适用于由 QuantsPlaybook 映射而来的 Opptrix Agent Skills（见 [`quants-playbook-skill-map.md`](./quants-playbook-skill-map.md)）。  
> 目标：每个 skill 可在 Agent 沙盒中**自包含**跑通「取数 → 写 workspace → 跑脚本 → 读结果」，不引入仓库级量化公共包。

## 1. 脚本存放

- 脚本**仅**存在于各 skill 目录下的 `scripts/`（例如 `packages/agent-skills/builtin/<skill-name>/scripts/`）。
- **禁止**新建或依赖仓库级共享 quant 包（如 `packages/quants-*`、跨 skill 的公共 `hugos_toolkit` 安装依赖）。
- 若多 skill 需要相同工具函数：允许**复制**小段纯函数到各自 `scripts/`（接受有限重复）；或把可复用逻辑放进**同一 skill** 的 `scripts/_lib.py`（不跨 skill import）。

## 2. 端到端数据流

```
Agent 用 Opptrix 工具取数
  → workspace_write 写入 JSON（OHLCV / 财务 / 成分 等）
  → opptrix_run 执行本 skill 的 scripts/*.py
  → stdout JSON（signal / series / metrics）
  → 可选再 workspace_write 产物文件
  → create_web 等交付（默认 web）
```

要点：

1. **脚本不联网取数**：禁止在脚本内调用 jqdata / tushare / qlib / 任意 HTTP 行情 API。
2. **Agent 负责取数与写盘**：用现有工具（如 `get_instrument_chart`、`batch_instrument_snapshots`、成分/财务类工具等）拿到数据后 `workspace_write`。
3. **脚本只做计算**：读 `--input`，写 `--output` / stdout。

## 3. CLI 约定

```bash
python scripts/xxx.py --input data.json --output result.json
```

| 参数 | 含义 |
|------|------|
| `--input` | workspace 中的输入 JSON 路径（或绝对路径） |
| `--output` | 结果 JSON 路径；若省略，仍须向 **stdout** 打印同一结果对象 |

退出码：`0` 成功；非 `0` 失败（stderr 可写简短错误，勿打印密钥）。

## 4. 输入 JSON（最小约定）

建议顶层结构（字段可扩展，但须向后兼容多加字段）：

```json
{
  "meta": {
    "skill": "rsrs-timing",
    "asof": "2026-08-16",
    "universe": ["000300.SH"]
  },
  "bars": [
    {
      "symbol": "000300.SH",
      "date": "2024-01-02",
      "open": 0,
      "high": 0,
      "low": 0,
      "close": 0,
      "volume": 0,
      "amount": 0
    }
  ],
  "panels": {},
  "params": {}
}
```

- `bars`：最常见的 OHLCV 长表；多标的用 `symbol` 区分。
- `panels`：截面因子、财务、持仓等非 OHLCV 数据。
- `params`：窗口、阈值等算法参数。

## 5. 输出 JSON（最小约定）

```json
{
  "ok": true,
  "skill": "rsrs-timing",
  "signal": [{"date": "2024-01-02", "value": 1}],
  "series": {},
  "metrics": {},
  "assumptions": [],
  "errors": []
}
```

| 字段 | 说明 |
|------|------|
| `signal` | 主交易/状态信号时间序列或最新截面 |
| `series` | 中间序列（如 RSRS、zscore） |
| `metrics` | 摘要指标（IC、胜率示意等；须标注是否为假设样本） |
| `assumptions` | 数据降级、代理变量等诚实声明 |
| `errors` | 可恢复告警；致命错误用非 0 退出 |

可选：脚本额外写入 workspace 文件（如 `figures/` 描述、CSV），但**主结果必须以 JSON** 给出。

## 5.1 数据自适应 / `data_mode`（硬性）

脚本必须按**实际输入**选择计算路径，**禁止**无条件写死降级。

| `meta.data_mode` | 含义 | `meta.degraded` |
|------------------|------|-----------------|
| `full` | 已具备完整算法所需字段（如 `panels.options`、分钟 bars、EMD 结果等） | **必须** `false` |
| `proxy` | 缺少完整字段，走了代理/近似算法，且结果仍有信息量 | **必须** `true` |
| `insufficient` | 连代理也无法诚实计算 | 配合 `ok: false` + `errors`；勿假装算完 |

约定：`degraded` **必须等于** `data_mode == "proxy"`。

最小 `meta` 形状：

```json
"meta": {
  "data_mode": "full",
  "degraded": false,
  "used_inputs": ["bars.daily", "panels.options"],
  "missing_for_full": []
}
```

规则：

1. **有完整数据 → full**：探测 `panels.*` / bars 频率 / 专用字段；即便今日无 Provider，脚本也须认键名，日后 Agent 写入即可自动 `full`。
2. **仅缺完整字段才 proxy**：写清 `used_inputs` 与 `missing_for_full`；`assumptions` 说明代理含义。
3. **完全无法计算 → `ok: false`**：用 `errors` 说明缺什么；**不要**算完再永久 `degraded: true`。
4. Fixture 多为 proxy 档：允许 `degraded: true`，但必须是**检测出来的**，不是字面量写死。

## 6. 依赖策略

| 层级 | 规则 |
|------|------|
| **默认** | **仅 Python 标准库** |
| **禁止** | `jqdata` / `jqdatasdk` / `tushare` / `qlib` / `akshare` 等数据源 SDK；禁止脚本内 `requests` 拉行情 |
| **可选** | `numpy` / `pandas`：**仅当** SKILL.md 明确写「需沙盒已装 numpy/pandas」；核心算法仍应尽量纯 Python，以便降级 |
| **重型** | `talib`、`PyEMD`、`torch`、`sklearn` 等：须在 SKILL 标明，并提供**无该依赖的降级路径**或标为 P3/assumption-only |

## 7. 附件限制（skill 包体）

与 Agent Skills 附件约束对齐：

- 单文件 ≤ **200KB**
- 单 skill 附件总数 ≤ **16** 文件（含 `scripts/`、`references/`、`assets/` 等）

超限则拆 skill、删参考大文件，或改为外链说明（勿把整本 notebook 塞进 skill）。

## 8. SKILL.md 应写明的运行段落（模板要点）

1. 何时使用 / 非目标  
2. 取数步骤（Opptrix 工具列表，用户可见文案勿暴露内部包名）  
3. `workspace_write` 输入 schema  
4. `opptrix_run`：`python scripts/….py --input … --output …`  
5. 如何解读 `signal` / `metrics`  
6. 依赖与数据自适应（`data_mode` / 何时 full vs proxy）  
7. 与易混 `lean-*` 的边界（不合并）  
8. 默认 `create_web` 交付  

## 9. 反模式

- ❌ 脚本 `import jqdatasdk` / `import tushare` / `import qlib`
- ❌ 在 monorepo 建共享 `quant_core` 给所有 QP skill 用
- ❌ 只输出图、不输出 JSON
- ❌ 把整份 `.ipynb` 当作可执行契约
- ❌ 与 `lean-*` 技能合并或互相改名冒充
- ❌ 无条件 `meta.degraded=True`（或写死 `data_mode: "proxy"` 而不探测输入）

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-08-16 | 定稿：stdlib 优先、workspace JSON、CLI、附件上限 |
| 2026-08-16 | 新增 §5.1 数据自适应 / `data_mode`；反模式禁止无条件 degraded |
