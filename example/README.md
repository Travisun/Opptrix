# Opptrix 示例配置

本目录存放**可提交到仓库**的启动与配置范例，便于新用户或团队统一初始环境。  
所有文件均为占位符，**请勿填入真实 API Key、Token 或隐私数据**。

## 目录说明

| 路径 | 用途 |
|------|------|
| [startup/](./startup/) | 环境变量与 Web / 桌面启动示例 |
| [config/](./config/) | 应用 LLM 与默认参数（`app-config`） |
| [data-sources/](./data-sources/) | 可选数据源（如 Tushare）、本地因子库 `.opmd` 样例 |
| [news/](./news/) | RSS 新闻订阅导入格式 |
| [watchlist/](./watchlist/) | 关注列表示例 |

## 快速使用

### 1. 启动环境变量

```bash
cp example/startup/env.example .env
# 编辑 .env，至少填入 LLM_API_KEY（对话功能需要）
```

根目录另有 [.env.example](../.env.example)，与 `example/startup/env.example` 内容同步维护。

### 2. Web 开发

```bash
npm install
npm run build
npm run dev
# 浏览器打开 http://127.0.0.1:5173
```

### 3. 桌面开发

```bash
npm run dev:desktop
```

详见 [docs/DESKTOP.md](../docs/DESKTOP.md)。

### 4. 导入示例配置（可选）

**方式 A — 设置页（推荐）**  
启动应用后，在 **设置** 中配置 LLM 提供商、市场数据、新闻订阅等。

**方式 B — 复制到用户数据目录**  
默认数据目录为 `~/.opptrix`（可用 `OPPTRIX_DATA_DIR` 覆盖）。部分历史 JSON 会在首次启动时自动迁移进 SQLite（`opptrix.db`）。

```bash
# 使用独立目录试用示例（不污染本机默认数据）
export OPPTRIX_DATA_DIR="$PWD/example/runtime-local"
mkdir -p "$OPPTRIX_DATA_DIR"

# 可选：复制关注列表（首次启动前）
cp example/watchlist/watchlist.example.json "$OPPTRIX_DATA_DIR/watchlist.json"

# 可选：Tushare（在设置 → 数据源 中配置更稳妥）
cp example/data-sources/tushare.example.json "$OPPTRIX_DATA_DIR/tushare-config.json"
```

`example/runtime-local/` 已加入 `.gitignore`，本地试用内容不会误提交。

**方式 C — 新闻订阅 JSON**  
在 **设置 → 新闻订阅** 中导入 [news/subscriptions.example.json](./news/subscriptions.example.json)（应用内「导入」功能）。

## 与正式配置的关系

| 正式位置 | 说明 |
|----------|------|
| `.env` | 进程环境变量，优先于部分 json 字段 |
| `~/.opptrix/opptrix.db` | 用户数据主存储（配置、会话、关注列表等） |
| `apps/server/data/config.json` | 旧版 LLM 配置路径，首次读取后会迁移入库 |

更多说明见 [README.md](../README.md)、[docs/README.md](../docs/README.md) 与 [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md)。

## 贡献示例

欢迎在本目录追加**脱敏**范例（如新数据源说明、订阅清单、启动脚本）。请勿提交：

- 真实 API Key / Token  
- 个人会话导出  
- 含账号信息的私有数据  
