import { Input, type InputProps } from '@fluentui/react-components'

type Props = Omit<InputProps, 'appearance' | 'size'>

export default function OpptrixInput(props: Props) {
  return <Input appearance="filled-darker" size="medium" {...props} />
}
