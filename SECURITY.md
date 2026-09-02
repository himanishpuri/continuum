# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Report privately via
GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, or email the maintainer.

Include: affected endpoint / file, a reproduction, and the impact you observed.
Expect an acknowledgement within a few days.

## Security model (summary)

- All data API routes require a verified session (`lib/auth/session.ts`); no
  route trusts a client-supplied `userId`. Identity is a Firebase session cookie
  in production, or an HMAC-signed demo token when `DEMO_MODE=true`.
- Firestore is reached only server-side via the Admin SDK; `firestore.rules`
  denies all direct client access.
- The LLM cannot take a consequential action on its own: it proposes **one**
  structured action, `lib/policy/policyEngine.ts` decides deterministically
  whether it is allowed and whether it needs the user's approval, and tool
  parameters are Zod-validated. `HIGH_RISK_HEALTH_ACTION` is always denied. So
  prompt injection can change what the agent *says* but not what it *does*.
- Secrets (`GEMINI_API_KEY`, `FIREBASE_PRIVATE_KEY`, `SESSION_SECRET`,
  `CRON_SECRET`) are server-side env vars only. The `NEXT_PUBLIC_FIREBASE_*`
  values are the public Firebase Web App config, not secrets.
- The cron endpoint (`/api/cron/run-due-checkins`) authenticates with a
  constant-time comparison of `CRON_SECRET` that leaks neither the value nor
  its length (`lib/util/timingSafeEqual.ts` HMAC-blinds both operands first).
- Self-reported session events are only accepted with a timestamp inside a
  sane window (not future, not more than a year back) so progress stats
  can't be poisoned by a back- or post-dated event.
- Security headers (`X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.ts`; the host
  (Vercel) adds HSTS.

## Known / accepted

- **Transitive `npm audit` advisories** — several "high" advisories come from
  `@genkit-ai/*` → `@google-cloud/firestore` / `@opentelemetry/*` with no fix
  currently published upstream. They are OpenTelemetry instrumentation code
  paths, not reachable from this app's request handling. Tracked; will update
  when Genkit releases a fix.
- **Rate limiting is in-process** (`lib/util/rateLimit.ts`) — sufficient for the
  single-instance deployment this targets; a horizontally scaled deployment
  should move it to Firestore or Redis.
- **`DEMO_MODE=true`** issues one shared session for a fixed `demo-user`. That is
  intentional for local/demo use; never enable it on a multi-user deployment.
