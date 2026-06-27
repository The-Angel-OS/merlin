import { NextResponse } from 'next/server'
import { getLog, getFiles, getIncidents } from '@/lib/store'
import { getListenerCount } from '@/lib/watcher'

export async function GET() {
  const [openIncidents, newFiles, recentLogs] = await Promise.all([
    getIncidents('open'),
    getFiles('new'),
    getLog(5),
  ])

  return NextResponse.json({
    status: 'ok',
    service: 'Merlin Media Server',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    stats: {
      openIncidents: openIncidents.length,
      newFiles: newFiles.length,
      watchListeners: getListenerCount(),
      recentLogs: recentLogs.length,
    },
  })
}
