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
  parameters are Zod-validated. `HIGH_RISK_HEALTH_ACTION` is always denied.
  Prompt injection can change what the agent says, but consequential actions
  still require this deterministic policy; plan changes, external messages,
  and memory deletion also require the user's approval. Allowed low-risk
  actions can execute without approval.
- Secrets (`GEMINI_API_KEY`, `FIREBASE_PRIVATE_KEY`, `SESSION_SECRET`,
  `CRON_SECRET`) are server-side env vars only. The `NEXT_PUBLIC_FIREBASE_*`
  values are the public Firebase Web App config, not secrets.
- Vercel Cron calls `GET /api/cron/run-due-checkins` with
  `Authorization: Bearer <CRON_SECRET>`. The endpoint compares the full
  Bearer value using `timingSafeEqualStr` (`lib/util/timingSafeEqual.ts`
  HMAC-blinds both operands first).
- Self-reported session timestamps outside a sane window (beyond a small
  future skew or more than a year back) are replaced with the current time.
- Security headers (`X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.ts`; the host
  (Vercel) adds HSTS.

## Known / accepted

- **Transitive `npm audit` advisories** include several high-severity issues
  through `@genkit-ai/*` → `@google-cloud/*` / `@opentelemetry/*` and
  `firebase` → `@grpc/grpc-js`. No upstream fix is published; these paths
  are not reachable from this app's request handling. We will update when
  upstream ships fixes.
- **Rate limiting is in-process** (`lib/util/rateLimit.ts`) and does not
  coordinate across Vercel function instances. A deployment-wide limit
  would need shared storage such as Firestore or Redis.
- **`DEMO_MODE=true`** issues one shared session for a fixed `demo-user`. That is
  intentional for local/demo use; never enable it on a multi-user deployment.
