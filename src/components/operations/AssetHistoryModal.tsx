'use client'

// Equipment service history: every reading recorded for an asset, with the
// trade-specific labels/units and any photos attached to each entry.

import { useEffect, useState } from 'react'
import { Camera, Gauge } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { readingFieldsForTrade } from '@/lib/operations/readings'
import { timeAgo } from '@/components/operations/shared'
import type { Asset, AssetReading, OrgFile } from '@/lib/operations/types'

export function AssetHistoryModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [readings, setReadings] = useState<AssetReading[]>([])
  const [photos, setPhotos] = useState<Map<string, OrgFile[]>>(new Map())
  const [loading, setLoading] = useState(true)

  const fields = readingFieldsForTrade(asset.trade_category)
  const labelFor = (key: string) => fields.find((f) => f.key === key)?.label ?? key.replace(/_/g, ' ')
  const unitFor = (key: string) => fields.find((f) => f.key === key)?.unit

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    async function load() {
      const { data: rows } = await supabase
        .from('asset_readings')
        .select('*')
        .eq('asset_id', asset.id)
        .order('recorded_at', { ascending: false })
        .limit(50)
      if (cancelled) return
      const list = rows ?? []
      setReadings(list)
      if (list.length) {
        const { data: files } = await supabase
          .from('org_files')
          .select('*')
          .eq('record_type', 'asset_reading')
          .in('record_id', list.map((r) => r.id))
        if (cancelled) return
        const byReading = new Map<string, OrgFile[]>()
        for (const f of files ?? []) {
          const arr = byReading.get(f.record_id!) ?? []
          arr.push(f)
          byReading.set(f.record_id!, arr)
        }
        setPhotos(byReading)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [asset.id])

  async function openPhoto(f: OrgFile) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('org-files').createSignedUrl(f.storage_path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <Modal open onClose={onClose} title={asset.name} size="lg">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {asset.trade_category && <span className="uppercase">{asset.trade_category}</span>}
        {(asset.make || asset.model) && <span>{[asset.make, asset.model].filter(Boolean).join(' / ')}</span>}
        {asset.serial_number && <span>S/N {asset.serial_number}</span>}
        {asset.warranty_end && <span>Warranty ends {asset.warranty_end}</span>}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">Loading service history…</p>
      ) : readings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center">
          <Gauge size={24} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500">No readings recorded yet.</p>
          <p className="mt-1 text-xs text-slate-400">Techs record equipment updates from the call they&apos;re running — open a call linked to this asset.</p>
        </div>
      ) : (
        <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
          {readings.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-1.5 text-[11px] text-slate-400">
                {new Date(r.recorded_at).toLocaleString()} · {timeAgo(r.recorded_at)}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {Object.entries(r.readings).map(([k, v]) => (
                  <span key={k} className="text-slate-600 dark:text-slate-300">
                    {labelFor(k)}: <span className="font-semibold text-slate-800 dark:text-slate-100">{v}{unitFor(k) ? ` ${unitFor(k)}` : ''}</span>
                  </span>
                ))}
              </div>
              {r.notes && <p className="mt-1.5 text-xs italic text-slate-500">{r.notes}</p>}
              {(photos.get(r.id)?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {photos.get(r.id)!.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => openPhoto(f)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700"
                    >
                      <Camera size={11} /> {f.file_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
