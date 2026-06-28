'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PencilLine, Save, Trash2, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { deleteOwnAccount } from '@/app/app/settings/actions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Profile } from '@/types/app'
import { ROLE_LABELS, ROLE_COLORS as ROLE_COLOR_MAP } from '@/lib/constants'

const ROLE_COLORS: Record<string, string> = ROLE_COLOR_MAP

function formatRole(role: string) {
  return ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1)
}

interface ProfileSettingsCardProps {
  profile: Profile
  canManageRoles: boolean
}

export function ProfileSettingsCard({ profile, canManageRoles }: ProfileSettingsCardProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [currentProfile, setCurrentProfile] = useState(profile)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [form, setForm] = useState({
    full_name: profile.full_name,
    job_title: profile.job_title || '',
  })

  const setField = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }))
  }

  const handleCancel = () => {
    setEditing(false)
    setError('')
    setForm({
      full_name: currentProfile.full_name,
      job_title: currentProfile.job_title || '',
    })
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setError('Name is required.')
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        job_title: form.job_title.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentProfile.id)
      .select()
      .single()

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    if (data) {
      setCurrentProfile(data as Profile)
    }

    setEditing(false)
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50">
            <UserRound size={20} className="text-sky-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Your profile</h2>
            <p className="text-sm text-slate-500">Keep your name and title up to date.</p>
          </div>
        </div>

        <Button
          variant={editing ? 'secondary' : 'outline'}
          size="sm"
          onClick={editing ? handleCancel : () => setEditing(true)}
        >
          <PencilLine size={14} /> {editing ? 'Cancel' : 'Edit profile'}
        </Button>
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              id="profile-name"
              label="Name"
              value={form.full_name}
              onChange={setField('full_name')}
              required
            />
            <Input
              id="profile-email"
              label="Email"
              value={currentProfile.email}
              readOnly
              className="bg-slate-50 text-slate-500"
            />
            <Input
              id="profile-job-title"
              label="Job title"
              value={form.job_title}
              onChange={setField('job_title')}
              placeholder="Project manager, superintendent, estimator..."
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Role</span>
              <div className="flex h-[42px] items-center">
                <Badge className={ROLE_COLORS[currentProfile.role]}>
                  {formatRole(currentProfile.role)}
                </Badge>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {canManageRoles ? (
              <span>
                Role changes are managed in{' '}
                <Link href="/app/settings/members" className="font-medium text-indigo-600 hover:underline">
                  Team Members
                </Link>
                .
              </span>
            ) : (
              'Role changes are managed by an owner or admin.'
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} loading={saving}>
              <Save size={14} /> Save changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Name</p>
            <p className="font-medium text-slate-800">{currentProfile.full_name}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Email</p>
            <p className="font-medium text-slate-800">{currentProfile.email}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Job title</p>
            <p className="font-medium text-slate-800">{currentProfile.job_title || 'Not set'}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Role</p>
            <Badge className={ROLE_COLORS[currentProfile.role]}>
              {formatRole(currentProfile.role)}
            </Badge>
          </div>
          <div className="md:col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {canManageRoles ? (
              <span>
                Need to adjust access? Open{' '}
                <Link href="/app/settings/members" className="font-medium text-indigo-600 hover:underline">
                  Team Members
                </Link>
                .
              </span>
            ) : (
              'Your role is set by an owner or admin on your workspace.'
            )}
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div className="mt-6 border-t border-slate-100 pt-6">
        <h3 className="text-sm font-semibold text-rose-600 mb-3">Danger zone</h3>
        {!deleting ? (
          <button
            onClick={() => setDeleting(true)}
            className="flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <Trash2 size={14} /> Delete my account
          </button>
        ) : (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-3">
            <p className="text-sm text-rose-800 font-medium">This will permanently delete your account and all your data. This cannot be undone.</p>
            <p className="text-xs text-rose-700">Type your email address <strong>{currentProfile.email}</strong> to confirm:</p>
            <input
              type="email"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={currentProfile.email}
              className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
            {deleteError && <p className="text-xs text-rose-700">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setDeleting(false); setDeleteConfirm(''); setDeleteError('') }}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={deleteLoading || deleteConfirm !== currentProfile.email}
                onClick={async () => {
                  if (deleteConfirm !== currentProfile.email) return
                  setDeleteLoading(true)
                  setDeleteError('')
                  const result = await deleteOwnAccount()
                  if (result?.error) {
                    setDeleteError(result.error)
                    setDeleteLoading(false)
                  }
                }}
                className="px-3 py-2 rounded-lg bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
