import { NextRequest } from 'next/server'
import { stat, createReadStream } from 'fs'
import { extname, resolve } from 'path'
import { promisify } from 'util'
import { isPathAllowed } from '@/lib/media-roots'

const statAsync = promisify(stat)

// MIME map mirrors the extensions accepted by /api/movies
const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
}

function contentTypeFor(filePath: string): string {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] || 'application/octet-stream'
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const filePath = searchParams.get('file')

  if (!filePath) {
    return new Response('File path required', { status: 400 })
  }

  // Path traversal guard: file must live under one of the enabled roots
  const absolute = resolve(filePath)
  if (!isPathAllowed(absolute)) {
    return new Response('Access denied', { status: 403 })
  }

  try {
    const stats = await statAsync(absolute)
    if (!stats.isFile()) {
      return new Response('Not a file', { status: 400 })
    }
    const fileSize = stats.size
    const contentType = contentTypeFor(absolute)
    const range = request.headers.get('range')

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1

      const stream = createReadStream(absolute, { start, end })

      return new Response(stream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
        },
      })
    } else {
      const stream = createReadStream(absolute)

      return new Response(stream as any, {
        status: 200,
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        },
      })
    }
  } catch (error) {
    console.error('Error streaming video:', error)
    return new Response('Error streaming video', { status: 500 })
  }
}

