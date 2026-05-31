'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DEFAULT_PHASE_TYPES = [
  'Planning', 'Permits', 'Materials', 'Mobilization', 'Demo',
  'Rough-in', 'Installation', 'Inspection', 'Punch List', 'Closeout',
  'EMS Prep', 'Refrigeration Prep', 'Case Install', 'Structural',
  'Electrical', 'Plumbing', 'HVAC', 'BAS Work', 'Commissioning',
  'Startup', 'Piping', 'Welding', 'Pressure Test', 'Flush', 'Cleanup',
]

const DEFAULT_TRADES = [
  'Electrician', 'Plumber', 'HVAC Tech', 'Refrigeration Tech',
  'Carpenter', 'Welder', 'Pipefitter', 'Controls Tech',
  'General Contractor', 'Subcontractor', 'Inspector', 'Engineer',
]

const COMPANY_PHASE_OPTIONS_TABLE = 'company_phase_options'

function storageGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}

function storageSet(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function normalizeOption(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function mergeUniqueOptions(...groups: string[][]) {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const group of groups) {
    for (const item of group) {
      const normalized = normalizeOption(item)
      const key = normalized.toLowerCase()

      if (!normalized || seen.has(key)) continue

      seen.add(key)
      merged.push(normalized)
    }
  }

  return merged
}

function findMatchingOption(options: string[], value: string) {
  const normalized = normalizeOption(value).toLowerCase()
  return options.find((option) => normalizeOption(option).toLowerCase() === normalized)
}

export function usePhaseConfig(companyId: string) {
  const typesKey  = `phase_types_${companyId}`
  const tradesKey = `phase_trades_${companyId}`

  const [phaseTypes, setPhaseTypes] = useState<string[]>(() =>
    mergeUniqueOptions(DEFAULT_PHASE_TYPES, storageGet(typesKey, [] as string[]))
  )
  const [trades, setTrades] = useState<string[]>(() =>
    mergeUniqueOptions(DEFAULT_TRADES, storageGet(tradesKey, [] as string[]))
  )

  useEffect(() => {
    let active = true

    async function loadSavedOptions() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from(COMPANY_PHASE_OPTIONS_TABLE)
        .select('kind, value')
        .eq('company_id', companyId)

      if (!active || error || !data) return

      const savedPhaseTypes = data
        .filter((option) => option.kind === 'phase_type')
        .map((option) => option.value)

      const savedTrades = data
        .filter((option) => option.kind === 'trade')
        .map((option) => option.value)

      const nextPhaseTypes = mergeUniqueOptions(DEFAULT_PHASE_TYPES, storageGet(typesKey, [] as string[]), savedPhaseTypes)
      const nextTrades = mergeUniqueOptions(DEFAULT_TRADES, storageGet(tradesKey, [] as string[]), savedTrades)

      storageSet(typesKey, nextPhaseTypes)
      storageSet(tradesKey, nextTrades)
      setPhaseTypes(nextPhaseTypes)
      setTrades(nextTrades)
    }

    void loadSavedOptions()

    return () => {
      active = false
    }
  }, [companyId, tradesKey, typesKey])

  const persistOption = useCallback((kind: 'phase_type' | 'trade', value: string) => {
    const normalized = normalizeOption(value)
    if (!normalized) return normalized

    const supabase = createClient()
    void supabase
      .from(COMPANY_PHASE_OPTIONS_TABLE)
      .upsert(
        {
          company_id: companyId,
          kind,
          value: normalized,
        },
        { onConflict: 'company_id,kind,normalized_value' }
      )

    return normalized
  }, [companyId])

  const removePersistedOption = useCallback((kind: 'phase_type' | 'trade', value: string) => {
    const normalized = normalizeOption(value)
    if (!normalized) return

    const supabase = createClient()
    void supabase
      .from(COMPANY_PHASE_OPTIONS_TABLE)
      .delete()
      .eq('company_id', companyId)
      .eq('kind', kind)
      .ilike('value', normalized)
  }, [companyId])

  const addPhaseType = useCallback((type: string) => {
    const existing = findMatchingOption(phaseTypes, type)
    if (existing) return existing

    const normalized = normalizeOption(type)
    if (!normalized) return ''

    setPhaseTypes(prev => {
      const next = mergeUniqueOptions(prev, [normalized])
      storageSet(typesKey, next)
      return next
    })
    persistOption('phase_type', normalized)
    return normalized
  }, [persistOption, phaseTypes, typesKey])

  const removePhaseType = useCallback((type: string) => {
    setPhaseTypes(prev => {
      const next = prev.filter(t => normalizeOption(t).toLowerCase() !== normalizeOption(type).toLowerCase())
      storageSet(typesKey, next)
      return next
    })
    removePersistedOption('phase_type', type)
  }, [removePersistedOption, typesKey])

  const addTrade = useCallback((trade: string) => {
    const existing = findMatchingOption(trades, trade)
    if (existing) return existing

    const normalized = normalizeOption(trade)
    if (!normalized) return ''

    setTrades(prev => {
      const next = mergeUniqueOptions(prev, [normalized])
      storageSet(tradesKey, next)
      return next
    })
    persistOption('trade', normalized)
    return normalized
  }, [persistOption, trades, tradesKey])

  const removeTrade = useCallback((trade: string) => {
    setTrades(prev => {
      const next = prev.filter(t => normalizeOption(t).toLowerCase() !== normalizeOption(trade).toLowerCase())
      storageSet(tradesKey, next)
      return next
    })
    removePersistedOption('trade', trade)
  }, [removePersistedOption, tradesKey])

  return { phaseTypes, trades, addPhaseType, removePhaseType, addTrade, removeTrade }
}
