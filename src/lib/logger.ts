/**
 * Centralised error logger.
 * Swap the body of `logger.error` for Sentry.captureException / Datadog / etc.
 * when you add a monitoring service.
 */
export const logger = {
  error(message: string, error?: unknown): void {
    // TODO: replace with Sentry.captureException(error, { extra: { message } })
    console.error(`[ERROR] ${message}`, error ?? '')
  },
  warn(message: string, detail?: unknown): void {
    console.warn(`[WARN] ${message}`, detail ?? '')
  },
}
