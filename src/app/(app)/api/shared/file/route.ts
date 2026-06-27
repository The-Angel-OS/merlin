import { NextRequest } from 'next/server'
import { stat, createReadStream } from 'fs'
import { extname } from 'path'
import { promisify } from 'util'
import { resolveSharedRef } from '@/lib/nodeSkills'

export const runtime = 'nodejs'

const statAsync = promisify(stat)

/**
 * GET /api/shared/file?ref=<rootLabel::relpath>
 *
 * Streams a file that lives inside one of this node's SHARED roots, addressed by
 * the opaque ref the directory browser holds (never an absolute system path).
 * resolveSharedRef() is the access gate — it returns null for anything outside a
 * shared root or any traversal attempt. Supports HTTP range (video scrubbing).
 *
 * This is the tunnel-backed serve endpoint: a node's advertised tunnelUrl points
 * here, so Merlin Control links open directly off the node with zero Core bandwidth.
 */
const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}

function contentTypeFor(filePath: string): string {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] || 'application/octet-stream'
}

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref')
  if (!ref) return new Response('ref required', { status: 400 })

  const resolved = resolveSharedRef(ref)
  if (!resolved) return new Response('Not found or not shared', { status: 404 })

  try {
    const stats = await statAsync(resolved.absolute)
    const fileSize = stats.size
    const contentType = contentTypeFor(resolved.absolute)
    const range = request.headers.get('range')

    const dispositionName = encodeURIComponent(resolved.name)
    const baseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Disposition': `inline; filename*=UTF-8''${dispositionName}`,
    }

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1
      const stream = createReadStream(resolved.absolute, { start, end })
      return new Response(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': String(chunkSize),
        },
      })
    }

    const stream = createReadStream(resolved.absolute)
    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(fileSize) },
    })
  } catch {
    return new Response('Error streaming file', { status: 500 })
  }
}
