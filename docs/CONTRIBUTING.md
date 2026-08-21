# 贡献指南

感谢参与 **Opptrix** 开源协作。本文说明如何高效提交改动并与维护者评审对齐。

> ### 协作即同意（必读）
>
> 向本仓库提交 Issue、Pull Request、patch、代码、文档、设计、翻译等任何贡献，即视为你已阅读并同意下列文件；不同意请勿贡献：
>
> - [贡献者许可协议（中文）](CLA.md)
> - [Contributor License Agreement (English)](CLA-EN.md)
> - 本文（本贡献指南）
>
> CLA 版本：`2026-08-21.1`。若 CLA 有重大更新，维护者会在此提示；继续贡献视为接受新版。

> **使用 AI 编程助手？** 请先让 Agent 阅读 [AGENT-GUIDE.md](./AGENT-GUIDE.md)，其中包含目录地图、架构约束与 UI 规范摘要。

---

## 1. 行为准则

- 尊重协作者与使用者；讨论对事不对人。
- 不提交 API Key、Token、个人持仓等敏感信息。
- 遵守数据源服务条款；不添加明显违法或侵权的抓取逻辑。
- 产品输出定位为 **学习与研究辅助**，文案与功能均不得暗示保本或代客决策。

---

## 2. 开发环境

- **Node.js** ≥ 24（Active LTS；Node 20 已于 2026-04-30 EOL）
- **npm**（workspaces，仅根目录安装依赖）

```bash
git clone https://github.com/Travisun/Opptrix.git
cd Opptrix
npm install
npm run dev
```

浏览器访问 http://127.0.0.1:5173 。详见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

---

## 3. 分支与提交

### 3.1 分支命名

| 前缀 | 用途 |
|------|------|
| `feat/` | 新功能 |
| `fix/` | 缺陷修复 |
| `docs/` | 仅文档 |
| `refactor/` | 行为不变的重构 |
| `chore/` | 构建、依赖、工具链 |

从 `main` 拉取最新代码后创建分支：

```bash
git fetch origin
git checkout -b feat/your-topic main
```

### 3.2 Commit 信息

使用简洁中文或英文，说明 **为什么** 改：

```
fix(chat): 修复窄窗下侧栏浮层被顶栏遮挡

docs: 补充 AGENT-GUIDE 本地数据层说明
```

避免一个 commit 混合无关改动（如功能 + 大规模格式化）。

### 3.3 提交前检查

```bash
npm run build
npm run test        # 或 CI 等价：npm run build && npm run test:ci
```

确保未暂存：

- `.env`
- `apps/server/data/config.json`（含密钥时）
- `node_modules/`、`dist/`（已在 `.gitignore`）

---

## 4. Pull Request 流程

1. **先开 Issue**（大型功能或架构变更）：简述动机与方案，避免与维护者方向冲突。
2. **小步 PR**：一个 PR 解决一类问题，便于 review。
3. **填写 PR 说明**：
   - **Summary**：改了什么、为什么
   - **Test plan**：如何验证（命令、截图、场景）
   - **UI 变更**：附前后对比截图；对照 `UI-DESIGN-SYSTEM.md`
4. **关联 Issue**：`Fixes #123` 或 `Relates to #123`
5. 等待 CI / 维护者 review；根据意见 push 追加 commit 或 rebase（按维护者偏好）。

### 4.1 PR 范围建议

| 类型 | 建议 |
|------|------|
| 新 MCP 工具 | `tools.ts` + `tool-meta.ts` + hub（如需）+ API 文档 |
| 新 REST | `apps/server` + `docs/API.md` |
| 聊天 UI | `client-ui/src/chat/`，遵守 `client-ui-guidelines` |
| 数据源 | `a-stock-layer` driver + 错误回退测试说明 |
| 仅文档 | 可直接 `docs/` PR，无需 build（若未改代码） |

### 4.2 Review 关注点

维护者通常会检查：

- 是否走 `ResearchHub` 统一入口
- UI 是否沿用 Fluent + tokens
- 用户可见文案是否易懂
- 改动是否最小、有无隐含破坏性变更
- 密钥与隐私是否泄漏

---

## 5. 代码风格

- **TypeScript**：与邻近文件保持一致；优先 `async/await`
- **React**：函数组件 + hooks；样式用 Fluent `makeStyles` 或项目 mixins
- **命名**：现有代码中英混用（用户文案中文、标识符英文），新代码遵循所在目录惯例
- **注释**：只解释非显而易见的业务逻辑，避免复述代码

不要：

- 未经要求的 Prettier/ESLint 全库格式化
- 删除看似「未使用」但可能被动态引用的导出
- 在 PR 中混入 `.cursor/` 个人配置（除非维护者统一收录规则）

---

## 6. 文档义务

以下改动应 **同步文档**：

| 改动 | 更新 |
|------|------|
| 新 feature / API | `docs/API.md` |
| 架构/包结构 | `docs/ARCHITECTURE.md`, `packages/README.md` |
| 开发命令/端口 | `docs/DEVELOPMENT.md`, `README.md` |
| UI 规范 | `docs/UI-DESIGN-SYSTEM.md` |
| Agent 协作约定 | `docs/AGENT-GUIDE.md` |

---

## 7. 许可证与贡献者协议

- 本仓库采用 **[Apache License 2.0](../LICENSE)** 对外发布；著作权人 / 项目所有者为 **Opptrix Team**。
- 向本仓库贡献须遵守 **[CLA（中文）](CLA.md)**（英文对照：[CLA-EN.md](CLA-EN.md)；版本 `2026-08-21.1`；冲突时以中文为准）。依 CLA：你向 Opptrix Team 授予不可撤销的著作权财产权许可（含再许可及为项目需要更换或实行双许可的权利）；你保留署名权；你同意为项目目的对贡献进行发表、修改与演绎，且不就项目目的之修改主张侵犯修改权或保护作品完整权；项目整体权利由 Opptrix Team 控制。
- 提交 Issue / PR 即表示同意 CLA 与本文（详见 CLA 第 1 条）。
- 若贡献含第三方材料，须在 PR 中披露来源与许可证，且不得引入与 Apache-2.0 不兼容的许可证（除非事先书面同意）。功能相关第三方许可摘要见 **[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)**。

### 7.1 身份与商标边界

- **Opptrix** 名称、标识、域名等归 Opptrix Team；贡献不授予商标权。
- 不得自称官方运营团队成员、雇员、代理或代表；不得暗示合伙、联营或官方背书。
- 不得主张项目整体所有权、著作权、商标、商誉或与 CLA 冲突的衍生控制权。

---

## 8. 获取帮助

- Bug 与功能请求：[GitHub Issues](https://github.com/Travisun/Opptrix/issues)
- 架构与 Agent 开发：[AGENT-GUIDE.md](./AGENT-GUIDE.md)
- API 细节：[API.md](./API.md)
