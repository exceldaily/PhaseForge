import { cn } from '@/lib/utils'

interface AvatarProps {
  name: string
  avatarUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const COLORS = [
  'bg-indigo-500', 'bg-violet-500', 'bg-teal-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-blue-500', 'bg-pink-500',
]

function getColor(name: string) {
  const i = name.charCodeAt(0) % COLORS.length
  return COLORS[i]
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export function Avatar({ name, avatarUrl, size = 'md', className }: AvatarProps) {
  const sizes = { xs: 'h-5 w-5 text-[10px]', sm: 'h-7 w-7 text-xs', md: 'h-8 w-8 text-sm', lg: 'h-10 w-10 text-base' }

  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name} className={cn('rounded-full object-cover', sizes[size], className)} />
    )
  }

  return (
    <div className={cn('rounded-full flex items-center justify-center text-white font-semibold', sizes[size], getColor(name), className)}>
      {getInitials(name)}
    </div>
  )
}
