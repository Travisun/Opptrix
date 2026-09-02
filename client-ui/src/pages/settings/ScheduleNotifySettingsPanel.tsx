import { useCallback, useEffect, useState } from 'react'
import {
  Dropdown,
  Input,
  Option,
  Spinner,
  Switch,
  Text,
  Textarea,
  makeStyles,
} from '@fluentui/react-components'
import {
  scheduleApi,
  type ScheduleEmailFormat,
  type ScheduleNotifyOn,
  type ScheduleNotifySettings,
  type ScheduleSettings,
  type ScheduleWebhookTarget,
} from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars } from '../../theme/tokens'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSectionLabel,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'

const SECRET_PLACEHOLDER = '••••••••'
const MAX_WEBHOOKS = 5

const useStyles = makeStyles({
  block: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fieldStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px 14px',
  },
  webhookCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px 12px',
    borderRadius: '10px',
    border: `1px solid color-mix(in srgb, ${opptrixCssVars.textPrimary} 8%, transparent)`,
  },
  rowActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  hint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
})

function newWebhook(): ScheduleWebhookTarget {
  return {
    id: crypto.randomUUID(),
    url: '',
    secret: '',
    enabled: true,
  }
}

function defaultSmtp(): NonNullable<ScheduleNotifySettings['smtp']> {
  return {
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    from: '',
    email_format: 'both',
  }
}

function cloneNotify(notify: ScheduleNotifySettings): ScheduleNotifySettings {
  return {
    ...notify,
    webhooks: notify.webhooks.map(w => ({ ...w })),
    email_to: [...notify.email_to],
    smtp: notify.smtp ? { ...notify.smtp } : null,
  }
}

type Props = {
  settings: ScheduleSettings
  onSaved: (settings: ScheduleSettings) => void
}

export default function ScheduleNotifySettingsPanel({ settings, onSaved }: Props) {
  const s = useStyles()
  const toast = useSettingsToast()
  const [draft, setDraft] = useState(() => cloneNotify(settings.notify))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<'webhook' | 'email' | null>(null)

  useEffect(() => {
    setDraft(cloneNotify(settings.notify))
  }, [settings.notify])

  const saveNotify = useCallback(async () => {
    setSaving(true)
    try {
      const resp = await scheduleApi.patchSettings({ notify: draft })
      onSaved(resp.settings)
      setDraft(cloneNotify(resp.settings.notify))
      toast.showSuccess('通知设置已保存')
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }, [draft, onSaved, toast])

  const testChannel = useCallback(async (channel: 'webhook' | 'email', webhookId?: string) => {
    setTesting(channel)
    try {
      await saveNotify()
      await scheduleApi.testNotify({ channel, webhook_id: webhookId })
      toast.showSuccess(channel === 'webhook' ? '测试 Webhook 已发送' : '测试邮件已发送')
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '发送测试失败')
    } finally {
      setTesting(null)
    }
  }, [saveNotify, toast])

  const notifyOnLabel: Record<ScheduleNotifyOn, string> = {
    always: '每次执行',
    success: '仅成功时',
    failure: '仅失败时',
  }

  const emailFormatLabel: Record<ScheduleEmailFormat, string> = {
    text: '纯文本',
    html: 'HTML',
    both: '纯文本 + HTML',
  }

  const smtp = draft.smtp ?? defaultSmtp()

  return (
    <div className={s.block}>
      <SettingsSectionLabel>通知</SettingsSectionLabel>
      <Text className={s.hint} block>
        任务执行结束后，可通过 Webhook 或邮件告知结果。SMTP 与 Webhook 均在此配置。
      </Text>
      <SettingsGroup>
        <SettingsRow
          title="启用通知"
          desc="关闭后，除非单任务单独开启，否则不会发送"
          control={(
            <Switch
              checked={draft.enabled}
              onChange={(_, data) => setDraft(prev => ({ ...prev, enabled: Boolean(data.checked) }))}
              aria-label="启用通知"
            />
          )}
        />
        <SettingsRow
          title="默认触发条件"
          desc="未单独配置的任务将按此规则通知"
          control={(
            <Dropdown
              value={notifyOnLabel[draft.notify_on]}
              selectedOptions={[draft.notify_on]}
              onOptionSelect={(_, data) => {
                const v = data.optionValue as ScheduleNotifyOn | undefined
                if (v) setDraft(prev => ({ ...prev, notify_on: v }))
              }}
            >
              <Option value="failure">仅失败时</Option>
              <Option value="success">仅成功时</Option>
              <Option value="always">每次执行</Option>
            </Dropdown>
          )}
        />
        <SettingsRow
          title="允许 HTTP Webhook"
          desc="默认仅允许 HTTPS；内网部署可开启 HTTP"
          control={(
            <Switch
              checked={draft.allow_http_webhooks}
              onChange={(_, data) => setDraft(prev => ({
                ...prev,
                allow_http_webhooks: Boolean(data.checked),
              }))}
              aria-label="允许 HTTP Webhook"
            />
          )}
          last
        />
      </SettingsGroup>

      <SettingsSectionLabel>Webhook</SettingsSectionLabel>
      <SettingsGroup>
        <div className={s.fieldStack}>
          {draft.webhooks.length === 0 ? (
            <Text className={s.hint}>尚未添加 Webhook</Text>
          ) : draft.webhooks.map((hook, index) => (
            <div key={hook.id} className={s.webhookCard}>
              <Input
                value={hook.url}
                placeholder="https://example.com/hooks/opptrix"
                onChange={(_, data) => {
                  const url = data.value
                  setDraft(prev => ({
                    ...prev,
                    webhooks: prev.webhooks.map((w, i) => (i === index ? { ...w, url } : w)),
                  }))
                }}
              />
              <Input
                value={hook.secret ?? ''}
                type="password"
                placeholder={`签名密钥（可选，留空保留原值：${SECRET_PLACEHOLDER}）`}
                onChange={(_, data) => {
                  const secret = data.value
                  setDraft(prev => ({
                    ...prev,
                    webhooks: prev.webhooks.map((w, i) => (i === index ? { ...w, secret } : w)),
                  }))
                }}
              />
              <div className={s.rowActions}>
                <Switch
                  checked={hook.enabled}
                  label="启用"
                  onChange={(_, data) => {
                    setDraft(prev => ({
                      ...prev,
                      webhooks: prev.webhooks.map((w, i) => (
                        i === index ? { ...w, enabled: Boolean(data.checked) } : w
                      )),
                    }))
                  }}
                />
                <OpptrixButton
                  variant="secondary"
                  size="small"
                  disabled={testing !== null}
                  onClick={() => { void testChannel('webhook', hook.id) }}
                >
                  {testing === 'webhook' ? '发送中…' : '发送测试'}
                </OpptrixButton>
                <OpptrixButton
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    setDraft(prev => ({
                      ...prev,
                      webhooks: prev.webhooks.filter((_, i) => i !== index),
                    }))
                  }}
                >
                  删除
                </OpptrixButton>
              </div>
            </div>
          ))}
          <OpptrixButton
            variant="secondary"
            disabled={draft.webhooks.length >= MAX_WEBHOOKS}
            onClick={() => setDraft(prev => ({
              ...prev,
              webhooks: [...prev.webhooks, newWebhook()],
            }))}
          >
            添加 Webhook
          </OpptrixButton>
        </div>
      </SettingsGroup>

      <SettingsSectionLabel>邮件</SettingsSectionLabel>
      <SettingsGroup>
        <SettingsRow
          title="启用邮件通知"
          desc="使用下方 SMTP 发送执行结果"
          control={(
            <Switch
              checked={draft.email_enabled}
              onChange={(_, data) => setDraft(prev => ({
                ...prev,
                email_enabled: Boolean(data.checked),
              }))}
              aria-label="启用邮件通知"
            />
          )}
        />
        <div className={s.fieldStack}>
          <Textarea
            resize="vertical"
            placeholder="收件人，每行一个邮箱"
            value={draft.email_to.join('\n')}
            onChange={(_, data) => {
              const email_to = data.value
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(Boolean)
              setDraft(prev => ({ ...prev, email_to }))
            }}
          />
          <Input
            value={smtp.host}
            placeholder="SMTP 服务器，例如 smtp.example.com"
            onChange={(_, data) => setDraft(prev => ({
              ...prev,
              smtp: { ...(prev.smtp ?? defaultSmtp()), host: data.value },
            }))}
          />
          <Input
            value={String(smtp.port)}
            placeholder="端口，例如 587"
            onChange={(_, data) => {
              const port = Number.parseInt(data.value, 10)
              setDraft(prev => ({
                ...prev,
                smtp: {
                  ...(prev.smtp ?? defaultSmtp()),
                  port: Number.isFinite(port) ? port : 587,
                },
              }))
            }}
          />
          <SettingsRow
            title="使用 TLS/SSL"
            desc="465 等端口通常需要开启"
            control={(
              <Switch
                checked={smtp.secure}
                onChange={(_, data) => setDraft(prev => ({
                  ...prev,
                  smtp: {
                    ...(prev.smtp ?? defaultSmtp()),
                    secure: Boolean(data.checked),
                  },
                }))}
              />
            )}
          />
          <Input
            value={smtp.user}
            placeholder="SMTP 用户名（可选）"
            onChange={(_, data) => setDraft(prev => ({
              ...prev,
              smtp: { ...(prev.smtp ?? defaultSmtp()), user: data.value },
            }))}
          />
          <Input
            value={smtp.password}
            type="password"
            placeholder={`SMTP 密码（留空保留原值：${SECRET_PLACEHOLDER}）`}
            onChange={(_, data) => setDraft(prev => ({
              ...prev,
              smtp: { ...(prev.smtp ?? defaultSmtp()), password: data.value },
            }))}
          />
          <Input
            value={smtp.from}
            placeholder="发件人地址，例如 notify@example.com"
            onChange={(_, data) => setDraft(prev => ({
              ...prev,
              smtp: { ...(prev.smtp ?? defaultSmtp()), from: data.value },
            }))}
          />
          <Dropdown
            value={emailFormatLabel[smtp.email_format]}
            selectedOptions={[smtp.email_format]}
            onOptionSelect={(_, data) => {
              const v = data.optionValue as ScheduleEmailFormat | undefined
              if (!v) return
              setDraft(prev => ({
                ...prev,
                smtp: { ...(prev.smtp ?? defaultSmtp()), email_format: v },
              }))
            }}
          >
            <Option value="both">纯文本 + HTML</Option>
            <Option value="text">纯文本</Option>
            <Option value="html">HTML</Option>
          </Dropdown>
          <div className={s.rowActions}>
            <OpptrixButton
              variant="secondary"
              disabled={testing !== null}
              onClick={() => { void testChannel('email') }}
            >
              {testing === 'email' ? '发送中…' : '发送测试邮件'}
            </OpptrixButton>
          </div>
        </div>
      </SettingsGroup>

      <div className={s.rowActions}>
        <OpptrixButton variant="primary" disabled={saving} onClick={() => { void saveNotify() }}>
          {saving ? <Spinner size="tiny" /> : '保存通知设置'}
        </OpptrixButton>
      </div>
    </div>
  )
}
