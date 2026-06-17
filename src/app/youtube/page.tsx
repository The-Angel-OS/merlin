'use client'
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, ExternalLink, Save, Sparkles, Youtube } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoRecord { id: string; title: string; description: string; publishedAt: string; viewCount: string; likeCount: string; thumbnailUrl: string; duration: string; status: string }
interface ChannelStats { title: string; subscriberCount: string; viewCount: string; videoCount: string; thumbnailUrl: string }

export default function YouTubePage() {
  const [channel, setChannel] = useState<ChannelStats | null>(null)
  const [videos, setVideos] = useState<VideoRecord[]>([])
  const [template, setTemplate] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<VideoRecord | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/youtube/channel').then(r => r.json()).catch(() => null),
      fetch('/api/youtube/videos').then(r => r.json()).catch(() => ({ videos: [] })),
      fetch('/api/youtube/template').then(r => r.json()).catch(() => ({ description: '' })),
    ]).then(([ch, vids, tmpl]) => {
      if (ch && !ch.error) setChannel(ch)
      setVideos(vids.videos || [])
      setTemplate(tmpl.description || '')
      setLoading(false)
    })
  }, [])

  const saveVideo = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/youtube/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: selected.id, title: editTitle, description: editDesc }),
      }).then(r => r.json())
      setMsg(res.success ? '✓ Saved to YouTube' : `✗ ${res.error}`)
    } catch { setMsg('✗ Save failed') }
    setSaving(false)
    setTimeout(() => setMsg(''), 4000)
  }

  const saveTemplate = async () => {
    await fetch('/api/youtube/template', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: template }),
    })
    setMsg('✓ Master template saved')
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber mb-1">
            ── YouTube · Content · Template
          </div>
          <h1 className="text-2xl font-mono font-semibold">YouTube Command Center</h1>
        </div>
        <Badge variant={channel ? 'online' : 'warning'}>
          <Youtube className="size-2.5" />
          {channel ? 'Connected' : 'Configure in Keys'}
        </Badge>
      </div>

      {msg && (
        <Card className="border-lcars-amber/40 bg-lcars-amber/5">
          <CardContent className="py-2 text-xs text-lcars-amber font-mono">{msg}</CardContent>
        </Card>
      )}

      {/* Channel stats */}
      {channel && (
        <Card>
          <CardContent className="flex items-center gap-4 py-2">
            {channel.thumbnailUrl && <img src={channel.thumbnailUrl} alt="" className="size-12 rounded-full border border-lcars-amber/30" />}
            <div className="flex-1">
              <div className="font-mono text-sm text-foreground">{channel.title}</div>
              <div className="flex gap-4 mt-1 text-[10px] font-mono uppercase text-muted-foreground">
                <span>Subs · <span className="text-lcars-amber">{parseInt(channel.subscriberCount).toLocaleString()}</span></span>
                <span>Views · <span className="text-lcars-amber">{parseInt(channel.viewCount).toLocaleString()}</span></span>
                <span>Videos · <span className="text-lcars-amber">{channel.videoCount}</span></span>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="https://studio.youtube.com" target="_blank" rel="noopener noreferrer">
                Studio <ExternalLink className="size-3" />
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Video list */}
        <Card className="p-0 gap-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
            <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber">
              Videos · {videos.length}
            </div>
            <button
              onClick={() => fetch('/api/youtube/videos?refresh=1').then(r => r.json()).then(d => setVideos(d.videos || []))}
              className="text-[10px] font-mono uppercase text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <RefreshCw className="size-3" /> Refresh
            </button>
          </div>
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading...</div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-border/30">
              {videos.map(v => (
                <button
                  key={v.id}
                  onClick={() => { setSelected(v); setEditTitle(v.title); setEditDesc(v.description) }}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 text-left transition border-l-2',
                    selected?.id === v.id
                      ? 'border-lcars-amber bg-lcars-amber/5'
                      : 'border-transparent hover:bg-accent/30 hover:border-border',
                  )}
                >
                  {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-16 h-10 rounded object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground truncate">{v.title}</div>
                    <div className="flex gap-3 mt-0.5 text-[10px] font-mono text-muted-foreground">
                      <span>{parseInt(v.viewCount).toLocaleString()} views</span>
                      <span>{v.likeCount} likes</span>
                      <span>{new Date(v.publishedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </button>
              ))}
              {!videos.length && (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No videos loaded. Configure YouTube API key in <a href="/keys" className="text-lcars-amber">Keys</a>.
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Editor / template */}
        <Card>
          <CardContent className="space-y-3">
            {selected ? (
              <>
                <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber flex items-center justify-between">
                  <span>Edit · {selected.id}</span>
                  <a href={`https://www.youtube.com/watch?v=${selected.id}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="size-3" />
                  </a>
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground mb-1 block">Title</label>
                  <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-mono uppercase text-muted-foreground">Description</label>
                    <button onClick={() => setEditDesc(template)} className="text-[10px] font-mono uppercase text-lcars-amber hover:text-lcars-orange flex items-center gap-1">
                      <Sparkles className="size-3" /> Apply Master
                    </button>
                  </div>
                  <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={14} className="font-mono text-xs" />
                  <div className="flex justify-between mt-1 text-[10px] font-mono">
                    <span className="text-muted-foreground">{editDesc.length} / 5000</span>
                    {editDesc.length > 5000 && <span className="text-red-400">Over limit</span>}
                  </div>
                </div>
                <Button onClick={saveVideo} disabled={saving} variant="lcars" className="w-full">
                  <Save className="size-4" />
                  {saving ? 'Saving...' : 'Save to YouTube'}
                </Button>
              </>
            ) : (
              <>
                <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-amber">
                  Master Description Template
                </div>
                <Textarea
                  value={template}
                  onChange={e => setTemplate(e.target.value)}
                  rows={20}
                  className="font-mono text-xs"
                  placeholder="Write your master description template..."
                />
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground">{template.length} chars</span>
                  {template.length > 5000 && <span className="text-red-400">Over YouTube limit</span>}
                </div>
                <Button onClick={saveTemplate} variant="lcars" className="w-full">
                  <Save className="size-4" /> Save Master Template
                </Button>
                <p className="text-[10px] text-muted-foreground">Select a video on the left to apply this template.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
