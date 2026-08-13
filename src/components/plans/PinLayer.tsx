'use client'

// Located comment pins on a sheet. Pins are sheet-level (they carry the
// revision they were placed on) and are architected as future link points for
// tasks/RFIs/punch items via linked_type/linked_id.

import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanPin } from '@/types/plans'
import type { ViewTransform } from './PlanCanvas'

export function PinLayer({ t, pins, activePinId, onPinClick, showResolved }: {
  t: ViewTransform
  pins: PlanPin[]
  activePinId: string | null
  onPinClick: (pin: PlanPin) => void
  showResolved: boolean
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {pins
        .filter((p) => showResolved || p.status === 'open')
        .map((pin) => {
          const pos = t.toScreen(pin.x, pin.y)
          const active = activePinId === pin.id
          return (
            <button
              key={pin.id}
              className={cn(
                'absolute pointer-events-auto -translate-x-1/2 -translate-y-full transition-transform',
                active && 'scale-125 z-10',
              )}
              style={{ left: pos.x, top: pos.y }}
              onClick={(e) => { e.stopPropagation(); onPinClick(pin) }}
              onPointerDown={(e) => e.stopPropagation()}
              title={pin.note}
            >
              <MapPin
                size={active ? 30 : 26}
                className={cn(
                  'drop-shadow-md',
                  pin.status === 'resolved' ? 'text-emerald-500' : 'text-rose-500',
                )}
                fill="currentColor"
                strokeWidth={1.5}
                stroke="#ffffff"
              />
            </button>
          )
        })}
    </div>
  )
}
