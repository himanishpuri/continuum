import webpush from "web-push";
import { randomUUID } from "node:crypto";
import { getRepositories } from "@/lib/repositories";

/** §51/§52: check-in delivery to a user's registered browsers. */
export interface OutboundNotification {
  userId: string;
  message: string;
  channel: "email" | "sms" | "push";
  title?: string;
  url?: string;
}

export interface NotificationService {
  send(notification: OutboundNotification): Promise<{ id: string; delivered: boolean }>;
}

export class MockNotificationService implements NotificationService {
  async send(): Promise<{ id: string; delivered: boolean }> {
    return { id: `mock-notification-${randomUUID()}`, delivered: false };
  }
}

export class WebPushNotificationService implements NotificationService {
  constructor() {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  }

  async send(notification: OutboundNotification): Promise<{ id: string; delivered: boolean }> {
    const repo = getRepositories().pushSubscriptions;
    const subscriptions = await repo.list(notification.userId);
    let delivered = false;
    const payload = JSON.stringify({
      title: notification.title ?? "Continuum",
      message: notification.message,
      url: notification.url?.startsWith("/") && !notification.url.startsWith("//") ? notification.url : "/dashboard",
    });
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload);
        delivered = true;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) await repo.deleteByEndpoint(notification.userId, subscription.endpoint);
      }
    }));
    return { id: randomUUID(), delivered };
  }
}

let instance: NotificationService | null = null;
export function getNotificationService(): NotificationService {
  if (!instance) {
    instance = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
      ? new WebPushNotificationService()
      : new MockNotificationService();
  }
  return instance;
}
