import { REGISTRATION_TEMPLATES } from '@/views/tickets/types/businessRegistration';

interface LegacyProjection { id: string; no: string; formTemplateId?: string }

/** One-time compatibility cleanup for arrays already loaded before the workspace split. */
export function clearLegacyRegistrationProjections(tickets: LegacyProjection[]): number {
  const templateIds = new Set(REGISTRATION_TEMPLATES.map((template) => template.id));
  let removed = 0;
  for (let index = tickets.length - 1; index >= 0; index -= 1) {
    const ticket = tickets[index]!;
    if (ticket.id === `registration-${ticket.no}` && ticket.formTemplateId && templateIds.has(ticket.formTemplateId)) {
      tickets.splice(index, 1);
      removed += 1;
    }
  }
  return removed;
}
