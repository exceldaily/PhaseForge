import { cn } from '@/lib/utils'
import { forwardRef, InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  className, label, error, icon, id, ...props
}, ref) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            'transition-all',
            icon && 'pl-10',
            error && 'border-rose-500 focus:ring-rose-500',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  )
})

Input.displayName = 'Input'
