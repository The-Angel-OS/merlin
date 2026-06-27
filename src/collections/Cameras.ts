import type { CollectionConfig } from 'payload'

/**
 * Cameras — configured IP cameras (was cameras.json). Connection details for
 * MJPEG/HLS/RTSP sources Merlin can stream or snapshot.
 */
export const Cameras: CollectionConfig = {
  slug: 'cameras',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'location', 'ip', 'protocol', 'enabled'],
    group: 'Node',
  },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'location', type: 'text' },
    { name: 'ip', type: 'text', required: true },
    { name: 'port', type: 'number', defaultValue: 80 },
    { name: 'username', type: 'text' },
    { name: 'password', type: 'text' },
    { name: 'mjpegPath', type: 'text', admin: { description: 'e.g. /video or /cgi-bin/mjpg/video.cgi' } },
    { name: 'snapshotPath', type: 'text', admin: { description: 'e.g. /snapshot or /cgi-bin/snapshot.cgi' } },
    { name: 'rtspUrl', type: 'text' },
    { name: 'hlsUrl', type: 'text' },
    {
      name: 'protocol',
      type: 'select',
      defaultValue: 'http',
      options: ['http', 'hls', 'rtsp'],
    },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'addedAt', type: 'date' },
  ],
}
