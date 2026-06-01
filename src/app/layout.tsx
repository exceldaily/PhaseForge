import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PwaRegister } from '@/components/PwaRegister'

export const metadata: Metadata = {
  title: 'Ganttic - Project Management',
  description: 'Professional Gantt chart project management for construction teams',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ganttic',
  },
  icons: {
    icon: '/branding/ganttic-app-icon.png',
    shortcut: '/branding/ganttic-app-icon.png',
    apple: '/branding/ganttic-app-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
