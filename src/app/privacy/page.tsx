import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — PhaseForge',
  description: 'How PhaseForge collects, uses, and protects your data on the web and mobile apps.',
}

const UPDATED = 'June 23, 2026'
const CONTACT = 'exceldaily7@gmail.com'

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {UPDATED}</p>

      <section className="prose prose-slate mt-8 space-y-6 leading-relaxed">
        <p>
          PhaseForge (&quot;PhaseForge,&quot; &quot;we,&quot; &quot;us&quot;) provides construction and
          project-management software through our website and mobile applications (the
          &quot;Service&quot;). This policy explains what information we collect, how we use it, and the
          choices you have. By using the Service you agree to this policy.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Information we collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Account information</strong> — your name, email address, job title, and company, used to create and manage your account.</li>
          <li><strong>Project data you create</strong> — projects, schedules and phases, tasks, punch-list items, comments, files, and related details you enter.</li>
          <li><strong>Photos and files</strong> — images you capture or upload (for example, punch-list issue and completion photos and project attachments). On mobile, this requires camera and photo-library permission, which you grant and can revoke in your device settings.</li>
          <li><strong>Push notification tokens</strong> — if you enable notifications, a device token so we can send you alerts about work assigned to you. You can disable notifications at any time in your device settings.</li>
          <li><strong>Usage and device information</strong> — basic technical data such as app version and error logs used to operate and improve the Service.</li>
          <li><strong>Payment information</strong> — handled by our payment processor (Stripe). We do not store full card numbers on our servers.</li>
        </ul>

        <h2 className="text-xl font-semibold text-slate-900">How we use information</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>To provide, maintain, and secure the Service and your account.</li>
          <li>To deliver notifications about projects, tasks, and assignments.</li>
          <li>To process subscriptions and payments.</li>
          <li>To send transactional emails such as team invitations and password resets.</li>
          <li>To diagnose problems and improve features.</li>
        </ul>
        <p>We do <strong>not</strong> sell your personal information, and we do not use it for advertising or third-party tracking.</p>

        <h2 className="text-xl font-semibold text-slate-900">How your data is protected</h2>
        <p>
          Your company&apos;s data is isolated from other companies using database row-level security, so
          users can only access data belonging to their own organization. Files are stored in private
          storage and served through time-limited signed links. Data is encrypted in transit.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Service providers we share data with</h2>
        <p>We share data only with vendors that help us run the Service, under their own privacy and security commitments:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
          <li><strong>Vercel</strong> — website hosting.</li>
          <li><strong>Stripe</strong> — subscription and payment processing.</li>
          <li><strong>Brevo</strong> — transactional email (invitations, account emails).</li>
          <li><strong>Expo</strong> — delivery of mobile push notifications.</li>
        </ul>

        <h2 className="text-xl font-semibold text-slate-900">Data retention</h2>
        <p>
          We retain your data for as long as your account is active. You can delete projects and files
          within the app. To delete your account and associated data, contact us at the address below.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Your choices</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Access or correct your information from within the app.</li>
          <li>Control camera, photo, and notification permissions in your device settings.</li>
          <li>Request account and data deletion — see our <a className="text-indigo-600 underline" href="/account-deletion">Account &amp; Data Deletion</a> page.</li>
        </ul>

        <h2 className="text-xl font-semibold text-slate-900">Children&apos;s privacy</h2>
        <p>The Service is intended for business use and is not directed to children under 13. We do not knowingly collect data from children.</p>

        <h2 className="text-xl font-semibold text-slate-900">Changes to this policy</h2>
        <p>We may update this policy from time to time. We will revise the &quot;Last updated&quot; date above when we do.</p>

        <h2 className="text-xl font-semibold text-slate-900">Contact us</h2>
        <p>
          Questions or data requests: <a className="text-indigo-600 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </section>
    </main>
  )
}
