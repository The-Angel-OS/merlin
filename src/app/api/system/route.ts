import { NextResponse } from 'next/server'
import { getIncidents, getFiles, getLog } from '@/lib/store'
import { checkAngelsStatus } from '@/lib/angels'
import os from 'os'

export async function GET() {
  const [angelsStatus] = await Promise.all([
    checkAngelsStatus(),
  ])

  const openIncidents = getIncidents('open')
  const newFiles = getFiles('new')
  const recentLogs = getLog(10)

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
    incidents: { open: openIncidents.length, list: openIncidents.slice(0, 5) },
    inbox: { new: newFiles.length },
    recentActivity: recentLogs,
    timestamp: new Date().toISOString(),
  })
}
