# cn-offline-daily-k

## 目的

在 **公共复用区**（`root_id=shared`）部署 / 更新 A 股约十年日 K（扶摇 Parquet），并提供查询与筛选 API。**不写 App 主行情库**，不调用 `importDailyKDump` / market sync。

## 入口

| 模块 | 路径 | 用途 |
|------|------|------|
| 部署约定 | `src/deploy.js` | 决定 full/incr、读写元数据、状态摘要 |
| 查询 | `src/query.js` | 个股日 K、交易日、截面、覆盖 |
| 筛选 | `src/screen.js` | 均线/分位/波动/放量/回撤；板块强弱/宽度/龙头 |
| 汇总导出 | `src/index.js` | 统一 re-export |

Agent 侧典型流程：

1. `prepare_fuyao_dump({ dump_kind: "full"|"incremental" })`（服务端持 Key 落盘；**成功会自动写** `data/cache/offline-k-meta.json`）
2. （可选）本包 `markUpdateSuccess(...)` 仅作手动补写
3. full/incr 成功后补算全市场指标并写入 `data/cache/indicators/`
4. `shell_run` + 本包 `query` / `screen` 做挖掘（优先读已落盘指标）

## 入参 / 出参

### 路径约定（相对 shared 根）

| 路径 | 说明 |
|------|------|
| `data/dumps/cn-daily-k-full.parquet` | 全量（≈10y） |
| `data/dumps/cn-daily-k-incr.parquet` | 增量（≈10d） |
| `data/cache/offline-k-meta.json` | **唯一**「上次成功更新」元数据 |
| `data/cache/indicators/` | 本地技术指标缓存（按标的或指标族 Parquet/JSON；full/incr 后由 Agent 补算，非本包内置引擎） |

### `decideDumpKind(meta, now?)`

- 无元数据 / 无 `lastSuccessAt` → `full`
- 距上次成功 **> 10 日** → `full`
- 否则 → `incremental`

### `prepare_fuyao_dump` 映射

| dump_kind | 含义 |
|-----------|------|
| `full` | 十年日 K |
| `incremental` | 近 10 日 |

## 依赖

- Node ≥ 18（ESM）
- 读 Parquet：可选 `hyparquet`（`shell_install` 安装到沙盒）；未安装时可用已解析的行数组走 query/screen

```bash
# 沙盒示例
shell_install({ manager: "npm", packages: ["hyparquet"] })
```

## 最小示例

```js
import {
  decideDumpKind,
  readMeta,
  markUpdateSuccess,
  getDeployStatus,
  getDailyBars,
  screenByMaTrend,
} from './src/index.js'

const meta = await readMeta('/path/to/shared/data/cache/offline-k-meta.json')
const kind = decideDumpKind(meta) // 'full' | 'incremental'

// Agent 工具：prepare_fuyao_dump({ dump_kind: kind })
// full|incremental + local_path 成功后服务端已自动写 meta；以下仅作手动补写示例：
await markUpdateSuccess('/path/to/shared/data/cache/offline-k-meta.json', {
  dumpKind: kind,
  fullPath: 'data/dumps/cn-daily-k-full.parquet',
  incrPath: 'data/dumps/cn-daily-k-incr.parquet',
})

const status = await getDeployStatus({
  metaPath: '.../offline-k-meta.json',
  dumpsDir: '.../data/dumps',
})
```

## 注意

- **勿存密钥**：禁止 API Key / Token 写入本目录或代码
- **勿写主库**：禁止引导 sync / `importDailyKDump` / 写入 App SQLite 行情库
- 元数据只写 `shared/data/cache/offline-k-meta.json`
- 本目录是 **仓库内置模板**；初始化 shared 时会自动落到 `packages/cn-offline-daily-k/`
