# 数据源示例

### 市场数据包（`.opmd` 样例）

仓库根下 [a-share-market-2026-06-30.opmd](./a-share-market-2026-06-30.opmd) 为 Opptrix **市场数据包** 格式示例（向后兼容保留）。本地因子选股已移除；日常行情请走在线数据源。

`.opmd` 为 Opptrix 专用格式，不是 SQLite 明文文件。

## 默认在线源

不配置 Token 时，内置栈在多个 driver 间自动回退，例如：

- tickflow、zzshare、baostock 等

适用于：实时/历史行情、部分 F10、公告等。免费接口可能延迟或限流，请勿作为唯一交易依据。

**已移除**：腾讯、新浪、东财爬虫、akshare 等模拟访问源不再内置注册；升级后本地配置会自动清理。

## Tushare（可选增强）

1. **设置页**：设置 → 数据源 → Tushare  
2. 或复制 `tushare.example.json` 到用户数据目录（见上级 README）

## 同花顺扶摇（CN 基金 / 部分行情）

在 **设置 → 数据源** 中配置同花顺 API Key，可获取 CN 基金净值、部分场内基金数据等。

在 **设置 → 数据源** 中管理各类 Provider，与可选 `.opmd` 导入相互独立。
