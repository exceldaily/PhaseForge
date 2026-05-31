import Image from 'next/image'
import { cn } from '@/lib/utils'

const LOGO_ASSETS = {
  icon: {
    src: '/branding/ganttic-app-icon.png',
    width: 165,
    height: 160,
  },
  lockup: {
    src: '/branding/ganttic-horizontal-lockup.png',
    width: 586,
    height: 170,
  },
} as const

interface GantticLogoProps {
  variant?: keyof typeof LOGO_ASSETS
  width?: number
  priority?: boolean
  alt?: string
  className?: string
}

export function GantticLogo({
  variant = 'lockup',
  width,
  priority = false,
  alt = 'Ganttic logo',
  className,
}: GantticLogoProps) {
  const asset = LOGO_ASSETS[variant]
  const resolvedWidth = width ?? asset.width
  const resolvedHeight = Math.round((resolvedWidth / asset.width) * asset.height)

  return (
    <Image
      src={asset.src}
      alt={alt}
      width={resolvedWidth}
      height={resolvedHeight}
      priority={priority}
      className={cn('h-auto w-auto max-w-full', className)}
    />
  )
}
