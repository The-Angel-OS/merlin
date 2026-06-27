import { NextRequest } from 'next/server'
import { stat, createReadStream } from 'fs'
import { resolve } from 'path'
import { promisify } from 'util'
import { isPathAllowed } from '@/lib/media-roots'
import { isVideoPath, getOrCreateVideoThumb } from '@/lib/video-thumbnail'

export const runtime = 'nodejs'

const statAsync = promisify(stat)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const filePath = searchParams.get('file')

  if (!filePath) {
    return new Response('File path required', { status: 400 })
  }

  const requested = resolve(filePath)
  if (!isPathAllowed(requested)) {
    return new Response('Access denied', { status: 403 })
  }

  try {
    const stats = await statAsync(requested)

    if (!stats.isFile()) {
      return new Response('Invalid file', { status: 400 })
    }

    // For videos with no sibling poster, lazily generate + cache a frame and
    // serve that JPEG instead of the (unstreamable-as-image) video bytes.
    let absolute = requested
    if (isVideoPath(requested)) {
      try {
        absolute = await getOrCreateVideoThumb(requested)
      } catch (e) {
        console.error('Thumbnail generation failed:', e)
        return new Response('Thumbnail unavailable', { status: 502 })
      }
    }

    // Size of the file we actually serve (cached jpg differs from the video).
    const served = absolute === requested ? stats : await statAsync(absolute)
    const stream = createReadStream(absolute)

    // Determine content type from extension
    const lc = absolute.toLowerCase()
    let contentType = 'image/jpeg'
    if (lc.endsWith('.png')) contentType = 'image/png'
    else if (lc.endsWith('.webp')) contentType = 'image/webp'
    else if (lc.endsWith('.gif')) contentType = 'image/gif'
    else if (lc.endsWith('.bmp')) contentType = 'image/bmp'
    else if (lc.endsWith('.heic')) contentType = 'image/heic'
    else if (lc.endsWith('.heif')) contentType = 'image/heif'

    return new Response(stream as any, {
      status: 200,
      headers: {
        'Content-Length': served.size.toString(),
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error serving thumbnail:', error)
    return new Response('Error serving thumbnail', { status: 500 })
  }
}

