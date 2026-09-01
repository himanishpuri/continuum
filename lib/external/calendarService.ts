/**
 * §51: interface for syncing a scheduled check-in to an external calendar.
 * Not required for the demo to be truthful — check-ins are always
 * persisted in Firestore/local storage regardless of calendar sync — but
 * kept as a clean seam for a real Google Calendar integration later.
 */
export interface CalendarService {
  scheduleEvent(input: { userId: string; title: string; startsAt: string }): Promise<{ externalEventId: string }>;
}

export class MockCalendarService implements CalendarService {
  async scheduleEvent(input: { userId: string; title: string; startsAt: string }): Promise<{ externalEventId: string }> {
    console.log(`[MockCalendarService] Would create "${input.title}" at ${input.startsAt} for ${input.userId}`);
    return { externalEventId: `mock-event-${Date.now()}` };
  }
}

let instance: CalendarService | null = null;
export function getCalendarService(): CalendarService {
  if (!instance) instance = new MockCalendarService();
  return instance;
}
