import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  ArrowSyncRegular,
  ArrowUploadRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  DocumentRegular,
} from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import { ApiHttpError } from '../../api/client'
import { useSystemUpdate } from '../../hooks/useSystemUpdate'
import { isElectron } from '../../platform/detect'
import { opptrixCssVars } from '../../theme/tokens'
import {
  formatImportFileSize,
  readSha256SidecarHex,
  validateImportPair,
  validateImportPackageFilename,
  validateImportShaFilename,
} from '../../utils/systemUpdateImportValidation'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSectionLabel,
} from './SettingsPrimitives'

type FileSlotState = {
  file: File | null
  filenameOk: boolean
  contentOk: boolean | null
  version: string | null
  message: string | null
}

const EMPTY_SLOT: FileSlotState = {
  file: null,
  filenameOk: false,
  contentOk: null,
  version: null,
  message: null,
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  emptyHint: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
    padding: '4px 2px 0',
  },
  formatHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
    padding: '2px 2px 0',
  },
  dropZone: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '14px 16px',
    borderRadius: '8px',
    border: `1px dashed ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    transitionProperty: 'border-color, background-color',
    transitionDuration: '140ms',
  },
  dropZoneActive: {
    border: `1px dashed ${opptrixCssVars.borderStrong}`,
    backgroundColor: opptrixCssVars.surfaceHover,
  },
  dropTitle: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
  },
  dropDesc: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
  },
  fileRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '6px',
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  fileIcon: {
    flexShrink: 0,
    marginTop: '1px',
    fontSize: '18px',
    width: '18px',
    height: '18px',
    color: opptrixCssVars.textTertiary,
  },
  fileBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  fileName: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
    wordBreak: 'break-all',
  },
  fileMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  fileMessage: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.error,
    lineHeight: 1.4,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    paddingTop: '4px',
  },
  successBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: opptrixCssVars.canvasAlt,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  successTitle: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  successDesc: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
})

async function validatePackageSlot(file: File | null): Promise<FileSlotState> {
  if (!file) return { ...EMPTY_SLOT }
  const filename = validateImportPackageFilename(file.name)
  return {
    file,
    filenameOk: filename.ok,
    contentOk: filename.ok ? true : null,
    version: filename.version,
    message: filename.message,
  }
}

async function validateShaSlot(
  file: File | null,
  packageFile: File | null,
): Promise<FileSlotState> {
  if (!file) return { ...EMPTY_SLOT }
  const filename = validateImportShaFilename(file.name, packageFile?.name ?? null)
  if (!filename.ok) {
    return {
      file,
      filenameOk: false,
      contentOk: null,
      version: filename.version,
      message: filename.message,
    }
  }
  const content = await readSha256SidecarHex(file)
  return {
    file,
    filenameOk: true,
    contentOk: content.ok,
    version: filename.version,
    message: content.message,
  }
}

function FilePickRow({
  label,
  slot,
  onPick,
  onClear,
  disabled,
}: {
  label: string
  slot: FileSlotState
  onPick: () => void
  onClear: () => void
  disabled?: boolean
}) {
  const s = useStyles()
  const hasFile = Boolean(slot.file)
  const ok = hasFile && slot.filenameOk && slot.contentOk !== false
  const hasError = hasFile && (!slot.filenameOk || slot.contentOk === false)

  const StatusIcon = !hasFile
    ? DocumentRegular
    : ok
      ? CheckmarkCircleRegular
      : hasError
        ? DismissCircleRegular
        : DocumentRegular

  return (
    <div
      className={s.fileRow}
      style={hasError
        ? { borderColor: opptrixCssVars.error }
        : ok
          ? { borderColor: opptrixCssVars.success }
          : undefined}
    >
      <StatusIcon
        className={s.fileIcon}
        style={hasError
          ? { color: opptrixCssVars.error }
          : ok
            ? { color: opptrixCssVars.success }
            : undefined}
      />
      <div className={s.fileBody}>
        <Text className={s.fileName} block>
          {hasFile ? slot.file?.name : `尚未选择${label}`}
        </Text>
        {hasFile && slot.file && (
          <Text className={s.fileMeta} block>
            {formatImportFileSize(slot.file.size)}
            {slot.version ? ` · v${slot.version}` : ''}
          </Text>
        )}
        {slot.message && (
          <Text className={s.fileMessage} block>{slot.message}</Text>
        )}
      </div>
      <OpptrixButton
        variant="secondary"
        size="small"
        disabled={disabled}
        onClick={hasFile ? onClear : onPick}
      >
        {hasFile ? '移除' : '选择文件'}
      </OpptrixButton>
    </div>
  )
}

export default function OfflineUpdateSettingsSection({ embedded = false }: { embedded?: boolean }) {
  const s = useStyles()
  const { confirm: confirmDialog } = useOpptrixDialogAlert()
  const {
    active: systemUpdateActive,
    status: systemStatus,
    importNow: importSystemNow,
    applyNow: applySystemNow,
    openConfirm: openSystemConfirm,
    importing: systemImporting,
    applying: systemApplying,
  } = useSystemUpdate()

  const packageInputRef = useRef<HTMLInputElement>(null)
  const shaInputRef = useRef<HTMLInputElement>(null)
  const [packageSlot, setPackageSlot] = useState<FileSlotState>({ ...EMPTY_SLOT })
  const [shaSlot, setShaSlot] = useState<FileSlotState>({ ...EMPTY_SLOT })
  const [dragOver, setDragOver] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importedVersion, setImportedVersion] = useState<string | null>(null)

  const showSystemUpdate = systemUpdateActive && systemStatus.enabled
  const systemBusy = systemImporting || systemApplying

  const pairValidation = useMemo(
    () => validateImportPair(packageSlot.file, shaSlot.file),
    [packageSlot.file, shaSlot.file],
  )

  const canImport = pairValidation.ok
    && packageSlot.contentOk !== false
    && shaSlot.contentOk !== false
    && !systemBusy

  useEffect(() => {
    if (systemStatus.readyToApply && systemStatus.availableVersion) {
      setImportedVersion(systemStatus.availableVersion)
    }
  }, [systemStatus.readyToApply, systemStatus.availableVersion])

  const applyPackageFile = useCallback(async (file: File) => {
    setImportError(null)
    const next = await validatePackageSlot(file)
    setPackageSlot(next)
    if (shaSlot.file) {
      const nextSha = await validateShaSlot(shaSlot.file, file)
      setShaSlot(nextSha)
    }
  }, [shaSlot.file])

  const applyShaFile = useCallback(async (file: File) => {
    setImportError(null)
    const next = await validateShaSlot(file, packageSlot.file)
    setShaSlot(next)
  }, [packageSlot.file])

  const clearPackage = useCallback(() => {
    setPackageSlot({ ...EMPTY_SLOT })
    setImportError(null)
    if (packageInputRef.current) packageInputRef.current.value = ''
    if (shaSlot.file) {
      void validateShaSlot(shaSlot.file, null).then(setShaSlot)
    }
  }, [shaSlot.file])

  const clearSha = useCallback(() => {
    setShaSlot({ ...EMPTY_SLOT })
    setImportError(null)
    if (shaInputRef.current) shaInputRef.current.value = ''
  }, [])

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const files = [...event.dataTransfer.files]
    if (files.length === 0) return
    for (const file of files) {
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.sha256')) {
        void applyShaFile(file)
      } else if (
        lower.endsWith('.bin')
        || lower.endsWith('.tar.gz')
        || lower.endsWith('.tgz')
      ) {
        void applyPackageFile(file)
      }
    }
  }, [applyPackageFile, applyShaFile])

  const handleImport = useCallback(async () => {
    if (!packageSlot.file || !shaSlot.file) {
      await confirmDialog({
        title: '请选择文件',
        message: '需同时选择更新包与校验文件后才能导入。',
        confirmLabel: '知道了',
      })
      return
    }
    if (!canImport) {
      await confirmDialog({
        title: '文件未通过校验',
        message: pairValidation.errors.join('；') || '请检查文件名与内容后重试。',
        confirmLabel: '知道了',
      })
      return
    }

    const sizeMb = (packageSlot.file.size + shaSlot.file.size) / (1024 * 1024)
    if (sizeMb > 50) {
      const ok = await confirmDialog({
        title: '确认导入更新包？',
        message: `将上传约 ${formatImportFileSize(packageSlot.file.size + shaSlot.file.size)} 的数据。上传期间请保持页面打开，直至导入完成。`,
        confirmLabel: '开始导入',
        cancelLabel: '取消',
      })
      if (!ok) return
    }

    setImportError(null)
    try {
      const ok = await importSystemNow(packageSlot.file, shaSlot.file)
      if (!ok) {
        setImportError('导入未成功，请稍后重试。')
        return
      }
      setImportedVersion(pairValidation.version)
      setPackageSlot({ ...EMPTY_SLOT })
      setShaSlot({ ...EMPTY_SLOT })
      if (packageInputRef.current) packageInputRef.current.value = ''
      if (shaInputRef.current) shaInputRef.current.value = ''
    } catch (err) {
      const message = err instanceof ApiHttpError
        ? err.message
        : err instanceof Error
          ? err.message
          : '导入未成功，请稍后重试。'
      setImportError(message)
    }
  }, [
    canImport,
    confirmDialog,
    importSystemNow,
    packageSlot.file,
    pairValidation.errors,
    pairValidation.version,
    shaSlot.file,
  ])

  if (!embedded && isElectron()) {
    return (
      <Text className={s.emptyHint} block>
        桌面版通过「在线更新」检查并安装新版本；离线导入更新包仅适用于浏览器访问的自托管部署。
      </Text>
    )
  }

  if (!showSystemUpdate) {
    return (
      <Text className={s.emptyHint} block>
        当前环境未启用离线更新。若你使用 Docker 或自托管部署，请确认已按文档配置更新通道。
      </Text>
    )
  }

  return (
    <div className={s.root}>
      <Text className={s.formatHint} block>
        从官方渠道下载的运行时更新包可直接导入，无需联网。文件名需符合
        {' '}
        <Text as="span" style={{ fontFamily: 'ui-monospace, monospace' }}>
          opptrix-runtime-v版本号.bin
        </Text>
        {' '}
        或
        {' '}
        <Text as="span" style={{ fontFamily: 'ui-monospace, monospace' }}>
          .tar.gz
        </Text>
        ，并配套同名
        {' '}
        <Text as="span" style={{ fontFamily: 'ui-monospace, monospace' }}>
          .sha256
        </Text>
        {' '}
        校验文件。
      </Text>

      <SettingsSectionLabel spaced>选择文件</SettingsSectionLabel>
      <input
        ref={packageInputRef}
        type="file"
        accept=".bin,.tar.gz,.tgz,application/gzip,application/octet-stream"
        hidden
        onChange={e => {
          const file = e.target.files?.[0] ?? null
          if (file) void applyPackageFile(file)
        }}
      />
      <input
        ref={shaInputRef}
        type="file"
        accept=".sha256,text/plain"
        hidden
        onChange={e => {
          const file = e.target.files?.[0] ?? null
          if (file) void applyShaFile(file)
        }}
      />

      <div
        className={mergeClasses(s.dropZone, dragOver && s.dropZoneActive)}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Text className={s.dropTitle} block>拖入文件，或分别选择</Text>
        <Text className={s.dropDesc} block>
          支持将更新包与校验文件一起拖入此区域；也可点击下方按钮逐个选择。
        </Text>
        <FilePickRow
          label="更新包"
          slot={packageSlot}
          disabled={systemBusy}
          onPick={() => packageInputRef.current?.click()}
          onClear={clearPackage}
        />
        <FilePickRow
          label="校验文件"
          slot={shaSlot}
          disabled={systemBusy}
          onPick={() => shaInputRef.current?.click()}
          onClear={clearSha}
        />
        <div className={s.actions}>
          <OpptrixButton
            variant="primary"
            disabled={!canImport}
            icon={systemImporting
              ? <Spinner size="tiny" />
              : <ArrowUploadRegular fontSize={14} />}
            onClick={() => { void handleImport() }}
          >
            {systemImporting ? '正在校验并导入…' : '校验并导入'}
          </OpptrixButton>
        </div>
        {importError && (
          <Text className={s.fileMessage} block>{importError}</Text>
        )}
      </div>

      {importedVersion && systemStatus.readyToApply && (
        <div className={s.successBlock}>
          <Text className={s.successTitle} block>
            v{importedVersion} 已导入并就绪
          </Text>
          <Text className={s.successDesc} block>
            更新包已通过校验。确认后即可应用新版本；应用期间暂时无法使用其他功能。
          </Text>
          <OpptrixButton
            variant="primary"
            size="small"
            disabled={systemApplying}
            icon={systemApplying
              ? <Spinner size="tiny" />
              : <ArrowSyncRegular fontSize={14} />}
            onClick={() => {
              openSystemConfirm()
              void applySystemNow()
            }}
          >
            {systemApplying ? '正在应用…' : '立即应用更新'}
          </OpptrixButton>
        </div>
      )}

      <SettingsSectionLabel spaced>说明</SettingsSectionLabel>
      <SettingsGroup>
        <SettingsRow
          title="校验规则"
          desc="导入前会检查文件名、版本是否一致，以及校验文件内容格式；上传后服务端会再次校验包完整性。"
        />
        <SettingsRow
          title="应用更新"
          desc="导入成功后，可切换到「在线更新」标签页完成应用。"
          last
        />
      </SettingsGroup>
    </div>
  )
}
