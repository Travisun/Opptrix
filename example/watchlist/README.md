# 关注列表示例

`watchlist.example.json` 中 `items` 与右侧 **关注** 面板数据结构一致。

## 使用方式

- **应用内**：在关注面板搜索股票代码手动添加（推荐）。  
- **文件迁移**：在首次启动前复制到用户数据目录：

  ```bash
  cp example/watchlist/watchlist.example.json ~/.opptrix/watchlist.json
  ```

  或使用独立数据目录：

  ```bash
  export OPPTRIX_DATA_DIR="$PWD/example/runtime-local"
  mkdir -p "$OPPTRIX_DATA_DIR"
  cp example/watchlist/watchlist.example.json "$OPPTRIX_DATA_DIR/watchlist.json"
  ```

首次启动后数据会迁入 SQLite，原 `watchlist.json` 仅作迁移来源。
