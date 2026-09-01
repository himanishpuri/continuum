# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

`AGENTS.md` is regenerated on every `next dev` (Next.js 16 + React 19 have breaking
changes vs. training data — read `node_modules/next/dist/docs/` before touching
framework code). Commit that block with your changes so the tree stays clean.

## Commands

```bash
npm install
npm run seed          # rebuilds .demo-data/demo-user/ (profile, v1→v3 plan, memories, ~3wk history)
npm run dev           # http://localhost:3000 — sign in with "Continue in Demo Mode"

npm run lint
npm run typecheck
npm test              # rimrafs .demo-data-test/, then `vitest run`
npm run build         # also type-checks; emits .next/standalone for the Dockerfile
```

Single test file / filter (bypasses the `rimraf` in `npm test`, which is fine —
tests use per-run unique userIds under `.demo-data-test/`):

```bash
npx vitest run tests/unit/policyEngine.test.ts
npx vitest run -t "requires approval"
npm run test:watch
```

Test env defaults are set in `tests/setup.ts` (`DEMO_MODE=true`,
`DEMO_DATA_DIR=.demo-data-test`, dummy `SESSION_SECRET`/`CRON_SECRET`).

Simulate the background check-in job locally (needs a session cookie from the browser):

```bash
curl -X POST http://localhost:3000/api/dev/run-due-checkins -H "Cookie: <continuum_session=...>"
```

Provision the production Cloud Scheduler job (`scripts/setup-cloud-scheduler.sh`):

```bash
npm run setup:scheduler -- --secret=<CRON_SECRET>   # --help for all flags
```

## Architecture

Continuum is a non-clinical wellbeing/habit-planning **agent** (never diagnoses,
prescribes, or gives emergency advice). One Next.js app (App Router, Node runtime,
Route Handlers) deployed as a single Cloud Run service. `docs/architecture.md` has
the diagrams; the load-bearing ideas:

### Two swappable seams, selected at runtime

1. **AgentProvider** (`lib/agent/agentProvider.ts`) — `getAgentProvider()` in
   `agentService.ts` picks `GeminiAgentProvider` only when `DEMO_MODE!=="true"`
   **and** `GEMINI_API_KEY` is set, otherwise `DemoAgentProvider` (a deterministic
   rules engine). Both receive the *same* pre-built `AgentContext` + intent and
   must return the same `AgentDecision` shape. **When you change agent behavior,
   change both providers** or the demo path drifts.
2. **Repositories** (`lib/repositories/`) — `getRepositories()` picks the local
   JSON store vs. Firestore via `isUsingLocalStore()` (`DEMO_MODE` or no Firebase
   Admin creds). Both backends implement the identical interfaces in
   `lib/repositories/types.ts`. Local store = `.demo-data/<userId>/<collection>.json`,
   deliberately mirroring the Firestore `users/{uid}/{collection}` layout. Both
   factories are process-cached.

The demo mode exists so the whole app runs with zero external credentials — it is
not a mock; it exercises the real policy, progress, evidence, and executor code.

### The chat turn (`lib/agent/agentService.ts` `sendAgentMessage`)

`RECEIVE → CLASSIFY → RETRIEVE_CONTEXT → REASON → PLAN → VALIDATE → (ASK | WAIT_FOR_APPROVAL) → EXECUTE → VERIFY → WRITE_MEMORY → RESPOND`

- **CLASSIFY** (`src/ai/agent/planner.ts`) is keyword-based, *not* a model call.
- **RETRIEVE_CONTEXT** (`src/ai/agent/context.ts`) assembles everything
  deterministically before any model call. `progressEngine.ts` and
  `evidenceEngine.ts` are pure functions — stats the agent *cites*, never guesses.
- **REASON+PLAN+VALIDATE** = at most **one** Gemini call
  (`src/ai/agent/decisionEngine.ts`), structured output against
  `AgentDecisionSchema`. A `proposedAction`'s params are validated against the
  matching `src/ai/tools/registry.ts` schema; on failure the action is dropped.
- Safety guard: `containsSafetyTrigger()` runs *before* the provider is called and
  short-circuits to a fixed `SAFETY_RESPONSE`. All prompt text lives in
  `src/ai/agent/prompts.ts`.

### Policy gate + action execution (the model never touches storage)

- `lib/policy/policyEngine.ts` `evaluatePolicy()` is the **sole** authority on
  whether an action is allowed and whether it needs approval. The model's own
  `requiresApproval` is advisory and always overridden. `HIGH_RISK_HEALTH_ACTION`
  is unconditionally denied; `CREATE_PLAN`/`MODIFY_PLAN`/`SEND_EXTERNAL_MESSAGE`/
  `DELETE_MEMORY` always require approval; `SCHEDULE_CHECKIN` requires approval
  only under `conservative` autonomy.
- `lib/tools/actionService.ts` `proposeAction()` runs the gate → persists
  `PENDING_APPROVAL` or auto-`APPROVED`+executes. `approveAction`/`rejectAction`
  handle the pending case. Proposals expire after 3 days.
- `lib/tools/toolExecutor.ts` `executeAction()` is the **only** code path that
  mutates plans / memories / check-ins. Idempotent on `action.idempotencyKey`
  (checks for a prior COMPLETED action first). Every execution writes an audit
  `EventRecord`.
- The `events` collection is dual-purpose: `SESSION_COMPLETED`/`SESSION_MISSED`
  are the behavioral log `progressEngine` reads; all types together are the audit
  trail the Activity page renders. Plan edits are versioned into `planVersions`.

### Identity

`lib/auth/session.ts` `getCurrentUser()` is the **only** place identity is
derived — from the `continuum_session` cookie (`demo:` HMAC token signed with
`SESSION_SECRET`, or `fb:` Firebase session cookie). Route handlers call
`requireApiUser()` (`lib/auth/apiAuth.ts`). No route ever trusts a client-supplied
`userId`. `firestore.rules` denies all direct client access by design — Firestore
is only ever reached server-side via the Admin SDK.

### Background check-ins

`lib/background/runDueCheckins.ts` — prod entry `POST /api/cron/run-due-checkins`
(guarded by `X-Cron-Secret` header == `CRON_SECRET`), local entry
`POST /api/dev/run-due-checkins` (`DEMO_MODE` only, current user). Same function.
`evaluateCheckin` reasons about *severity* (one miss ≠ chronic drop).

## Gotchas

- **Zod**: import `z` from `"genkit"` (bundled zod v3), never add or import a
  standalone `zod` package — version conflict with Genkit's `defineFlow`/output
  schemas. Schemas live in `src/ai/schemas/`.
- `import "server-only"` (in `src/ai/genkit.ts`, `lib/auth/session.ts`) is aliased
  to a stub in `vitest.config.ts` so tests can import server modules.
- Dynamic `fs` / `path.join(process.cwd(), ...)` calls carry
  `/* turbopackIgnore: true */` — without it Turbopack traces the whole source
  tree into the standalone build. Keep those comments if you touch `jsonStore.ts`
  or `repositories/index.ts`.
- `eslint-config-next@16` enforces `react-hooks/purity` (no `Date.now()` etc. in
  component bodies) and `react-hooks/set-state-in-effect` (no bare `setState` in
  `useEffect` — adjust state during render instead).
- Path alias `@/*` → repo root (both `tsconfig.json` and `vitest.config.ts`).
- `next.config.ts` sets `output: "standalone"` only when **not** on Vercel
  (`process.env.VERCEL`) — standalone breaks Vercel's build finalization; the
  `Dockerfile`/Cloud Run path needs it.
- **`firebase-admin` is pinned to `^13`, do not bump to 14+.** v14 pulls
  `jwks-rsa@4` → `jose@6` (ESM-only); Vercel's Node runtime `require()`s the
  externalized package and dies with `ERR_REQUIRE_ESM`. v13 → `jwks-rsa@3` →
  `jose@4` (CJS) works everywhere.
- `GEMINI_MODEL` must be a **concrete** model id (`gemini-3.5-flash`), not the
  `gemini-flash-latest` alias — the alias routes to the newest preview model
  and 503s under load. The decision call uses Genkit's `retry` + `fallback`
  middleware (registered in `src/ai/genkit.ts`); `fallback` also catches a 404
  when a pinned model is retired and switches to `GEMINI_FALLBACK_MODELS`.

## Layout

- `app/(app)/*` authed pages, `app/api/*` route handlers, `app/login`, `app/page.tsx`
- `lib/agent` orchestration + providers · `lib/tools` policy gate + executor ·
  `lib/{policy,progress,evidence,memory}` deterministic engines ·
  `lib/repositories/{index,local/,firestore/}` · `lib/auth` · `lib/background` ·
  `lib/external` (calendar/notification stubs)
- `src/ai/genkit.ts` · `src/ai/agent/{planner,context,decisionEngine,agentFlow,verifier,prompts}` ·
  `src/ai/schemas/*` (zod) · `src/ai/tools/registry.ts`
- `lib/types.ts` central domain types · `lib/repositories/types.ts` backend contracts
- `tests/integration/criticalAgentScenario.test.ts` is the end-to-end scenario the
  whole app is built around — keep it green.
