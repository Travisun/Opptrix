import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Input,
  Option,
  Switch,
  Textarea,
  makeStyles,
} from '@fluentui/react-components'
import {
  scheduleApi,
  type ScheduleJobNotifyMode,
  type ScheduleJobNotifyOverride,
  type ScheduleNotifyOn,
  type ScheduleNotifySettings,
  type ScheduledJob,
} from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
})

type Props = {
  open: boolean
  job: ScheduledJob
  globalNotify: ScheduleNotifySettings
  onClose: () => void
  onSaved: (job: ScheduledJob) => void
}

function defaultOverride(): ScheduleJobNotifyOverride {
  return { notify_mode: 'inherit' }
}

export default function ScheduleJobNotifyDialog({
  open,
  job,
  globalNotify,
  onClose,
  onSaved,
}: Props) {
  const s = useStyles()
  const [draft, setDraft] = useState<ScheduleJobNotifyOverride>(
    job.notify_override ?? defaultOverride(),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setDraft(job.notify_override ?? defaultOverride())
  }, [open, job.notify_override])

  const mode = draft.notify_mode
  const notifyOnLabel: Record<ScheduleNotifyOn, string> = {
    always: '每次执行',
    success: '仅成功时',
    failure: '仅失败时',
  }

  const save = async () => {
    setSaving(true)
    try {
      const resp = await scheduleApi.updateJob(job.id, { notify_override: draft })
      onSaved(resp.job)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose() }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>任务通知：{job.title}</DialogTitle>
          <DialogContent className={s.stack}>
            <Dropdown
              value={
                mode === 'inherit' ? '继承全局'
                  : mode === 'custom' ? '自定义'
                    : '关闭通知'
              }
              selectedOptions={[mode]}
              onOptionSelect={(_, data) => {
                const v = data.optionValue as ScheduleJobNotifyMode | undefined
                if (v) setDraft({ notify_mode: v })
              }}
            >
              <Option value="inherit">继承全局</Option>
              <Option value="custom">自定义</Option>
              <Option value="off">关闭通知</Option>
            </Dropdown>

            {mode === 'custom' && (
              <>
                <Dropdown
                  value={notifyOnLabel[draft.notify_on ?? globalNotify.notify_on]}
                  selectedOptions={[draft.notify_on ?? globalNotify.notify_on]}
                  onOptionSelect={(_, data) => {
                    const v = data.optionValue as ScheduleNotifyOn | undefined
                    if (v) setDraft(prev => ({ ...prev, notify_on: v }))
                  }}
                >
                  <Option value="failure">仅失败时</Option>
                  <Option value="success">仅成功时</Option>
                  <Option value="always">每次执行</Option>
                </Dropdown>
                <Switch
                  label="启用邮件（使用全局 SMTP）"
                  checked={draft.email_enabled ?? globalNotify.email_enabled}
                  onChange={(_, data) => setDraft(prev => ({
                    ...prev,
                    email_enabled: Boolean(data.checked),
                  }))}
                />
                <Textarea
                  resize="vertical"
                  placeholder="本任务收件人，每行一个；留空则使用全局收件人"
                  value={(draft.email_to ?? []).join('\n')}
                  onChange={(_, data) => {
                    const email_to = data.value
                      .split(/\r?\n/)
                      .map(line => line.trim())
                      .filter(Boolean)
                    setDraft(prev => ({ ...prev, email_to }))
                  }}
                />
                <Input
                  value={draft.webhooks?.[0]?.url ?? ''}
                  placeholder="可选：本任务专用 Webhook URL（留空则用全局）"
                  onChange={(_, data) => {
                    const url = data.value.trim()
                    setDraft(prev => ({
                      ...prev,
                      webhooks: url
                        ? [{
                          id: prev.webhooks?.[0]?.id ?? crypto.randomUUID(),
                          url,
                          secret: prev.webhooks?.[0]?.secret ?? '',
                          enabled: true,
                        }]
                        : [],
                    }))
                  }}
                />
              </>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <OpptrixButton variant="secondary" onClick={onClose}>取消</OpptrixButton>
              <OpptrixButton variant="primary" disabled={saving} onClick={() => { void save() }}>
                保存
              </OpptrixButton>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
