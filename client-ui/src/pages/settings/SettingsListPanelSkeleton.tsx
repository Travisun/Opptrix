import { Skeleton, SkeletonItem, makeStyles } from '@fluentui/react-components'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  listPanel: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
    height: '360px',
    display: 'flex',
    flexDirection: 'column',
  },
  listHeader: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 14px',
    minHeight: '44px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  listHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '5px 12px',
    minHeight: '34px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  listRowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
    maxWidth: '220px',
    height: '14px',
    borderRadius: opptrixTokens.radiusSm,
  },
  headerAction: {
    width: '56px',
    height: '28px',
    borderRadius: opptrixTokens.radiusMd,
  },
  titleBar: {
    width: '42%',
    maxWidth: '180px',
    height: '13px',
    borderRadius: opptrixTokens.radiusSm,
  },
  metaBar: {
    width: '68%',
    maxWidth: '260px',
    height: '11px',
    borderRadius: opptrixTokens.radiusSm,
  },
  switchBar: {
    width: '36px',
    height: '20px',
    borderRadius: opptrixTokens.radiusFull,
    flexShrink: 0,
  },
})

export function SettingsListPanelSkeleton({
  rowCount = 6,
  showHeaderActions = false,
  headerActionCount = 3,
  'aria-label': ariaLabel = '加载中…',
}: {
  rowCount?: number
  showHeaderActions?: boolean
  headerActionCount?: number
  'aria-label'?: string
}) {
  const s = useStyles()

  return (
    <div className={s.listPanel} aria-busy="true" aria-label={ariaLabel}>
      <div className={s.listHeader}>
        <Skeleton aria-hidden>
          <SkeletonItem className={s.headerMeta} />
        </Skeleton>
        {showHeaderActions && (
          <div className={s.listHeaderActions} aria-hidden>
            {Array.from({ length: headerActionCount }, (_, i) => (
              <Skeleton key={i}>
                <SkeletonItem className={s.headerAction} />
              </Skeleton>
            ))}
          </div>
        )}
      </div>
      <div className={s.listScroll}>
        {Array.from({ length: rowCount }, (_, i) => (
          <div key={i} className={s.listRow} aria-hidden>
            <div className={s.listRowMain}>
              <Skeleton>
                <SkeletonItem className={s.titleBar} />
              </Skeleton>
              <Skeleton>
                <SkeletonItem className={s.metaBar} />
              </Skeleton>
            </div>
            <Skeleton>
              <SkeletonItem className={s.switchBar} />
            </Skeleton>
          </div>
        ))}
      </div>
    </div>
  )
}
