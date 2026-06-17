/**
 * youtube.ts — YouTube Data API v3 client
 * Read: API key
 * Write: OAuth2 (client_id + client_secret + refresh_token)
 */
import { getSettings, setYouTubeCache, getYouTubeCache, appendLog, VideoRecord, ChannelStats } from './store'

const YT_BASE = 'https://www.googleapis.com/youtube/v3'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min

async function getAccessToken(): Promise<string | null> {
  const s = getSettings()
  if (!s.youtubeClientId || !s.youtubeClientSecret || !s.youtubeRefreshToken) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: s.youtubeClientId,
      client_secret: s.youtubeClientSecret,
      refresh_token: s.youtubeRefreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string; error?: string }
  if (data.error) {
    appendLog({ type: 'error', source: 'youtube', message: `OAuth2 token refresh failed: ${data.error}` })
    return null
  }
  return data.access_token || null
}

export async function fetchChannelStats(): Promise<ChannelStats | null> {
  const s = getSettings()
  if (!s.youtubeApiKey && !s.youtubeChannelId) return null

  // Check cache
  const cache = getYouTubeCache()
  if (cache.channel && cache.updatedAt) {
    const age = Date.now() - new Date(cache.updatedAt).getTime()
    if (age < CACHE_TTL_MS) return cache.channel
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet,statistics',
      mine: 'true',
      ...(s.youtubeChannelId ? { id: s.youtubeChannelId } : {}),
      key: s.youtubeApiKey,
    })

    const res = await fetch(`${YT_BASE}/channels?${params}`)
    const data = await res.json() as any

    if (!data.items?.length) return null

    const item = data.items[0]
    const stats: ChannelStats = {
      title: item.snippet.title,
      subscriberCount: item.statistics.subscriberCount || '0',
      viewCount: item.statistics.viewCount || '0',
      videoCount: item.statistics.videoCount || '0',
      thumbnailUrl: item.snippet.thumbnails?.default?.url || '',
      updatedAt: new Date().toISOString(),
    }

    setYouTubeCache({ channel: stats })
    return stats
  } catch (err) {
    appendLog({ type: 'error', source: 'youtube', message: `fetchChannelStats failed: ${err}` })
    return null
  }
}

export async function fetchVideos(maxResults = 50, forceRefresh = false): Promise<VideoRecord[]> {
  const s = getSettings()
  if (!s.youtubeApiKey) return []

  const cache = getYouTubeCache()
  if (!forceRefresh && cache.videos && cache.updatedAt) {
    const age = Date.now() - new Date(cache.updatedAt).getTime()
    if (age < CACHE_TTL_MS) return cache.videos
  }

  try {
    // Step 1: list video IDs
    const searchParams = new URLSearchParams({
      part: 'snippet',
      forMine: 'true',
      type: 'video',
      order: 'date',
      maxResults: maxResults.toString(),
      key: s.youtubeApiKey,
    })
    if (s.youtubeChannelId) searchParams.set('channelId', s.youtubeChannelId)

    const searchRes = await fetch(`${YT_BASE}/search?${searchParams}`)
    const searchData = await searchRes.json() as any

    if (!searchData.items?.length) return []

    const ids = searchData.items.map((i: any) => i.id.videoId).filter(Boolean).join(',')

    // Step 2: get full video details
    const videoParams = new URLSearchParams({
      part: 'snippet,statistics,contentDetails,status',
      id: ids,
      key: s.youtubeApiKey,
    })
    const videoRes = await fetch(`${YT_BASE}/videos?${videoParams}`)
    const videoData = await videoRes.json() as any

    const videos: VideoRecord[] = (videoData.items || []).map((item: any) => ({
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      viewCount: item.statistics?.viewCount || '0',
      likeCount: item.statistics?.likeCount || '0',
      commentCount: item.statistics?.commentCount || '0',
      thumbnailUrl: item.snippet.thumbnails?.medium?.url || '',
      duration: item.contentDetails?.duration || '',
      status: item.status?.privacyStatus || 'public',
    }))

    setYouTubeCache({ videos })
    return videos
  } catch (err) {
    appendLog({ type: 'error', source: 'youtube', message: `fetchVideos failed: ${err}` })
    return cache.videos || []
  }
}

export async function updateVideoDescription(videoId: string, title: string, description: string): Promise<boolean> {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    appendLog({ type: 'error', source: 'youtube', message: `Cannot update ${videoId}: no OAuth2 token` })
    return false
  }

  try {
    const res = await fetch(`${YT_BASE}/videos?part=snippet`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: videoId,
        snippet: { title, description, categoryId: '22' },
      }),
    })

    if (!res.ok) {
      const err = await res.json() as any
      appendLog({ type: 'error', source: 'youtube', message: `Update failed for ${videoId}: ${JSON.stringify(err.error?.message)}` })
      return false
    }

    appendLog({ type: 'youtube_update', source: 'youtube', message: `Updated description for: ${title}`, metadata: { videoId } })
    // Invalidate cache
    setYouTubeCache({ videos: undefined, updatedAt: undefined })
    return true
  } catch (err) {
    appendLog({ type: 'error', source: 'youtube', message: `updateVideoDescription exception: ${err}` })
    return false
  }
}

export function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return iso
  const h = parseInt(match[1] || '0')
  const m = parseInt(match[2] || '0')
  const s = parseInt(match[3] || '0')
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}
