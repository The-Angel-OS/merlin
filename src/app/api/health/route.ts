import { NextResponse } from 'next/server'
import { getLog, getFiles, getIncidents } from '@/lib/store'
import { getListenerCount } from '@/lib/watcher'

export async function GET() {
  const openIncidents = getIncidents('open').length
  const newFiles = getFiles('new').length

  return NextResponse.json({
    status: 'ok',
    service: 'Merlin Media Server',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    stats: {
      openIncidents,
      newFiles,
      watchListeners: getListenerCount(),
      recentLogs: getLog(5).length,
    },
  })
}
