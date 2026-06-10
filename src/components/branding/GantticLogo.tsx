import Image from 'next/image'
import { cn } from '@/lib/utils'
import { BRAND_ICON_SRC, BRAND_LOCKUP_SRC } from '@/lib/branding'

const LOGO_ASSETS = {
  icon: {
    src: BRAND_ICON_SRC,
    width: 360,
    height: 370,
  },
  lockup: {
    src: BRAND_LOCKUP_SRC,
    width: 950,
    height: 380,
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
  alt = 'PhaseForge logo',
  className,
}: GantticLogoProps) {
  const asset = LOGO_ASSETS[variant]
  const resolvedWidth = width ?? asset.width
  const resolvedHeight = Math.round((resolvedWidth / asset.width) * asset.height)

  return (
    <div className="flex items-center justify-center overflow-visible">
      <Image
        src={asset.src}
        alt={alt}
        width={resolvedWidth}
        height={resolvedHeight}
        priority={priority}
        className={cn('h-auto w-auto max-w-full object-contain', className)}
        style={{ width: resolvedWidth, height: resolvedHeight }}
      />
    </div>
  )
}
