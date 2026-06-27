import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import SidebarLayout from '@/components/SidebarLayout'
import './globals.css'

export const metadata: Metadata = {
  title: 'Merlin — Angel OS Media Server',
  description: 'Angel OS media server · Offline-first · Ad Astra',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Merlin' },
}

export const viewport: Viewport = {
  themeColor: '#0a0a14',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans overflow-x-hidden">
        {/* Deep-space fixed backdrop — two-layer radial glow + scan lines */}
        <div className="fixed inset-0 -z-20 bg-[linear-gradient(to_bottom,#06060f,#0a0a14,#0d0d1a)]" />
        <div className="fixed inset-0 -z-19 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(245,166,35,0.07),transparent),radial-gradient(ellipse_60%_40%_at_80%_80%,rgba(68,136,204,0.07),transparent),radial-gradient(ellipse_50%_50%_at_20%_50%,rgba(153,119,170,0.05),transparent)]" />
        <div className="fixed inset-0 -z-18 scan-overlay pointer-events-none opacity-30" />

        <SidebarLayout>
          {children}
        </SidebarLayout>
      </body>
    </html>
  )
}
