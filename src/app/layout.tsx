import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PwaRegister } from '@/components/PwaRegister'
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
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Apply saved theme before paint to avoid a flash of the wrong theme.
            Plan enforcement (Pro-and-up) happens client-side in AppShell. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(location.pathname.indexOf('/app')===0&&localStorage.getItem('pf-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="h-full">
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
