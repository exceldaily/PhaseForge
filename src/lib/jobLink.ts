// Job number links. Each company sets one URL pattern with {job} where the
// number goes (Kalos: https://live.kalosflorida.com/project/{job}); every
// Job# in the app, on project cards, project pages, schedules, and chat
// cards, then opens that job in the company's own system. Pure, tested.

/** The link for a job number, or null when there is no pattern or no number. */
export function buildJobUrl(template: string | null | undefined, jobNumber: string | null | undefined): string | null {
  const t = template?.trim()
  const n = jobNumber?.trim()
  if (!t || !n || !t.includes('{job}')) return null
  return t.split('{job}').join(encodeURIComponent(n))
}

/** Why a pattern would be rejected, or null when it is fine. Empty is fine (turns links off). */
export function jobUrlProblem(template: string): string | null {
  const t = template.trim()
  if (!t) return null
  if (!/^https?:\/\/\S+$/i.test(t)) return 'Enter a full web address starting with http:// or https://'
  if (!t.includes('{job}')) return 'Put {job} where the job number goes, for example https://yoursystem.com/jobs/{job}'
  return null
}
