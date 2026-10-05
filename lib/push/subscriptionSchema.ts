import { z } from "genkit";

export const EndpointSchema = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (
      host === "fcm.googleapis.com" || host === "web.push.apple.com" ||
      host.endsWith(".push.services.mozilla.com") || host.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}, "Unsupported push endpoint.");

export const SubscriptionSchema = z.object({
  endpoint: EndpointSchema,
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});
