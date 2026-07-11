import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import react from 'eslint-plugin-react'

/** client-ui React 静态检查：类型之外的组件常见问题（hooks、列表 key） */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.codegraph/**'] },
  {
    files: ['client-ui/src/**/*.{ts,tsx}'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
      react,
    },
    settings: {
      react: { version: '18.3' },
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Hooks 规则错误（条件调用 hooks 等）
      'react-hooks/rules-of-hooks': 'error',
      // 依赖数组问题（含不稳定引用 → 无限 setState 风险）；先 warn，由 check:ui 汇总
      'react-hooks/exhaustive-deps': 'warn',
      // 列表缺少 key / 重复 key 的静态兜底
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],
      // 与现有代码风格对齐，避免 ESLint 首次引入产生大量无关噪音
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': 'off',
    },
  },
)
