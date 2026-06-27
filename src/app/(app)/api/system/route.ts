import { NextResponse } from 'next/server'
import { getIncidents, getFiles, getLog, getSettings } from '@/lib/store'
import { checkAngelsStatus } from '@/lib/angels'
import os from 'os'

export async function GET() {
  const [angelsStatus] = await Promise.all([
    checkAngelsStatus(),
  ])

  const [openIncidents, newFiles, recentLogs] = await Promise.all([
    getIncidents('open'),
    getFiles('new'),
    getLog(10),
  ])

  // The AUTHORITATIVE node binding — which Endeavor this Merlin is locked onto.
  // This is the single source of truth for "connected" (the autonomous heartbeat
  // runs off it, independent of any browser session). Everything in the UI should
  // subscribe to THIS, not localStorage, so the whole screen agrees. (Ponytail.)
  const s = getSettings()
  const tokenValid = Boolean(s.nodeToken && (!s.nodeTokenExpiresAt || new Date(s.nodeTokenExpiresAt).getTime() > Date.now()))
  const binding = {
    lockedOn: Boolean(s.boundEndeavor),
    endeavor: s.boundEndeavor || null,
    angelsUrl: s.boundAngelsUrl || s.angelsApiUrl || null,
    channel: s.busChannel || null,
    tokenValid,
  }

  return NextResponse.json({
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        rss: process.memoryUsage().rss,
      },
      cpus: os.cpus().length,
      hostname: os.hostname(),
      localIp: Object.values(os.networkInterfaces())
        .flat()
        .find(n => n?.family === 'IPv4' && !n.internal)?.address || 'unknown',
    },
    angels: angelsStatus,
    binding,
    incidents: { open: openIncidents.length, list: openIncidents.slice(0, 5) },
    inbox: { new: newFiles.length },
    recentActivity: recentLogs,
    timestamp: new Date().toISOString(),
  })
}
