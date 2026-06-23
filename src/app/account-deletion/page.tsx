import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Account & Data Deletion — PhaseForge',
  description: 'How to request deletion of your PhaseForge account and associated data.',
}

const CONTACT = 'exceldaily7@gmail.com'

export default function AccountDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold text-slate-900">Account &amp; Data Deletion</h1>
      <p className="mt-2 text-sm text-slate-500">PhaseForge</p>

      <section className="mt-8 space-y-6 leading-relaxed">
        <p>
          You can request deletion of your PhaseForge account and the personal data associated with it
          at any time. This page explains how to make the request, what is deleted, and how long it
          takes.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">How to request deletion</h2>
        <p>
          Email{' '}
          <a className="text-indigo-600 underline" href={`mailto:${CONTACT}?subject=Delete%20my%20account`}>
            {CONTACT}
          </a>{' '}
          from the email address on your account, with the subject line{' '}
          <strong>&quot;Delete my account.&quot;</strong> We will verify the request against your account
          email before deleting anything.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">What gets deleted</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Your user profile and login credentials.</li>
          <li>Your personal information (name, email, job title).</li>
          <li>Your push-notification tokens.</li>
          <li>
            Content you created that is not required by other members of your organization. If you are the
            sole owner of a company workspace, its projects, schedules, tasks, punch-list items, and
            uploaded files are deleted as well. If your organization has other members, ownership of
            shared project data may be reassigned to your organization rather than deleted, so their work
            is preserved.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-slate-900">What we may retain</h2>
        <p>
          We may retain a limited set of records where required for legal, tax, or accounting purposes —
          for example, billing and invoice history — for the period required by law. These records are
          kept secure and are not used for any other purpose.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">How long it takes</h2>
        <p>
          We process deletion requests within <strong>30 days</strong>. Backups are purged on our normal
          backup-rotation schedule shortly thereafter.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Questions</h2>
        <p>
          For anything related to your data, contact{' '}
          <a className="text-indigo-600 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>. See also our{' '}
          <a className="text-indigo-600 underline" href="/privacy">Privacy Policy</a>.
        </p>
      </section>
    </main>
  )
}
