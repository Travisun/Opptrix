# `@opptrix/canvas`

Agent 分析面板用的 curated React 组件库：语义 token、流体排版、轻量 SVG 图。

## 设计原则

- 扁平、克制；不用渐变、大阴影、装饰性符号
- 颜色只走 `useCanvasTheme()` / `theme.ts` 语义 token（含 `text` / `bg` / `fill` / `stroke` / `accent` 分组）
- 不必每个区块都套 Card；鼓励开放章节 + 少量卡片
- 默认流体宽度（约 880px 上限），非固定纸张
- 字阶：h1 24/30 · h2 18/24 · h3 16/22 · body 14/20 · small 12/16（字重 590 / 400）

## 使用

```tsx
import {
  Surface, Stack, H1, Text, Stat, Grid, Chart, Code, Link,
} from '@opptrix/canvas'
import '@opptrix/canvas/styles.css'

export default function Report() {
  return (
    <Surface>
      <Stack gap="24px">
        <H1>概览</H1>
        <Text tone="secondary">近季表现</Text>
        <Grid columns={2}>
          <Stat value="12.4 亿" label="营收" />
          <Stat value="3.1 亿" label="净利" tone="success" />
        </Grid>
        <Chart
          type="bar"
          data={[
            { label: 'Q1', value: 10 },
            { label: 'Q2', value: 14 },
            { label: 'Q3', value: 12 },
          ]}
        />
        <Text size="small">
          详见 <Link href="https://example.com">披露原文</Link>，代码 <Code>REV</Code>
        </Text>
      </Stack>
    </Surface>
  )
}
```

宿主跟随应用主题时，在预览根设置 `data-theme="light|dark"`；`Surface` / `useCanvasTheme` 会读取并注入 `--oxc-*` 变量。

## 公开 API（摘要）

| 类别 | 导出 |
|------|------|
| 主题 | `useCanvasTheme`, `getCanvasTokens`, `groupCanvasTokens`, `canvasTokensLight`, `canvasTokensDark`, `tokensToCssVars`, `canvasTypeScale` |
| 布局 | `Surface`, `Stack`, `Row`, `Grid`, `Spacer`, `Divider` |
| 排版 | `Text`, `H1`, `H2`, `H3`, `Code`, `Link` |
| 数据 | `Card`, `CardHeader`, `CardBody`, `Stat`, `Table`, `Callout`, `Pill`, `Button`, `Chart` |
| 工具 | `cx` |
| 样式 | `@opptrix/canvas/styles.css` |
