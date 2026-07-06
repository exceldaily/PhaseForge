import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — PhaseForge',
  description: 'The terms that govern your use of PhaseForge.',
}

const UPDATED = 'July 6, 2026'
const CONTACT = 'exceldaily7@gmail.com'

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {UPDATED}</p>

      <section className="prose prose-slate mt-8 space-y-6 leading-relaxed">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of PhaseForge&apos;s website and
          mobile applications (the &quot;Service&quot;). By creating an account or using the Service you
          agree to these Terms.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Your account</h2>
        <p>
          You are responsible for your account credentials and for all activity under your account.
          You must provide accurate information and be authorized to act for the organization you
          join or create.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Your content</h2>
        <p>
          You retain ownership of the projects, schedules, files, photos, and other content you add
          to the Service. You grant us the limited rights needed to host, process, and display that
          content in order to operate the Service for you and your organization. You are responsible
          for having the rights to the content you upload.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Third-party integrations</h2>
        <p>
          The Service can connect to third-party services you authorize, such as Google Calendar.
          When you connect an integration, we access only the data needed to provide the feature
          (for example, creating and updating calendar events for your project phases on the
          calendar you select) and you can disconnect at any time from Settings. Your use of
          third-party services is also governed by their terms.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Acceptable use</h2>
        <p>
          You agree not to misuse the Service — including attempting to access other organizations&apos;
          data, interfering with the Service&apos;s operation, or using it for unlawful purposes.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Subscriptions and billing</h2>
        <p>
          Paid plans are billed through our payment provider. Fees are non-refundable except where
          required by law. You can cancel at any time and your plan remains active until the end of
          the billing period.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Disclaimers and limitation of liability</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind. To the maximum
          extent permitted by law, PhaseForge is not liable for indirect, incidental, or
          consequential damages, and our total liability for any claim is limited to the amounts you
          paid for the Service in the twelve months before the claim.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or terminate accounts that
          violate these Terms. Upon termination, provisions that by their nature should survive
          (such as ownership and liability limits) will survive.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Changes</h2>
        <p>
          We may update these Terms from time to time. If we make material changes we will update
          the date above and, where appropriate, notify you in the app. Continued use of the Service
          after changes take effect constitutes acceptance.
        </p>

        <h2 className="text-xl font-semibold text-slate-900">Contact</h2>
        <p>
          Questions about these Terms: <a href={`mailto:${CONTACT}`} className="text-indigo-600 underline">{CONTACT}</a>
        </p>
      </section>
    </main>
  )
}
