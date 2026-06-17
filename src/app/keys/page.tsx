'use client'
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff, Save, KeyRound, Check } from 'lucide-react'

interface KeyField { key: string; label: string; type: 'text' | 'password' | 'url'; placeholder: string; hint?: string; group: string }

const KEY_FIELDS: KeyField[] = [
  { key: 'angelsApiUrl', label: 'Angel OS URL', type: 'url', placeholder: 'https://www.spacesangels.com', hint: 'Mothership Payload CMS endpoint', group: 'Angel OS' },
  { key: 'angelsApiKey', label: 'Angel OS API Key', type: 'password', placeholder: 'Bearer token', hint: 'Payload API authentication', group: 'Angel OS' },
  { key: 'youtubeChannelId', label: 'YouTube Channel ID', type: 'text', placeholder: 'UCxxxxxxxxxxxxxxxx', hint: 'From youtube.com/channel/UC...', group: 'YouTube' },
  { key: 'youtubeApiKey', label: 'YouTube API Key', type: 'password', placeholder: 'AIzaSy...', hint: 'Google Cloud → YouTube Data API v3', group: 'YouTube' },
  { key: 'youtubeClientId', label: 'OAuth2 Client ID', type: 'text', placeholder: 'xxxx.apps.googleusercontent.com', hint: 'For write access', group: 'YouTube' },
  { key: 'youtubeClientSecret', label: 'OAuth2 Client Secret', type: 'password', placeholder: 'GOCSPX-...', hint: 'OAuth2 client secret', group: 'YouTube' },
  { key: 'youtubeRefreshToken', label: 'OAuth2 Refresh Token', type: 'password', placeholder: '1//...', hint: 'Run OAuth2 flow once to obtain', group: 'YouTube' },
  { key: 'anthropicApiKey', label: 'Anthropic API Key', type: 'password', placeholder: 'sk-ant-...', hint: 'Direct Claude API fallback when Angel OS is offline', group: 'AI' },
]

const GROUPS = ['Angel OS', 'YouTube', 'AI']

export default function KeysPage() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [configured, setConfigured] = useState<Record<string, boolean>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/keys').then(r => r.json()).then(d => {
      setValues(d.settings || {})
      setConfigured(d.configured || {})
    }).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    const updates: Record<string, string> = {}
    for (const [k, v] of Object.entries(values)) {
      if (v && !v.includes('••')) updates[k] = v
    }
    try {
      const res = await fetch('/api/keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).then(r => r.json())
      setMsg(res.success ? `✓ Saved · ${(res.updated || []).join(', ')}` : `✗ ${res.error}`)
    } catch {
      setMsg('✗ Save failed')
    }
    setSaving(false)
    setTimeout(() => setMsg(''), 4000)
    fetch('/api/keys').then(r => r.json()).then(d => { setValues(d.settings || {}); setConfigured(d.configured || {}) })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber mb-1">
          ── Credentials · Local encrypted store
        </div>
        <h1 className="text-2xl font-mono font-semibold">Keys &amp; Settings</h1>
        <p className="text-xs text-muted-foreground mt-1">
          All secrets stored in <code className="text-lcars-amber">data/settings.json</code> · Never transmitted externally.
        </p>
      </div>

      {msg && (
        <Card className="border-lcars-amber/40 bg-lcars-amber/5">
          <CardContent className="py-2 text-xs text-lcars-amber font-mono">{msg}</CardContent>
        </Card>
      )}

      {GROUPS.map(group => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-3" /> {group}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {KEY_FIELDS.filter(f => f.group === group).map(field => (
              <div key={field.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{field.label}</label>
                  {configured[field.key] && (
                    <Badge variant="online"><Check className="size-2.5" /> set</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    type={field.type === 'password' && !visible[field.key] ? 'password' : 'text'}
                    value={values[field.key] || ''}
                    onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                    placeholder={configured[field.key] ? '(current value masked)' : field.placeholder}
                    className="flex-1 font-mono text-xs"
                  />
                  {field.type === 'password' && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setVisible(v => ({ ...v, [field.key]: !v[field.key] }))}
                    >
                      {visible[field.key] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  )}
                </div>
                {field.hint && <p className="text-[10px] text-muted-foreground mt-1">{field.hint}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Button onClick={save} disabled={saving} variant="lcars" className="w-full">
        <Save className="size-4" />
        {saving ? 'Saving...' : 'Save All Settings'}
      </Button>

      {/* OAuth2 guide */}
      <Card>
        <CardHeader>
          <CardTitle>YouTube OAuth2 Setup</CardTitle>
          <CardDescription>For write access (updating video descriptions)</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
            <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-lcars-amber">console.cloud.google.com</a> → enable YouTube Data API v3</li>
            <li>Create OAuth2 credentials → Desktop app → download client_secrets.json</li>
            <li>Run OAuth flow to get refresh token</li>
            <li>Paste Client ID, Client Secret, and Refresh Token above → Save</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
