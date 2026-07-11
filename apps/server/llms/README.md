# 本地离线翻译模型

将 GGUF 量化文件放入以下任一目录（文件名以 `.gguf` 结尾）：

- `apps/server/llms/`（开发时推荐）
- `llms/`（仓库根目录）
- `~/.opptrix/llms/`
- 或通过环境变量 `OPPTRIX_LLM_DIR` 指定目录

## 推荐文件

默认优先使用腾讯 **HY-MT1.5-1.8B** 专用翻译模型（质量更好，约 1.1 GB）：

- [tencent/HY-MT1.5-1.8B-GGUF](https://huggingface.co/tencent/HY-MT1.5-1.8B-GGUF) 中的 **Q4_K_M**
- 示例：`HY-MT1.5-1.8B-Q4_K_M.gguf`（也兼容其他来源的 `*_bf16_Q4_K_M.gguf` 命名）

通过环境变量 `OPPTRIX_TRANSLATION_MODEL` 可指定优先使用的文件名关键词（如 `hy-mt`）。

桌面版设置页可一键下载；默认经 **hf-mirror** 拉取（国内更稳），失败时自动回退 Hugging Face 官方源。也可通过 `OPPTRIX_HF_MIRROR` 自定义镜像地址。

**默认不会在启动时自动下载任何模型。** 仅在设置中开启「离线翻译」或「媒体提取（含音视频）」后，后台才会按需检测并下载对应模型：

| 能力 | 触发条件 | 模型 | 约大小 |
|------|----------|------|--------|
| 离线翻译 | 设置 → 多模态 → 启用离线翻译 | HY-MT Q4_K_M | ~1.1 GB |
| 音视频转写 | 设置 → 多模态 → 启用媒体提取 + 勾选音频/视频 | Whisper Tiny | ~75 MB |

图片理解仅走**远程多模态 API**（GPT-4o、Qwen-VL 等），不再使用本地 SmolVLM / llama-mtmd-cli。

## 文章富化（OCR / 转写）

服务端 `@opptrix/article-enrichment` 会在用户开启媒体提取后扫描文章 HTML：

- **图片** → 远程视觉大模型（须在多模态设置中配置提供商与模型）
- **音频** → ffmpeg 归一化 + Whisper Tiny 转写
- **视频** → ffmpeg 抽取音轨 + Whisper Tiny 转写

派生文本以 `【图片摘要】` / `【音频转写】` / `【视频转写】` 标注，存入 `user-store`（`news_enrichment`），供 Agent 与后续翻译合并为纯文字层。

API：

- `GET /api/news/articles/:id/enrichment`
- `POST /api/news/articles/:id/enrich`

## 使用

桌面版新闻阅读器标题栏旁点击 **翻译** 图标：在保留原文排版与图片/视频位置的前提下，将各段落译为中文；可在 **原文 / 译文** 间切换。译文缓存在 `~/.opptrix/news-translation-cache.json`。
