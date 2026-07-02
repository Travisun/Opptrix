# 数据源示例

### 本地因子库（`.opmd` 样例）

仓库根下 [a-share-market-2026-06-30.opmd](./a-share-market-2026-06-30.opmd) 为 **基础数据包** 示例，可在 **设置 → 基础数据** 中导入，用于体验本地因子筛选（无需先全量同步）。

```bash
# 导入路径：设置 → 基础数据 → 导入数据包 → 选择该 .opmd 文件
```

`.opmd` 为 Opptrix 专用格式，不是 SQLite 明文文件。

## 默认（免费）在线源

不配置任何 Token 时，`AshareEngine` 会在多个 driver 间自动回退，例如：

- 东财、efinance、TDX、腾讯、新浪、同花顺等

适用于：实时/历史行情、部分 F10、公告等。免费接口可能延迟或限流，请勿作为唯一交易依据。

相关实现：`packages/a-stock-layer/src/drivers/`。

## Tushare Pro（可选）

部分能力在配置 Token 后会优先或补充使用 Tushare。需自行在 [tushare.pro](https://tushare.pro) 注册并遵守其许可。

### 配置方式（任选其一）

1. **设置页**：设置 → 基础数据 → Tushare  
2. **环境变量**：`.env` 中 `TUSHARE_TOKEN=你的token`  
3. **JSON 文件**：复制 [tushare.example.json](./tushare.example.json) 到用户数据目录：

   ```bash
   cp example/data-sources/tushare.example.json ~/.opptrix/tushare-config.json
   # 编辑 enabled 与 token 后重启服务
   ```

### 本地因子库

全市场因子筛选、决策雷达等依赖 **本地 SQLite 因子库**（`market-data` 包）。  
在 **设置 → 基础数据** 中触发同步，与 Tushare 配置相互独立。
