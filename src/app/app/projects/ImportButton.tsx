'use client'
import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ImportScheduleModal } from '@/components/import/ImportScheduleModal'

interface ImportButtonProps {
  companyId: string
  currentUserId: string
  selectedBoardId?: string | null
}

export function ImportButton({ companyId, currentUserId, selectedBoardId }: ImportButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload size={16} /> Import Schedule
      </Button>
      <ImportScheduleModal
        open={open}
        onClose={() => setOpen(false)}
        companyId={companyId}
        currentUserId={currentUserId}
        selectedBoardId={selectedBoardId}
      />
    </>
  )
}
