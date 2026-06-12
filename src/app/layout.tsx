import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PwaRegister } from '@/components/PwaRegister'
import { Providers } from '@/app/Providers'
import { BRAND_DESCRIPTION, BRAND_ICON_SRC, BRAND_NAME, BRAND_THEME_COLOR } from '@/lib/branding'

export const metadata: Metadata = {
  title: `${BRAND_NAME} - Project Management`,
  description: BRAND_DESCRIPTION,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: BRAND_NAME,
  },
  icons: {
    icon: BRAND_ICON_SRC,
    shortcut: BRAND_ICON_SRC,
    apple: BRAND_ICON_SRC,
  },
}

export const viewport: Viewport = {
  themeColor: BRAND_THEME_COLOR,
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        <Providers>
          {children}
          <PwaRegister />
        </Providers>
      </body>
    </html>
  )
}
