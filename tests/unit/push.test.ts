import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getRepositories } from "@/lib/repositories";
import { EndpointSchema } from "@/lib/push/subscriptionSchema";
import { WebPushNotificationService } from "@/lib/external/notificationService";

const push = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ default: push }));

describe("web push", () => {
  it("allows only known HTTPS push services", () => {
    expect(EndpointSchema.safeParse("https://fcm.googleapis.com/fcm/send/123").success).toBe(true);
    expect(EndpointSchema.safeParse("https://updates.push.services.mozilla.com/push/123").success).toBe(true);
    expect(EndpointSchema.safeParse("https://foo.notify.windows.com/w/?token=1").success).toBe(true);
    expect(EndpointSchema.safeParse("https://web.push.apple.com/Q").success).toBe(true);
    for (const endpoint of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://127.0.0.1/x"]) {
      expect(EndpointSchema.safeParse(endpoint).success).toBe(false);
    }
  });

  it("prunes 410 subscriptions and reports success only if any device accepted", async () => {
    const userId = `push-${randomUUID()}`;
    const repo = getRepositories().pushSubscriptions;
    const record = (endpoint: string) => repo.create(userId, { endpoint, keys: { p256dh: "key", auth: "auth" }, userAgent: "test", createdAt: new Date().toISOString() });
    await record("https://fcm.googleapis.com/expired");
    await record("https://fcm.googleapis.com/working");
    push.sendNotification.mockImplementation(({ endpoint }: { endpoint: string }) => endpoint.endsWith("expired")
      ? Promise.reject({ statusCode: 410 }) : Promise.resolve());
    const service = new WebPushNotificationService();
    const result = await service.send({ userId, channel: "push", message: "Hello" });
    expect(result.delivered).toBe(true);
    expect(await repo.list(userId)).toHaveLength(1);
    push.sendNotification.mockRejectedValue({ statusCode: 503 });
    expect((await service.send({ userId, channel: "push", message: "Again" })).delivered).toBe(false);
  });
});
