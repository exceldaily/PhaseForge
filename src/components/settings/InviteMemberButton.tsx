'use client'
import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { sendInvite } from '@/app/app/settings/members/actions'

export function InviteMemberButton({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState("They'll receive an email shortly")
  const [error, setError] = useState('')

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await sendInvite(companyId, email, role)

    setLoading(false)
    if (result.error) { setError(result.error); return }
    setSuccessMessage(result.message || "They'll receive an email shortly")
    setSuccess(true)
    setTimeout(() => {
      setOpen(false)
      setSuccess(false)
      setSuccessMessage("They'll receive an email shortly")
      setEmail('')
      setRole('member')
    }, 3000)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus size={16} /> Invite member
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Invite team member" size="sm">
        {success ? (
          <div className="py-6 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">✓</span>
            </div>
            <p className="font-medium text-slate-900">Invitation sent!</p>
            <p className="text-sm text-slate-500 mt-1">{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4">
            <Input id="inv-email" type="email" label="Email address" placeholder="colleague@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
            <Select id="inv-role" label="Role" value={role} onChange={e => setRole(e.target.value)}>
              <option value="member">Member — view projects &amp; update tasks</option>
              <option value="manager">Manager — create projects &amp; assign tasks</option>
              <option value="admin">Admin — manage teams, projects &amp; users</option>
            </Select>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="submit" loading={loading} className="flex-1">Send invitation</Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
