---
name: browser-browse
description: 浏览器浏览工作流（工具 browser_navigate / browser_snapshot / browser_screenshot / browser_close）。用户说「打开网页」「浏览一下」「截个图」「看这个链接」「browser_navigate」「/browser-browse」时使用。按导航→快照/截图→关闭会话取证，不做买卖建议。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  required-packs: browser
allowed-tools: browser_navigate browser_snapshot browser_screenshot browser_close
---

# 浏览器浏览

## 何时使用

用户要 Agent **打开指定网页取证**（阅读公开页、截图、抓可见结构），而不是用本地资讯库或画布制品。

## 步骤

1. **确认 URL 与目的**：合法公开页；目标不清时简短确认。
2. **导航**：激活后直接 `browser_navigate`。
3. **取证**：`browser_snapshot` 与/或 `browser_screenshot` 获取可见内容；只依据返回内容归纳。
4. **收尾**：任务结束调用 `browser_close`（或按工具约定释放会话）。
5. **输出边界**：事实摘录与推断分开；**不给出**买卖建议；勿越权访问需登录的私密页（除非用户已明确授权且工具允许）。

## 禁止

- 荐股或编造页面上未出现的内容
- 用浏览器替代已有行情/资讯标准工具做主路径取数（除非用户明确要看外网页）
