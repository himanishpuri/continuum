/**
 * §51/§52: notifications are represented as events/check-ins in Firestore;
 * this interface exists so a real email/SMS/push provider can be swapped
 * in later without touching the agent or API layers. The demo never needs
 * a real provider to prove the agent's behavior.
 */
export interface OutboundNotification {
  userId: string;
  message: string;
  channel: "email" | "sms" | "push";
}

export interface NotificationService {
  send(notification: OutboundNotification): Promise<{ id: string; delivered: boolean }>;
}

export class MockNotificationService implements NotificationService {
  async send(notification: OutboundNotification): Promise<{ id: string; delivered: boolean }> {
    console.log(`[MockNotificationService] Would send ${notification.channel} to ${notification.userId}: ${notification.message}`);
    return { id: `mock-notification-${Date.now()}`, delivered: true };
  }
}

let instance: NotificationService | null = null;
export function getNotificationService(): NotificationService {
  if (!instance) instance = new MockNotificationService();
  return instance;
}
