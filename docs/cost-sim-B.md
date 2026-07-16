# Cost Simulation B — Operator Infrastructure Cost Model

**Independent top-down, scenario-based cost model for the operator of the Hermes / OpenClot agent-orchestration SaaS.**

- Analyst: independent cost analysis (model "B"), derived from first principles against the code in this repo.
- Date of pricing research: **2026-06-16** (prices change; re-verify before quoting).
- Scope: **operator-borne** infrastructure only — Convex + Vercel + Clerk (+ optional embeddings).

---

## 0. What the operator pays for vs. what end users pay

| Cost | Who pays | In this model? |
|---|---|---|
| Convex (backend: function calls, action compute, DB bandwidth/storage, vector search, egress) | Operator | **Yes** |
| Vercel (Next.js dashboard hosting, edge/function, bandwidth) | Operator | **Yes** |
| Clerk (auth / MAU) | Operator | **Yes** |
| OpenAI embeddings for RAG (`text-embedding-3-small`, used by `convex/embeddings.ts`) | Operator *(only if the operator supplies the key; can be pushed to the tenant)* | **Yes, broken out separately** |
| **Agent compute** (the VM/container running `agent_runtime.py`) | **End user** | **EXCLUDED** |
| **LLM inference tokens** (Claude/OpenAI calls inside `llm_respond`) | **End user** | **EXCLUDED** |
| MCP tool-provider fees (AgentMail, Calendly, MiniChat, contact-data MCP, Composio) | **End user / 3rd-party** | **EXCLUDED** |

> **Stated explicitly:** end users run their own agents and pay their own agent compute and LLM tokens. Those are the largest dollar items in the whole system, but they are **not** operator cost. The operator's bill is dominated by the *coordination chatter* the platform forces through Convex.

---

## 1. Current vendor pricing (researched 2026-06-16)

### Convex — Professional
- **$25 / developer / month** base.
- Included per month: **25M function calls**, **250 GB-hours** action compute, **50 GB** DB storage, **50 GB** DB bandwidth (I/O), **50 GB** egress, **100 GB** file storage, **1 GB** vector/search storage.
- Overages: **$2 / additional 1M function calls**, **$0.30 / GB-hour** action compute, **$0.20 / GB** DB storage, **$0.20 / GB** DB bandwidth, **$0.12 / GB** egress.
- Sources: [Convex pricing](https://www.convex.dev/pricing), [MakerKit Convex calculator](https://makerkit.dev/pricing-calculator/convex), [ToolRadar Convex pricing](https://toolradar.com/tools/convex/pricing).

> **Billing mechanic that dominates this model:** in Convex a *function call* is **every** function invocation, and when an HTTP action calls `ctx.runQuery` / `ctx.runMutation`, **each of those internal calls is itself counted**. So one `/workflow/inbox` POST is not 1 call — it is the HTTP action **plus** its auth query **plus** its work mutation. See §2. (Refs: [Convex functions](https://docs.convex.dev/functions), [HTTP actions](https://docs.convex.dev/functions/http-actions), [internal functions](https://docs.convex.dev/functions/internal-functions).)

### Vercel — Pro
- **$20 / developer / month**, includes a **$20 monthly usage credit**.
- Included: **1 TB** Fast Data Transfer, **10M** Edge Requests, **1M** Function Invocations.
- Overages: Fast Data Transfer **$0.15/GB**, Function Invocations **$0.60/M**, Fast Origin Transfer **$0.06/GB**.
- Sources: [Vercel pricing 2026 (costbench)](https://costbench.com/software/developer-tools/vercel/), [MakerKit Vercel cost](https://makerkit.dev/blog/saas/vercel-cost).

### Clerk — Pro
- **$25 / month**, includes **10,000 MAU** on Pro; free tier covers up to **50,000 monthly retained users**. Overage **$0.02 / MAU**.
- Sources: [Clerk new pricing](https://clerk.com/blog/new-pricing-plans), [Clerk pricing](https://clerk.com/pricing), [costbench Clerk](https://costbench.com/software/developer-tools/clerk/).

### OpenAI embeddings (optional, operator-side RAG)
- `text-embedding-3-small` ≈ **$0.02 / 1M tokens**. RAG query text is short (≈50–150 tokens). Effectively rounding error vs. Convex; broken out anyway.

---

## 2. System mechanics → per-action op counts (grounded in the code)

Confirmed by reading `convex/http.ts`, `connector/control_plane/agent_runtime.py`, `connector/control_plane/client.py`, `convex/a2a.ts`, `convex/engine.ts`, `convex/crons.ts`, `convex/lib/metering.ts`.

### 2.1 The always-on poll loop is the cost driver
`agent_runtime.py::run()` loops with `time.sleep(2.0)`. Every iteration calls:
- `client.workflow_inbox()` → `POST /workflow/inbox`
- `client.a2a_inbox()` → `POST /a2a/inbox`
- and a `heartbeat()` every 30s.

**Each HTTP action fans out into internal Convex functions** (each billed as a function call):

| Endpoint | Function calls per request |
|---|---|
| `POST /workflow/inbox` | 1 HTTP action + `authAgent`→`agents.byTokenHash` (runQuery) + `engine.claimSteps` (runMutation) = **3** |
| `POST /a2a/inbox` | 1 HTTP action + auth runQuery + `a2a.pullInbox` (runMutation) = **3** |
| `POST /connector/heartbeat` | 1 HTTP action + auth runQuery + `agents.recordHeartbeat` (runMutation) = **3** |

**Idle (zero leads) function calls per agent:**
- Polls: 2 endpoints × 3 calls every 2 s = 6 calls / 2 s = **3.0 calls/s**.
- Heartbeat: 3 calls / 30 s = **0.1 calls/s**.
- Total ≈ **3.1 calls/s** = **267,840 calls/agent/day** ≈ **8.04M calls/agent/month (30d)**.

> This is the single most important number in the model: **an idle always-on agent burns ~8M Convex function calls/month doing nothing but polling.** Convex's 25M included covers only ~3 idle agents.

### 2.2 Per-unit op counts for actual work
From `a2a.ts::route`, `engine.ts`, `http.ts`, and `lib/metering.ts::recordUsage`:

- **Per A2A message** (`route`): inserts into `a2aMessages`, `messages`, `activity` + `recordWorkEvent` + `recordUsage` + thread upsert/patch + guard reads (`assertWithinBudget`, `assertRateLimit`, `assertWithinDailyBudget`, `assertNotLooping`). ≈ **5 writes + several guard reads**. Plus the `/a2a/send` action + auth = the message costs **~7–8 function calls and ~5 writes** end-to-end.
- **Per workflow step**: dispatch (`advanceRun` patches step + run + activity), `claimSteps` (patch), `reportResult`→`completeStep` (patch step + run + `recordWorkEvent` + `recordUsage`), plus the `/workflow/result` action + auth + scheduler re-invoke of `advanceRun`. ≈ **6–10 writes** and **~8–12 function calls** per step.
- **Per MCP / tool call** (`/integrations/execute`): 1 HTTP action + auth + `integrations.executeForConnector` action → ≈ **3 function calls + ~3 writes** (activity/usage/ledger). *(LLM/tool-vendor cost excluded.)*
- **Per RAG query** (`/context/search`): 1 HTTP action + auth + `memories.retrieveForConnector` action → 1 `embed()` (OpenAI) + 1 `ctx.vectorSearch`. ≈ **3 function calls + 1 vector search + 1 embedding**.

### 2.3 Hidden read-amplification (skeptic's note)
`recordUsage` in `convex/lib/metering.ts` enforces the monthly budget by **scanning the entire month's `usage` rows on every metered event** (`.collect()` then reduce). This is O(events-this-month) **per event** → quadratic DB-bandwidth growth within a month. At high lead volume this can rival or exceed the polling cost in **DB bandwidth (I/O)**, and is a latent scaling bug, not just a cost line. Modeled as a bandwidth multiplier in the high case.

### 2.4 Cron floor
`convex/crons.ts`: `trigger tick` + `health sweep` every minute (2 × 1,440 = 2,880 invocations/day) + 1 daily digest per Space. Each fans out to reads over agents/triggers. Small but non-zero and **per deployment**, not per agent.

---

## 3. Per-unit cost assumptions (low / expected / high)

| Parameter | Low | **Expected** | High | Basis |
|---|---|---|---|---|
| Poll interval | 5 s | **2 s** | 2 s | `time.sleep(2.0)` in `agent_runtime.py`; "5 s" = a tuned/backoff variant |
| Fn-calls per poll cycle (2 endpoints) | 4 | **6** | 6 | auth may be cached (4) vs. counted every call (6) |
| Idle fn-calls / agent / month | 3.2M | **8.0M** | 8.0M | §2.1 |
| Action compute per HTTP action | 0.02 GB-s | **0.05 GB-s** | 0.12 GB-s | tiny JS action @128MB, 50ms ≈ 0.0064 GB-s; padded for cold paths/runtime overhead |
| Fn-calls per lead (4 MCP + steps + light A2A) | 25 | **40** | 70 | §2.2: ~4 MCP×3 + ~2 steps×10 + ~1 A2A×8 |
| DB writes per lead | 20 | **35** | 60 | §2.2 |
| Bytes per write (row + index) | 0.5 KB | **1.5 KB** | 4 KB | small docs w/ content + activity strings |
| A2A msgs per lead (coordination) | 0.5 | **1.5** | 4 | "light"→"moderate" coordination |
| RAG queries per lead | 0 | **1** | 3 | `_augment` runs on every step + A2A reply |
| Embedding tokens / RAG query | 40 | **80** | 200 | short query text |
| Operator dev seats (Convex+Vercel) | 1 | **1** | 2 | small team |
| MAU per customer (operator's Clerk) | 1 | **3** | 10 | dashboard logins, not end-recipients |
| `recordUsage` scan amplification | 1× | **1.3×** | 3× | §2.3 month-scan on DB bandwidth |

**Convex unit prices used:** fn-calls **$2/M** over 25M; action compute **$0.30/GB-hr** over 250 GB-hr; DB bandwidth **$0.20/GB** over 50 GB; egress **$0.12/GB**; base **$25/dev**.

---

## 4. Scenario computations

### Scenario 1 — Solo: 1 customer, 3 always-on agents, 200 leads/day (~6,000/mo)

**Function calls**
- Idle polling: 3 agents × 8.0M = **24.0M/mo**.
- Lead work: 6,000 leads × 40 = **0.24M/mo**.
- A2A: 6,000 × 1.5 msgs × 8 calls = **0.072M/mo**.
- RAG: 6,000 × 1 × 3 = **0.018M/mo**.
- **Total ≈ 24.33M function calls/mo.** Under the 25M included → **$0 fn-call overage** (barely).

**Action compute (GB-hours)**
- Idle HTTP actions: 3 agents × (267,840 calls/day → but only the 2 *action* invocations per cycle consume action-compute, ≈ 1.3 actions/s/agent) ≈ 3 × 112,320 actions/day × 30 = ~10.1M actions × 0.05 GB-s = 505,440 GB-s = **140 GB-hr**.
- Lead/A2A/RAG actions: small, ~10 GB-hr.
- **Total ≈ 150 GB-hr** → under 250 included → **$0 overage**.

**DB bandwidth**
- Writes: (6,000 leads × 35) + (6,000×1.5×5 A2A) + polling patches (claimSteps/pullInbox patch only when work exists ≈ negligible idle) ≈ 210k + 45k ≈ 255k writes × 1.5 KB × 1.3 amp = **~0.5 GB**. Reads (guards/auth dominated by idle auth query: ~10M auth reads × ~0.3 KB ≈ 3 GB) → **~3.5 GB**. Under 50 GB → **$0**.

**Convex total: base only.** 1 dev seat = **$25/mo**. (All usage inside included tiers.)

**Vercel:** dashboard for 1 customer, light traffic — well inside Pro included + $20 credit → **$20/mo** (1 seat).

**Clerk:** 3 MAU ≪ free tier → **$0** (or $0 on free; $25 if on Pro for support — modeled $0).

**Embeddings:** 18k RAG queries × 80 tok = 1.44M tok × $0.02/M = **$0.03/mo**.

| Scenario 1 | Monthly |
|---|---|
| Convex | $25 (base, 1 seat; usage within included) |
| Vercel | $20 (base, credit absorbs usage) |
| Clerk | $0 (free tier) |
| Embeddings | $0.03 |
| **Total** | **≈ $45 / mo** |

> **Note:** at 3 agents the operator is at ~24.3M of 25M included function calls — essentially **maxed out by polling alone**. A 4th always-on agent tips into overage. Cost is a **step function in agent count**, not lead count, in this regime.

---

### Scenario 2 — Team: 1 customer, 10 always-on agents, 1,000 leads/day (~30,000/mo), moderate A2A

**Function calls**
- Idle polling: 10 × 8.0M = **80.0M/mo**.
- Lead work: 30,000 × 40 = **1.2M**.
- A2A (moderate, 1.5/lead × 8): 30,000 × 12 = **0.36M**.
- RAG: 30,000 × 3 = **0.09M**.
- **Total ≈ 81.65M.** Over 25M by **56.65M** → 56.65 × $2 = **$113.3 overage**.

**Action compute**
- Idle actions: 10 agents × ~112,320/day × 30 × 0.05 GB-s = ~1.68M... let's compute: 10 × 112,320 = 1.123M/day × 30 = 33.7M actions × 0.05 GB-s = 1.685M GB-s = **468 GB-hr**.
- Work actions: ~30 GB-hr.
- **Total ≈ 500 GB-hr.** Over 250 by 250 × $0.30 = **$75 overage**.

**DB bandwidth**
- Writes: (30,000×35)+(30,000×1.5×5)=1.05M+0.225M=1.275M writes × 1.5 KB × 1.3 amp = **~2.5 GB**.
- Reads: idle auth ≈ (10 agents × 1.123M actions/day... auth read per action) ≈ 33.7M auth reads × 0.3 KB ≈ **10 GB**; guard/budget scans add ~5 GB. **~17 GB total.** Under 50 → **$0**.

**Convex total:** $25 base + $113.3 (fn) + $75 (compute) = **≈ $213/mo** (1 seat).

**Vercel:** still light dashboard usage → **$20/mo**.

**Clerk:** ~3–10 MAU → **$0** (free tier).

**Embeddings:** 90k queries × 80 tok = 7.2M tok × $0.02 = **$0.14/mo**.

| Scenario 2 | Monthly |
|---|---|
| Convex | ≈ $213 ($25 base + $113 fn + $75 compute) |
| Vercel | $20 |
| Clerk | $0 |
| Embeddings | $0.14 |
| **Total** | **≈ $233 / mo** |

> The 10 idle agents alone = 80M fn-calls = $110 of the $113 fn overage. **Leads contribute <3% of function-call cost.** This product's operator cost is ~96% *idle coordination overhead.*

---

### Scenario 3 — Scale: 100 customers like Scenario 2

Convex/Vercel/Clerk are **multi-tenant on one deployment**, so included tiers are shared **once**, not per customer. This *helps* (one 25M/250 GB-hr allowance for everyone) but is swamped by aggregate volume.

**Function calls:** 100 × 81.65M = **8,165M (8.165B)/mo**. Minus 25M included = 8,140M over × $2/M = **$16,280**.

**Action compute:** 100 × 500 GB-hr = **50,000 GB-hr**. Minus 250 = 49,750 × $0.30 = **$14,925**.

**DB bandwidth:** 100 × 17 GB = **1,700 GB**. Minus 50 = 1,650 × $0.20 = **$330**. (High case with 3× `recordUsage` amplification: ~3,900 GB → ~$770.)

**Egress:** modest dashboards; assume ~200 GB total over included 50 = 150 × $0.12 = **$18**.

**Convex total ≈ $25 base + $16,280 + $14,925 + $330 + $18 ≈ $31,578/mo.**

**Vercel:** 100 customers' dashboards. Assume ~5 GB Fast Data Transfer + ~50k function invocations *per customer/mo* (live-query subscriptions over Convex are not Vercel functions — Convex serves those — so Vercel stays light). 100 × 5 GB = 500 GB (under 1 TB included). Invocations 100 × 50k = 5M, over 1M included = 4M × $0.60/M = $2.4; credit $20 absorbs it. **≈ $20–50/mo.** Budget **$50**.

**Clerk:** assume ~5 MAU/customer × 100 = 500 MAU → free tier (≤50k) → **$0**. Even at 100 MAU/customer = 10k MAU, still within Pro's 10k or free 50k → **$0–$25**. Budget **$25**.

**Embeddings:** 100 × $0.14 = **$14/mo.**

| Scenario 3 (100 customers) | Monthly |
|---|---|
| Convex | ≈ $31,580 |
| Vercel | ≈ $50 |
| Clerk | ≈ $25 |
| Embeddings | ≈ $14 |
| **Total** | **≈ $31,670 / mo (~$380k/yr)** |

---

## 5. Derived unit economics

Using **expected** values.

| Metric | Value | Notes |
|---|---|---|
| **Cost per active agent / month** | **~$22 / agent** (S3: $31,670 / 1,000 agents) | Dominated by idle polling. ~$11 fn-calls + ~$10 compute per agent. |
| **Cost per lead processed** | **~$0.0007–0.001 / lead** (incremental) | S3 incremental: leads add ~3% of cost. Marginal lead cost is tiny; agents are the cost. |
| **Cost per lead (fully loaded)** | **~$0.0088 / lead** (S3: $31,670 / 3.0M leads/mo) | Allocating *all* infra across leads. Misleading — see §6. |
| **Cost per customer / month** | **~$317 / customer** (S3: $31,670 / 100) | Scales ~linearly; almost no multi-tenant dilution because included tiers are trivial vs. volume. |
| **Total at 100 customers** | **~$31,670 / mo (~$380k/yr)** | Convex is 99.7% of it. |

**Per-agent cost ladder (the real driver):**

| Always-on agents (total) | Convex fn-calls/mo | Convex est. /mo |
|---|---|---|
| 3 | 24M | $25 (within included) |
| 4 | 32M | $25 + $14 = $39 |
| 10 | 80M | ~$185 (fn+compute) |
| 100 | 800M | ~$2,400 |
| 1,000 | 8.0B | ~$31,200 |

---

## 6. Gross-margin view

### 6.1 Pricing at **$50 / agent / month**

| | S1 (3 agents) | S2 (10 agents) | S3 (1,000 agents) |
|---|---|---|---|
| Revenue | $150 | $500 | $50,000 |
| Infra cost | $45 | $233 | $31,670 |
| **Gross profit** | **$105** | **$267** | **$18,330** |
| **Gross margin** | **70%** | **53%** | **37%** |

**Margin erodes as you scale**, because per-agent infra (~$22) is a *fixed-ish* fraction of the $50 price and the included tiers stop helping once you're far past them. At $50/agent the operator keeps ~37% at scale — viable but not SaaS-grade (70–80%).

**Break-even on $50/agent:** infra per agent (~$22) eats the margin when an agent's *true* polling cost rises — e.g. if poll interval were 1 s instead of 2 s (~$44/agent) margin → ~12%; at the **high case** (~$50/agent infra) the $50 price is **fully consumed** — 0% margin.

### 6.2 Pricing at **$0.05 / lead**

| | S1 (6k leads) | S2 (30k leads) | S3 (3.0M leads) |
|---|---|---|---|
| Revenue | $300 | $1,500 | $150,000 |
| Infra cost | $45 | $233 | $31,670 |
| **Gross profit** | **$255** | **$1,267** | **$118,330** |
| **Gross margin** | **85%** | **84%** | **79%** |

Per-lead pricing looks **much healthier (~80% margin)** — *but only because leads are decoupled from the cost driver.* The risk is inverted: a customer who runs **many always-on agents but processes few leads** is a **loss-maker**.

**The danger quadrant (per-lead pricing):** infra eats the margin when **leads-per-agent is low**. Break-even at $0.05/lead with $22/agent/mo infra requires **≥ ~440 leads/agent/month (~15/day/agent)**. Below that, the idle agent's polling cost exceeds the lead revenue.

| Leads / agent / mo | Revenue/agent @ $0.05 | Infra/agent | Margin |
|---|---|---|---|
| 200 (~7/day) | $10 | $22 | **−$12 (loss)** |
| 440 (~15/day) | $22 | $22 | **break-even** |
| 2,000 (~67/day) | $100 | $22 | **+78%** |
| 6,667 (S2: 30k/10) | $150 | $22 | **+85%** |

### 6.3 Recommendation
- **Hybrid pricing**: a per-agent floor (covers the idle polling that the architecture forces) **plus** a per-lead/usage component (captures value, scales with success). Pure per-lead under-prices idle fleets; pure per-agent leaves value on the table for high-throughput users.
- **The cheapest margin win is architectural, not pricing**: idle polling is ~96% of cost. Replacing the 2 s poll with the existing `/a2a/stream` SSE path (already in `http.ts`) and/or backing off the workflow inbox when idle would cut function calls by 3–10×, turning S3 from ~$31.7k/mo to single-digit thousands. **Do this before optimizing price.**

---

## 7. Assumptions register (low / expected / high) and sensitivity

| # | Assumption | Low | Expected | High | Sensitivity |
|---|---|---|---|---|---|
| A1 | Poll interval | 5 s | 2 s | 2 s | **Extreme** — linear in fn-calls & compute; the #1 driver |
| A2 | Fn-calls counted per poll request (incl. internal calls) | 4 | 6 | 6 | High — 4 vs 6 = ±33% of dominant cost |
| A3 | Action compute per HTTP action | 0.02 GB-s | 0.05 GB-s | 0.12 GB-s | High — drives the compute overage line |
| A4 | Fn-calls / lead | 25 | 40 | 70 | Low at scale (leads <5% of cost) |
| A5 | DB writes / lead & bytes/write | 20 × 0.5KB | 35 × 1.5KB | 60 × 4KB | Low–Med (bandwidth still under tier in S1/S2) |
| A6 | A2A msgs / lead | 0.5 | 1.5 | 4 | Low–Med |
| A7 | RAG queries / lead + tokens | 0 / 40 | 1 / 80 | 3 / 200 | Negligible (embeddings ≈ $0) |
| A8 | `recordUsage` month-scan amplification | 1× | 1.3× | 3× | Med — could push DB bandwidth into overage at high lead volume |
| A9 | Dev seats (Convex/Vercel) | 1 | 1 | 2 | Low ($25–45 fixed) |
| A10 | MAU / customer (Clerk) | 1 | 3 | 10 | Negligible (free ≤50k) |
| A11 | Multi-tenant on one Convex deployment | yes | yes | per-tenant deploys | **High if false** — per-tenant deploys = +$25×N base and N× the cron floor |
| A12 | Vercel function load (Convex serves live queries, not Vercel) | light | light | heavy SSR | Med — heavy SSR could 10× Vercel, still small vs Convex |

**Scenario totals across the range (rough):**

| | Low | Expected | High |
|---|---|---|---|
| S1 (3 agents) | ~$45 | **~$45** | ~$75 |
| S2 (10 agents) | ~$90 | **~$233** | ~$520 |
| S3 (100 customers) | ~$12k | **~$31.7k** | ~$70k |

The **band is wide and almost entirely set by A1 (poll interval) and A2/A3 (per-poll fan-out & compute)** — i.e., by the always-on polling architecture, not by lead volume.

---

## 8. Bottom line (skeptical read)

1. **The operator's cost is a function of *agents online*, not *work done*.** ~96% of infra spend at scale is idle polling against Convex. Lead processing is nearly free at the margin.
2. **Convex is ~99% of the bill.** Vercel and Clerk are rounding errors at every scale (free/credit tiers absorb them). Optimization effort belongs entirely in the Convex/connector poll loop.
3. **Per-agent pricing is safe but caps margin at ~37% at scale; per-lead pricing gives ~80% margin but creates loss-makers below ~15 leads/agent/day.** A hybrid (per-agent floor + per-lead usage) is the only pricing that's both safe and competitive.
4. **There is a latent O(n²) bandwidth bug** in `recordUsage` (full month scan per metered event) that becomes a real cost/perf problem at high lead volume — fix before scaling.
5. **The single highest-ROI action is architectural**: switch idle agents from 2 s polling to the existing SSE stream / idle backoff. That one change can cut operator cost ~3–10× and flip the margin story entirely.

---

*All figures are modeled estimates from public pricing (2026-06-16) and code-derived op counts; treat as decision-grade order-of-magnitude, not a quote. Re-verify vendor prices and instrument actual Convex usage dashboards before committing to a price.*
