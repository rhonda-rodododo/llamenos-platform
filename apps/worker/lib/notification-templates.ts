/**
 * Notification message templates.
 *
 * These are server-side fallback templates. In practice, the client
 * renders messages from i18n strings (because it has decryption keys
 * for contact profiles). The server receives pre-rendered messages.
 *
 * These templates exist for:
 * - Automated notifications triggered by DO alarms (no client in loop)
 * - Fallback when client doesn't provide a message body
 */

/**
 * Render a simple status change notification.
 * No PII is included -- only the case number and status label.
 */
export function renderStatusChangeNotification(
  caseNumber: string,
  entityTypeLabel: string,
  newStatus: string,
): string {
  if (caseNumber && caseNumber.trim()) {
    return `Update on ${entityTypeLabel} ${caseNumber}: Status changed to ${newStatus}.`
  }
  return `Update: Status changed to ${newStatus}.`
}
