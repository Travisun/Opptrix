import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & {
  fontSize?: number | string
}

function PanelIcon({
  fontSize = 18,
  side,
  emphasized,
  ...rest
}: IconProps & { side: 'left' | 'right'; emphasized?: boolean }) {
  const size = typeof fontSize === 'number' ? fontSize : fontSize
  const dividerX = side === 'left' ? 7.5 : 12.5
  const pane = side === 'left'
    ? { x: 3, y: 3.5, w: 4.5, h: 13 }
    : { x: 12.5, y: 3.5, w: 4.5, h: 13 }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      {...rest}
    >
      <rect
        x="2.5"
        y="3"
        width="15"
        height="14"
        rx="2.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d={`M${dividerX} 3v14`}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {emphasized ? (
        <rect
          x={pane.x}
          y={pane.y}
          width={pane.w}
          height={pane.h}
          fill="currentColor"
          opacity="0.22"
        />
      ) : null}
    </svg>
  )
}

/** Left sidebar visible — strip on the left is emphasized */
export function PanelLeftContractRegular(props: IconProps) {
  return <PanelIcon side="left" emphasized {...props} />
}

/** Left sidebar hidden — empty left strip */
export function PanelLeftExpandRegular(props: IconProps) {
  return <PanelIcon side="left" {...props} />
}

/** Right panel visible — strip on the right is emphasized */
export function PanelRightContractRegular(props: IconProps) {
  return <PanelIcon side="right" emphasized {...props} />
}

/** Right panel hidden — empty right strip */
export function PanelRightExpandRegular(props: IconProps) {
  return <PanelIcon side="right" {...props} />
}

export {
  ChatAddRegular,
  ArrowMaximizeRegular,
  ArrowMinimizeRegular,
} from '@fluentui/react-icons'
