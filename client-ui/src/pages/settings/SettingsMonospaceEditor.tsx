import CodeMirror from '@uiw/react-codemirror'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { makeStyles } from '@fluentui/react-components'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'

const useStyles = makeStyles({
  editorWrap: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusMd,
    overflow: 'hidden',
    backgroundColor: opptrixCssVars.canvasAlt,
    minHeight: '280px',
    '& .cm-editor': {
      height: '100%',
      minHeight: '280px',
      fontSize: 'var(--opptrix-font-md)',
    },
    '& .cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    },
    '& .cm-gutters': {
      backgroundColor: opptrixCssVars.canvasAlt,
      borderRight: `1px solid ${opptrixCssVars.separator}`,
    },
  },
})

const defaultExtensions: Extension[] = [EditorView.lineWrapping]

export interface SettingsMonospaceEditorProps {
  value: string
  onChange: (value: string) => void
  height?: string
  extensions?: Extension[]
  readOnly?: boolean
  placeholder?: string
}

export default function SettingsMonospaceEditor({
  value,
  onChange,
  height = '320px',
  extensions,
  readOnly = false,
  placeholder,
}: SettingsMonospaceEditorProps) {
  const s = useStyles()
  const cmExtensions = extensions ?? defaultExtensions

  return (
    <div className={s.editorWrap}>
      <CodeMirror
        value={value}
        height={height}
        extensions={cmExtensions}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
        }}
      />
    </div>
  )
}
