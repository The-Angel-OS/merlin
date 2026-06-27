'use client'
import { Film, Circle, Square, FolderOpen } from 'lucide-react'
import { Card } from '@/components/ui/card'

export default function RecordingPage() {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-lcars-red mb-1">── Surveillance · Recording</div>
        <h1 className="text-2xl font-mono font-semibold">Recording</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Camera DVR · Clip library · Motion events</p>
      </div>
      <Card className="p-8">
        <div className="text-center space-y-3">
          <Film className="size-10 mx-auto text-muted-foreground/30" />
          <div className="text-sm font-mono text-muted-foreground">Recording Engine</div>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Continuous recording, motion detection clips, and DVR playback. Requires ffmpeg on the server host.
            Configure cameras in Surveillance → Cameras first.
          </p>
          <div className="flex flex-col items-center gap-2 text-[10px] font-mono text-muted-foreground mt-4">
            <div className="flex items-center gap-2"><Circle className="size-3 text-lcars-red" /> Motion-triggered recording</div>
            <div className="flex items-center gap-2"><Square className="size-3 text-lcars-amber" /> Continuous 24/7 DVR</div>
            <div className="flex items-center gap-2"><FolderOpen className="size-3 text-lcars-blue" /> Clip library with search</div>
          </div>
          <div className="mt-4 text-[10px] text-lcars-amber font-mono border border-lcars-amber/30 rounded px-3 py-2 bg-lcars-amber/5 inline-block">
            SPRINT 46 — Recording engine planned
          </div>
        </div>
      </Card>
    </div>
  )
}
