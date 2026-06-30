import { Textarea, type TextareaProps } from '@fluentui/react-components'

type Props = Omit<TextareaProps, 'appearance' | 'size'>

export default function OpptrixTextarea(props: Props) {
  return <Textarea appearance="filled-darker" size="medium" {...props} />
}
