import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
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
      <body className="h-full">
        {/* Apply saved theme before paint to avoid a flash of the wrong theme.
            Plan enforcement (Pro-and-up) happens client-side in AppShell.
            next/script beforeInteractive hoists this into <head> and avoids
            the "script tag rendered as a React component" console warning
            that a raw <script> in the tree triggers on client navigations. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{if(location.pathname.indexOf('/app')===0&&localStorage.getItem('pf-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
