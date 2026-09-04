<p align="center">
  <img src="icons/opptrix-full-logo.png" alt="Opptrix" height="98" />
</p>

# Opptrix — 全球多市场投研工作台

<p align="center">
  <strong>开源 · 自托管 · 多市场 · AI 投研整理工作台</strong><br/>
  覆盖 A 股 · 美股 · 港股 · 日股 · 韩股；对话式投研 + 150+ 工具 + 170+ 工作流技能 + 可扩展平台
</p>

<table align="center">
  <tr>
    <td align="center"><a href="https://github.com/Travisun/Opptrix"><img src="https://img.shields.io/badge/GitHub-%E4%BB%93%E5%BA%93-181717?logo=github&logoColor=white" alt="GitHub" /></a></td>
    <td align="center"><a href="https://gitee.com/Travisun/Opptrix"><img src="https://img.shields.io/badge/Gitee-%E4%BB%93%E5%BA%93-C71D23?logo=gitee&logoColor=white" alt="Gitee" /></a></td>
    <td align="center"><a href="https://github.com/Travisun/Opptrix/stargazers"><img src="https://img.shields.io/github/stars/Travisun/Opptrix?style=flat&logo=github" alt="GitHub stars" /></a></td>
    <td align="center"><a href="https://www.npmjs.com/package/@opptrix/selfhost"><img src="https://img.shields.io/npm/v/@opptrix/selfhost?label=selfhost%20CLI&color=cb3837" alt="npm @opptrix/selfhost" /></a></td>
    <td align="center"><a href="docs/SELF-HOSTING.md"><img src="https://img.shields.io/badge/%E8%87%AA%E6%89%98%E7%AE%A1-Docker-2496ED?logo=docker&logoColor=white" alt="Self-host Docker" /></a></td>
    <td align="center"><a href="https://linux.do"><img src="https://img.shields.io/badge/Born%20in-LINUX.DO-009185" alt="Born in LINUX.DO" /></a></td>
    <td align="center"><a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License" /></a></td>
  </tr>
</table>

<p align="center">
  <img src="screenshot.webp" alt="Opptrix 主界面" width="920" />
</p>

<p align="center"><sub>主界面：多会话聊天、Agent 工具与工作流技能、右侧关注/个股面板；自托管 Web 交付</sub></p>

---

## ✨ 核心能力

### 投研工作台
| 能力 | 说明 |
|------|------|
| **Chat Agent** | 流式对话；按意图自动挂载投研工具包（150+） |
| **工作流技能** | 170+ 内置技能（量化 / 价值投资 / Lean / 核心投研）+ 个人技能导入 |
| **全球多市场** | CN · US · HK · JP · KR — 搜索、行情、K 线、筛选、跨市场分析 |
| **新闻 · 行情动态 · 右侧面板** | 订阅阅读、市场情绪、关注列表、发现策略、计划任务 |
| **网页交付 / 子 Agent** | 可预览投研页；复杂任务派生子任务 |

### 扩展平台（Phase B）
| 能力 | 说明 |
|------|------|
| **.opx 扩展** | 打包 → 验签 → 安装 → 激活 → 卸载全生命周期；独立宿主子进程 + vm 沙盒隔离 |
| **能力网关** | storage / events / data / schedule / llm(thin) / shell(thin) 等 token 化能力；权限先行、fail-closed |
| **贡献点** | 只读 Hook（会话消息/工具前置）、HTTP 子路由 `/api/ext/{id}/*`、计划任务 |
| **商店（本地就绪）** | Registry 协议 + 客户端全链验签（Ed25519）；UI 入口下一版本开放 |

### 聊天 Channels（外部机器人）
| 通道 | 流式 |
|------|------|
| **Telegram / Slack / Feishu** | ✅ 阶段编辑 + 终稿编辑（与 Web 聊天体验一致） |
| **钉钉 / 企业微信 / QQ** | ✅ 终稿应答（平台限制） |

### 主题系统
- **Opptrix 设计语言**（桌面工作台）与 **iOS 设计语言**（苹果系统配色/分组卡片，移动端默认）双外观
- 浅色 / 深色 / 跟随系统；设置 → 外观 即时切换

---

## 🚀 快速开始

> **主路径：自托管。** 数据与会话留在你自己的机器或服务器。

```bash
npm i -g @opptrix/selfhost
opptrix init
opptrix up            # 优先 pull 预构建镜像 → https://127.0.0.1:8712
opptrix doctor
```

Linux 从零：

```bash
curl -fsSL https://raw.githubusercontent.com/Travisun/Opptrix/main/scripts/bootstrap/linux.sh | bash
export PATH="$HOME/.local/bin:$PATH"
opptrix up
```

对话需自备 LLM API Key。版本升级 / 回退 / 常用命令见 **[docs/SELF-HOSTING.md](docs/SELF-HOSTING.md)**。

---

## 📚 文档索引

| 文档 | 说明 |
|------|------|
| [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) | 自托管部署、升级、回退、**1GB 内存画像** |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 分层、数据流、持久化（精读版） |
| [docs/ARCHITECTURE-COMPREHENSIVE.md](docs/ARCHITECTURE-COMPREHENSIVE.md) | 全面架构指南 |
| [docs/MAINTENANCE.md](docs/MAINTENANCE.md) | **维护手册**：模块地图、常见任务、测试与发布、审计清单 |
| [docs/API.md](docs/API.md) | REST / Hub features / 平台与扩展端点 |
| [docs/EXTENSION-PLATFORM-ARCHITECTURE.md](docs/EXTENSION-PLATFORM-ARCHITECTURE.md) | 扩展平台架构（Phase A/B） |
| [docs/EXTENSION-STORE-PROTOCOL.md](docs/EXTENSION-STORE-PROTOCOL.md) | 扩展商店 Registry 协议 v1.0 |
| [docs/EXTENSION-PLATFORM-ADR-02-AMENDMENT.md](docs/EXTENSION-PLATFORM-ADR-02-AMENDMENT.md) | 隔离模型决策（共享宿主 + 多层补偿） |
| [docs/AGENT-GUIDE.md](docs/AGENT-GUIDE.md) | AI 协作者手册 |
| [docs/DATA-LAYER.md](docs/DATA-LAYER.md) | 数据层 / Provider 演进 |
| [docs/UI-DESIGN-SYSTEM.md](docs/UI-DESIGN-SYSTEM.md) · [docs/UI-LAYOUT.md](docs/UI-LAYOUT.md) | 设计系统与布局规范 |

产品化开发者文档（双语，逐步充实）见仓库同级 **`opptrixdocuments/`** 目录。

---

## ⚠️ 重要风险提示与用户须知

**请在使用前仔细阅读。使用本软件即表示你已理解并同意以下条款。**

| 说明 | 内容 |
|------|------|
| **产品性质** | Opptrix 是 **数据查询与投研信息整理工具**，用于聚合公开/授权数据源、辅助阅读与检索。**不是** 证券投顾软件、**不是** 券商交易终端、**不提供** 代客理财、**不支持** 自动下单或实盘交易。 |
| **非投资建议** | 软件内展示的行情、财务、新闻、因子、策略信号、机构观点摘要及一切 **AI 生成内容**，均仅供学习、研究与信息整理，**不构成** 任何形式的投资建议、要约、邀约或承诺。 |
| **AI 内容风险** | 大模型可能产生错误、遗漏或「幻觉」；请 **以工具返回的结构化数据为准**，勿单独依据自然语言结论做决策。 |
| **数据局限性** | 行情可能延迟、缺失或错误；多数据源回退 **不保证** 实时性与准确性；第三方接口受各自服务条款与限流约束。 |
| **策略与回测** | 因子筛选、回测、信号验证基于历史数据，**过往表现不代表未来收益**。 |
| **责任归属** | 你基于本软件所作的任何投资或交易决定及由此产生的一切后果，**由你自行承担**；开发者与贡献者不对因使用本软件导致的任何直接或间接损失负责。 |
| **合规** | 请遵守所在国家/地区的证券、数据与隐私相关法规；接入 Tushare、LLM 等服务须自行配置凭证并遵守其协议。 |

> 界面截图、示例对话与演示数据 **不代表** 真实荐股或实盘推荐，请勿作为实际投资依据。

---

## 💬 技术交流与作者动态

**扫码加入 QQ 用户群**，使用问题、功能建议与同路人交流更方便；也可在抖音关注项目作者获取动态：

<table align="center">
  <tr>
    <td align="center" width="33%">
      <img src="author/qq_group.jpg" alt="Opptrix QQ 用户群 — 扫码加入" width="220" /><br />
      <sub><strong>QQ · Opptrix 用户群</strong></sub>
    </td>
    <td align="center" width="33%">
      <img src="author/douyin-qr.jpg" alt="抖音扫码关注项目作者动态" width="220" /><br />
      <sub>抖音 · 关注项目作者动态</sub>
    </td>
    <td align="center" width="33%">
      <img src="author/zanshang-weixin.webp" alt="微信扫码成为 Opptrix 赞助者" width="220" /><br />
      <sub>微信扫码·成为Opptrix 赞助者</sub>
    </td>
  </tr>
</table>

---

## ❤️ 欢迎赞助我们

Opptrix 坚持免费、开源。赞助不是购买，而是对理念的认可——你的支持会帮助我们把 Opptrix 发展得更加强大。

<p align="center">
  <a href="https://opptrix.org/sponsor"><strong>前往赞助页 → https://opptrix.org/sponsor</strong></a>
</p>

### 个人赞助者

感谢每一位支持者（与 [官网赞助墙](https://opptrix.org/sponsor) 同步）：

<table align="center">
  <tr>
    <td align="center" width="120">
      <img src="icons/sponsors/sponsor-worldwithdreams.webp" width="72" height="72" alt="WorldWithinDreams" /><br />
      <sub>WorldWithinDreams</sub>
    </td>
    <td align="center" width="120">
      <a href="https://github.com/LiberSeek">
        <img src="icons/sponsors/sponsor-raven.webp" width="72" height="72" alt="Raven" /><br />
        <sub>Raven</sub>
      </a>
    </td>
    <td align="center" width="120">
      <img src="icons/sponsors/sponsor-744649315.webp" width="72" height="72" alt="Remielle" /><br />
      <sub>Remielle</sub>
    </td>
    <td align="center" width="120">
      <img src="icons/sponsors/sponsor-N.webp" width="72" height="72" alt="N" /><br />
      <sub>N</sub>
    </td>
    <td align="center" width="120">
      <img src="icons/sponsors/sponsor-yexiaoying.webp" width="72" height="72" alt="叶小莹" /><br />
      <sub>叶小莹</sub>
    </td>
    <td align="center" width="120">
      <img src="icons/sponsors/sponsor-yueluocanheng.webp" width="72" height="72" alt="月落参横" /><br />
      <sub>月落参横</sub>
    </td>
  </tr>
</table>

<p align="center"><sub>企业赞助席位虚位以待 — 详情见 <a href="https://opptrix.org/sponsor">赞助页</a></sub></p>

---

## 参与贡献

向本仓库提交贡献即视为同意 [CLA](docs/CLA.md)（[English](docs/CLA-EN.md)）与 [CONTRIBUTING](docs/CONTRIBUTING.md)。

1. Fork，从 `main` 建分支
2. 提交 PR（遵循 CONTRIBUTING 的 commit 与 review 约定）

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Travisun/Opptrix&type=Date)](https://star-history.com/#Travisun/Opptrix&Date)

## 许可证

[Apache 2.0](LICENSE)

## 相关链接

- 官网 / 社区：<https://opptrix.net/> · <https://opptrix.org/>
- npm：[@opptrix/selfhost](https://www.npmjs.com/package/@opptrix/selfhost)
