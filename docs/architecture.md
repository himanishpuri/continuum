# Continuum — Architecture

This document describes how Continuum is put together: the runtime
architecture, the agent's internal lifecycle, its memory model, the
approval workflow that gates consequential actions, and how background
(check-in) execution works.

## 1. System architecture

```mermaid
flowchart TD
    User((User)) -->|HTTPS| Next[Next.js App Router<br/>UI + API routes]
    Next -->|Cloud Run service| CloudRun[Cloud Run]
    CloudRun --> AgentService[AgentService<br/>lib/agent/agentService.ts]
    AgentService --> Provider{AgentProvider}
    Provider -->|GEMINI_API_KEY set,<br/>DEMO_MODE=false| Genkit[Genkit flow<br/>src/ai/*]
    Genkit --> Gemini[(Gemini API)]
    Provider -->|otherwise| Demo[DemoAgentProvider<br/>deterministic rules engine]
    AgentService --> Policy[Policy engine<br/>lib/policy/policyEngine.ts]
    Policy --> Executor[Tool executor<br/>lib/tools/toolExecutor.ts]
    Executor --> Data[(Firestore or<br/>local JSON store)]
    AgentService --> Data
    Scheduler[Cloud Scheduler] -->|POST + shared secret| CronRoute["/api/cron/run-due-checkins"]
    CronRoute --> CloudRun
    CloudRun --> Background[Background check-in evaluator<br/>lib/background/runDueCheckins.ts]
    Background --> Data
```

Everything runs inside one Cloud Run service. `AgentProvider` is the only
seam between "real Gemini" and "deterministic demo" — every other layer
(policy, execution, storage) is identical regardless of which one is
active, which is what lets `DEMO_MODE=true` exercise the full app with no
external credentials.

## 2. Agent lifecycle

```mermaid
stateDiagram-v2
    [*] --> RECEIVE
    RECEIVE --> CLASSIFY: planner.ts (deterministic)
    CLASSIFY --> RETRIEVE_CONTEXT: context.ts
    RETRIEVE_CONTEXT --> RESPOND: simple_query
    RETRIEVE_CONTEXT --> REASON: complex request
    REASON --> PLAN: decisionEngine.ts (single Gemini call, or DemoAgentProvider)
    PLAN --> VALIDATE: proposedAction validated against its tool schema
    VALIDATE --> ASK: clarifyingQuestion needed
    VALIDATE --> WAIT_FOR_APPROVAL: policy requires approval
    VALIDATE --> EXECUTE: policy allows immediately
    WAIT_FOR_APPROVAL --> EXECUTE: user approves
    WAIT_FOR_APPROVAL --> [*]: user rejects
    EXECUTE --> VERIFY: toolExecutor.ts
    VERIFY --> WRITE_MEMORY: verifier.ts filters memory candidates
    WRITE_MEMORY --> RESPOND
    ASK --> RESPOND
    RESPOND --> [*]
```

Not every message visits every state — a factual question
("What's my next session?") goes RECEIVE → CLASSIFY → RETRIEVE_CONTEXT →
RESPOND directly. A message like "I can't keep up with my routine" walks
the full path.

## 3. Memory architecture

```mermaid
flowchart LR
    subgraph Layers
        ST[Short-term<br/>current conversation]
        EP[Episodic<br/>events: sessions, check-ins, approvals]
        SEM[Semantic / persistent<br/>memories: preferences, patterns, goals]
    end
    Message[User message] --> ST
    ST --> Retrieval[memoryService.retrieveRelevantMemories]
    EP --> ProgressEngine[progressEngine.ts<br/>deterministic stats]
    ProgressEngine --> EvidenceEngine[evidenceEngine.ts]
    SEM --> Retrieval
    Retrieval -->|ranked, capped| Context[AgentContext]
    EvidenceEngine --> Context
    Context --> Decision[AgentDecision]
    Decision -->|memoryCandidates| Verifier[verifier.ts:<br/>confidence floor + dedup]
    Verifier -->|qualifying candidates only| SEM
```

Memory is never handed to the model unfiltered: `retrieveRelevantMemories`
ranks by a confidence/recency score and caps how much comes back, and only
memory candidates that clear the verifier's confidence and duplicate
checks are ever persisted (§25/§26).

## 4. Approval workflow

```mermaid
flowchart TD
    Decision[AgentDecision.proposedAction] --> Policy[policyEngine.evaluatePolicy]
    Policy -->|prohibited| Denied[Denied — surfaced in the response,<br/>nothing persisted]
    Policy -->|allowed, no approval needed| AutoExec[actionService executes immediately]
    Policy -->|allowed, approval required| Pending[AgentAction: PENDING_APPROVAL<br/>+ APPROVAL_REQUESTED / PLAN_PROPOSED event]
    Pending -->|user clicks Approve| Approved[APPROVED]
    Pending -->|user clicks Reject| Rejected[REJECTED — nothing changes]
    Approved --> Exec[toolExecutor.executeAction<br/>idempotent on idempotencyKey]
    AutoExec --> Exec
    Exec -->|success| Completed[COMPLETED<br/>+ audit event, e.g. PLAN_UPDATED]
    Exec -->|throws| Failed[FAILED<br/>+ AGENT_FAILED event, no partial state]
```

The model's own `requiresApproval` guess is never trusted — the policy
engine's decision is authoritative and cannot be overridden by anything
the model returns (§20/§71).

## 5. Background execution

```mermaid
sequenceDiagram
    participant Scheduler as Cloud Scheduler
    participant Cron as POST /api/cron/run-due-checkins
    participant Job as runDueCheckinsForAllUsers
    participant Data as Firestore/local store

    Scheduler->>Cron: HTTP POST + X-Cron-Secret
    Cron->>Cron: verify shared secret
    Cron->>Job: run
    loop each user with a due check-in
        Job->>Data: read plan, recent events, check-in
        Job->>Job: compute weekly completion (progressEngine)
        alt severe drop (<40% of 3+ planned)
            Job->>Data: mark check-in completed + propose follow-up
        else mild dip
            Job->>Data: mark check-in completed, no change
        else strong adherence
            Job->>Data: mark check-in completed, no change
        end
        Job->>Data: write CHECKIN_COMPLETED event + AgentRun (background_checkin)
    end
    Cron-->>Scheduler: 200 { results }
```

Locally, `POST /api/dev/run-due-checkins` (gated to `DEMO_MODE=true`, scoped
to the signed-in user) calls the exact same `runDueCheckinsForUser`
function the cron route uses — there is no separate "fake" demo path.

## 6. Request sequence — a chat message end to end

```mermaid
sequenceDiagram
    participant U as Browser
    participant R as POST /api/agent/message
    participant S as AgentService
    participant P as AgentProvider
    participant Pol as PolicyEngine
    participant Ex as ToolExecutor
    participant D as Repositories

    U->>R: { message, conversationId? }
    R->>R: requireApiUser() — session cookie only, never trusts body
    R->>S: sendAgentMessage(uid, message, conversationId)
    S->>D: create AgentRun (status: running)
    S->>D: buildAgentContext(uid) — memories, plan, progress, evidence
    S->>P: handleMessage({ context, intent })
    P-->>S: AgentDecision { summary, proposedAction?, memoryCandidates }
    alt proposedAction present
        S->>Pol: evaluatePolicy(actionType, permissions, autonomy)
        Pol-->>S: { allowed, requiresApproval, riskLevel }
        S->>D: create AgentAction (PENDING_APPROVAL or APPROVED)
        opt no approval required
            S->>Ex: executeAction
            Ex->>D: mutate plan/checkin/memory + audit event
        end
    end
    S->>D: persist qualifying memoryCandidates (via the same policy gate)
    S->>D: append conversation message, update AgentRun (completed)
    S-->>R: { message, pendingApproval, steps }
    R-->>U: 200 JSON
```
