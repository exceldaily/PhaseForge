// Default follow-up templates. Seeded once per company, then editable in
// Settings; the engine never depends on these exact rows.

export interface TemplateSeed { title: string; queue: string; nextAction: string; daysDue: number; waitingOn: string | null; internalStatus: string | null }

export const DEFAULT_TEMPLATES: TemplateSeed[] = [
  { title: 'Confirm current equipment condition', queue: 'critical', nextAction: 'Call the site and confirm whether the equipment is running, alarming, or down; record what they say and when.', daysDue: 1, waitingOn: 'customer', internalStatus: 'in_progress' },
  { title: 'Contact customer regarding unsatisfactory report', queue: 'recovery', nextAction: 'Call the reporting manager, listen to what is still wrong, compare against the approved scope, agree the next step, and record it.', daysDue: 1, waitingOn: null, internalStatus: 'in_progress' },
  { title: 'Request technician field notes', queue: 'quotes', nextAction: 'Ask the technician for findings, photos, and the scope needed for the proposal.', daysDue: 2, waitingOn: 'technician', internalStatus: 'in_progress' },
  { title: 'Request repair estimate', queue: 'quotes', nextAction: 'Ask estimating for the proposal from the field scope; confirm it is submitted in ServiceChannel.', daysDue: 2, waitingOn: 'estimating', internalStatus: 'waiting_approval' },
  { title: 'Follow up on approval', queue: 'quotes', nextAction: 'Check the proposal decision with the customer contact; record the answer and the date.', daysDue: 3, waitingOn: 'customer', internalStatus: 'waiting_approval' },
  { title: 'Verify parts order', queue: 'parts', nextAction: 'Confirm the parts were ordered and get an expected delivery date; record it on the case.', daysDue: 2, waitingOn: 'parts', internalStatus: 'waiting_parts' },
  { title: 'Confirm parts delivery', queue: 'parts', nextAction: 'Confirm the parts arrived and record the received date.', daysDue: 2, waitingOn: 'parts', internalStatus: 'waiting_parts' },
  { title: 'Schedule return visit', queue: 'parts', nextAction: 'Book the return visit with the site and the technician; record the appointment date.', daysDue: 2, waitingOn: 'service_manager', internalStatus: 'in_progress' },
  { title: 'Verify repair completion', queue: 'verification', nextAction: 'Confirm with the site that the repair holds and ServiceChannel shows the right status; then verify the case.', daysDue: 3, waitingOn: null, internalStatus: 'pending_verification' },
  { title: 'Request billing update', queue: 'billing', nextAction: 'Ask billing whether the invoice was submitted and accepted; record the invoice date.', daysDue: 3, waitingOn: 'billing', internalStatus: 'in_progress' },
  { title: 'Confirm PM appointment', queue: 'maintenance', nextAction: 'Confirm the maintenance appointment with the site and record the date; make sure check-in happens on the day.', daysDue: 5, waitingOn: 'service_manager', internalStatus: 'in_progress' },
  { title: 'Reconcile ServiceChannel records', queue: 'verification', nextAction: 'Compare what ServiceChannel shows with what was actually done; correct through the proper process and record the facts.', daysDue: 3, waitingOn: null, internalStatus: 'needs_verification' },
]
