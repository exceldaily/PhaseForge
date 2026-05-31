import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ganttic - Project Management',
  description: 'Professional Gantt chart project management for teams',
  icons: {
    icon: '/branding/ganttic-app-icon.png',
    shortcut: '/branding/ganttic-app-icon.png',
    apple: '/branding/ganttic-app-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  )
}
