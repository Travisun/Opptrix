# 应用配置示例

`app-config.example.json` 对应当前设置页使用的多提供商格式。

## 使用方式

1. **推荐**：启动后在 **设置 → 模型** 中手动添加提供商。  
2. **首次迁移**：将内容复制到 `apps/server/data/config.json`（勿提交含 `api_key` 的文件），首次启动会写入 `~/.opptrix`。  
3. 旧版单提供商格式见 [legacy-llm.example.json](./legacy-llm.example.json)。

`api_key` 留空表示未配置；也可通过根目录 `.env` 的 `LLM_API_KEY` 注入。
