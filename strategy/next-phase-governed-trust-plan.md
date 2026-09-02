# From calibrated trust to governed trust

**Next phase · SAGE Smart Budgeting · 2026-09-02 · Frame and integration confirmed**

A twelve-week plan that turns the capstone's trust UX for one grant manager into trust
infrastructure for an institution: a Purple agent at four named nodes inside a deterministic
pipeline, connected over MCP to a server whose tool registry is the policy and whose request log
is the audit trail.

Written against a job description whose stated interests are building trusted AI systems, shaping
how organizations safely adopt autonomous technology, defining a new category of AI-native
software, and, as nice-to-haves, governance, observability, compliance, security, risk management,
enterprise administration, evaluation frameworks, model monitoring, lineage tracking,
auditability, AI operational tooling, and enterprise customers deploying AI at scale.

> **Authorship.** The prototype is Team ORBIT's capstone work. This next phase is solo work.
> Every artifact that describes it should say so.

## Decisions taken 2026-09-02

- **Frame.** A governance project with an agent inside a deterministic pipeline, not an agent
  project. The agent is called at four fuzzy nodes; everything else stays code.
- **Backend.** UW Purple, the university's enterprise generative AI tool: a UW-managed Azure
  environment with approved models and custom agents, where data stays in UW Azure and is not used
  for training. Approved for FERPA records; not approved for HIPAA data, UW Medicine data, CUI, or
  confidential research data.
- **Integration path: MCP.** Purple's guidance for backend integrations offers RESTful API
  connections ("not preferred, but broadly supported") or MCP server connections ("strongly
  recommended"). We build a SAGE MCP server that the Purple agent connects to. Beyond Purple's
  preference: each MCP tool carries a typed input schema, so validation happens at the boundary;
  the tool list is one choke point for policy and logging; and a tool that is not registered cannot
  be called, which is how Tier 1 is enforced.
- **No ORIS tool-owner admin page.** Governance lives in a policy file and in which tools the
  server registers. The research-administration roles in the workflow (grant manager, PI, OSP/GCA
  reviewer) remain and are the human gates.

### Still open

Only the tail of the JD was shared; the plan assumes a product-management role at an AI governance
or observability company. Two smaller Purple unknowns: how a custom agent authenticates to an
external MCP server, and whether agents can be run programmatically for batch evaluation. Phase 0
checks both.

---

## 01 / Diagnosis

### The capstone proved trust for one person at one moment. The JD asks for trust across an organization over time.

The prototype's trust affordances are real and tested: confidence chips, source tags, stale flags,
"why this value", preview-then-confirm auto-fix, a structured diff before write-back, and a submit
gate. Every one of them is per cell, per person, per moment.

The JD's vocabulary describes the second-order view: what did the AI do across 75 awards, several
grant managers, and twelve months. What was verified, what was overridden, is the AI earning or
losing trust, who set the rules, and can an auditor reconstruct any number.

The capstone's own technical guide (Stakeholder Report §11) already lists the missing half and
addresses it "to the team that builds this": an AuditEntry entity, an "evaluation & monitoring"
caveat, guardrails, and auditability requirements. None of it is built. The plan is to be that team.

> **Reframe, one line.** Act one was system of record → system of work. Act two is system of work →
> system of accountability: calibrated trust for a user becomes governed trust for an institution.

---

## 02 / Gap table

### JD vocabulary against what exists in the repo today

| JD term | What the capstone has | What is missing | Evidence |
|---|---|---|---|
| **Auditability** | Principle: "a GM can defend any cell to an auditor weeks later" (report §7). AuditEntry in the §11 data model. | No audit trail exists in code. "Comments & History" is a label on the ASR screen, not a log. | `grep` for `AuditEntry` / `auditLog` over `sage-prototype/src` returns 0. Stub label at `screens.tsx:3525`. |
| **Lineage tracking** | Source tag on every pre-filled value; NoA fields carry a page citation such as `NoA · §20`. | No chain from NoA page → extracted field → worksheet row → SAGE object code → ASR line. Each hop shows its own source; nothing links the hops. | `SourceTag` in `ui.tsx:104`; extraction table at `screens.tsx:3151–3164`; `DiffMapping` exists only in the report. |
| **Evaluation frameworks** | Categorical confidence (High / Medium / Low) with a rationale per level. | Confidence is a hardcoded string, not a measured property. "High" means "came from a system of record", never "97% field accuracy on a gold set". §11 names field-level error tracking; nothing implements it. | `ConfidenceChip` at `ui.tsx:87–96`; every confidence value in the NoA table is a literal. |
| **Model monitoring** | The trust mapping names the two metrics that matter: over-trust (do users catch the AI when it is wrong?) and trust decay over weeks. | Neither is measured. The usability study measured liking and moments of doubt, not catch rate. No time series of anything. | `smart-budgeting-trust-mapping.md`, "Where to push harder". |
| **Governance / policy** | AI4RA tiers (never / assist / lead) are the design's spine. | Tiers are prose principles. The 6-month stale-rate rule lives inside a tooltip string. The AI toggle is per-session state. No policy object, no versioning, nothing that limits what the AI can call. | Stale rule in tip text at `ui.tsx:91`; `aiOn` state at `App.tsx:92`. |
| **Compliance / security** | NFRs: FCOI/SFI status only, salary PII protected, access logged. | Prose only. Nothing masks by role or logs access. | Report §11, non-functional requirements. |
| **Enterprise administration** | "Up to 75 concurrent awards"; a department list with variable RA rates. | No portfolio view. No per-unit policy. The department list is a seed for per-unit overrides that was never used that way. | `UW_VARIABLE_RA_DEPARTMENTS` at `screens.tsx:324`. |
| **AI operational tooling** | The report says "AI features via the Anthropic SDK". | No LLM call exists. NoA extraction reads mock rows; the only fetch is the sample PDF. The claim must be corrected before anything is built on it. | `screens.tsx:3135` is the only fetch; no SDK in `package.json`. |

The pattern in the third column: the design promises governance properties in the UI copy and the
report, and the code simulates them. For a governance role that gap is the whole job, so closing it
is the portfolio story.

---

## 03 / Frame

### NIST AI RMF as the spine

The NIST AI Risk Management Framework has four functions. Using it gives the work a vocabulary the
JD's world already speaks, and it makes the gap honest: the capstone did Map well; the next phase
builds Govern and Measure.

| Function | What it covers | Status | Where it stands / goes |
|---|---|---|---|
| **Map** | Identify context, risks, and where AI is appropriate. | **Strong** | AI4RA tiering, risk and compliance indicators, the HAX + PAIR mapping table. Phase 0 turns it into a risk register. |
| **Manage** | Controls that act on identified risk. | **Partial** | Guardrails and preview-then-confirm exist as UX. Nothing enforces them. Phases 1 and 3. |
| **Govern** | Policies, roles, accountability, change control. | **None** | No policy object, no record of who changed what, no limit on what the AI can call. Phase 3, policy as code and tool registration. |
| **Measure** | Evaluations, monitoring, metrics with thresholds. | **None** | Confidence labels are typed, not measured. No time series. Phases 2 and 4. |

---

## 04 / Agent boundary

### The pipeline runs the agent, not the other way round

The workflow is deterministic: extract, reconcile, fill from rate tables, derive dollars to
percent, diff, write back, checklist, submit. A pipeline does that better than an agent because it
is reproducible, which is what an auditor needs. The agent is called at four nodes where the input
is unstructured or the case cannot be resolved by rules. Every node has a typed input, a typed
output with provenance, a gate after it, and a trace.

| Node | Input | Output, typed with provenance | Gate after the node | Tier → tool policy |
|---|---|---|---|---|
| **NoA intake** | NoA PDF; format varies by sponsor | Fields `{value, page, confidence}` against a fixed schema | Rules diff against the proposal; GM verifies Medium and Low | Tier 3 → callable |
| **Source fetch** | Rate request `{type, FY, unit}` where no API exists (Grad School tables, OPB dashboard) | `RateValue {value, url, effectiveDate}` | Rules compute; stale check | Tier 3 → callable, read-only |
| **Exception triage** | A typed mismatch the rules could not resolve, plus the budget | Two or three reallocation scenarios, each as a diff | Rule check (NIH cap, MTDC base), then the GM picks in preview | Tier 2 → output to preview only |
| **Guideline review** | The budget plus the sponsor's guideline document | Flags `{line, rule, citation}` | The deterministic checklist gate | Tier 2 → output to preview only |
| **Write-back and submit** | — | — | Human only | Tier 1 → no tool registered |

### Where the MCP server sits

```
┌─────────────────────────────────────────────┐
│ Purple custom agent — LLM runtime · UW Azure│
│  · Reads the NoA, reasons, decides which    │
│    tool to call                             │
│  · Knows the four nodes and nothing else    │
└─────────────────────────────────────────────┘
              │  MCP · Streamable HTTP · authenticated
              ▼
┌─────────────────────────────────────────────┐
│ SAGE MCP server                             │
│ Cloud Run + SQLite, or Netlify Functions    │
│ + Blobs                                     │
│  · Tool registry built from policy.json     │
│  · Audit log of every tool call             │
│  · Budget store and lineage export          │
│  · Validates schemas, enforces thresholds,  │
│    routes previews                          │
└─────────────────────────────────────────────┘
              │  REST · app reads state, posts GM actions
              ▼
┌─────────────────────────────────────────────┐
│ Prototype app — React · Netlify             │
│  · GM, PI, and reviewer screens render the  │
│    store                                    │
│  · Screens untouched; data source swapped   │
│    behind them                              │
└─────────────────────────────────────────────┘
```

The agent never touches the app. It calls tools on the server; the server validates, logs, and
writes to the store; the app renders the store. Three properties fall out of that shape, and they
are why no admin page is needed.

- **Policy as config.** The policy file decides which tools the server registers and in which mode.
  Git history is the change log.
- **AI4RA tiers as tool registration.** Tier 3 tools are registered and callable. Tier 2 tools are
  registered, but the server routes their output to a preview queue and never applies it. Tier 1
  actions are not registered at all. The agent cannot submit because there is no tool to call.
- **Trace as lineage.** The server logs every tool call with inputs, outputs, and citations. The
  agent's audit trail is not a separate feature. It is the request log with a schema.

> **Purple fit.** Award notices and rate tables are within Purple's approved data. The one
> confidential item in the flow, FCOI content, is already excluded by the design's "status only"
> rule. Salary data should be checked against UW's data classification before it is sent;
> Washington public-employee salaries are public record, but verify. Phase 0 writes this down.

### The tool surface

| Tool the server registers | Kind | What the server does |
|---|---|---|
| `get_budget(budgetId)` | read | Returns the worksheet with sources and effective dates |
| `stage_noa_fields(budgetId, fields[])` | write to staging | Validates each field against the schema; rejects any field without a page citation; fields below the confidence threshold go to the verification queue |
| `fetch_rate(type, FY, unit)` | read, deterministic | Structured fetch of the rate table; returns a rate value with URL and effective date |
| `get_mismatches(budgetId)` | read | Output of the rules engine, typed as rounding, substantive, or missing |
| `propose_scenarios(budgetId, scenarios[])` | write to preview | Runs guardrail checks; stores scenarios for the GM to pick; never applies |
| `flag_guideline_issue(budgetId, line, rule, citation)` | write to checklist | Adds a warning to the pre-submit checklist |
| `write_to_sage`, `submit` | **not registered** | No handler exists. A test asserts they never appear in the registry under any policy file in the repo. |

```json
{
  "tools": {
    "get_budget":           { "tier": 3, "mode": "callable", "readOnly": true },
    "stage_noa_fields":     { "tier": 3, "mode": "callable" },
    "fetch_rate":           { "tier": 3, "mode": "callable", "readOnly": true },
    "get_mismatches":       { "tier": 2, "mode": "callable", "readOnly": true },
    "propose_scenarios":    { "tier": 2, "mode": "preview" },
    "flag_guideline_issue": { "tier": 2, "mode": "preview" },
    "write_to_sage":        { "tier": 1, "mode": "not_registered" },
    "submit":               { "tier": 1, "mode": "not_registered" }
  },
  "confidenceThresholds": { "high": 0.95, "medium": 0.80 },
  "staleRateMonths": 6,
  "guardrails": [
    { "id": "nih_salary_cap",     "effect": "block" },
    { "id": "mtdc_subaward_25k",  "effect": "block" },
    { "id": "cross_fy_split",     "effect": "warn"  }
  ]
}
```

**Hosting.** The server must be reachable from Purple's Azure environment, so it needs a public
HTTPS endpoint with authentication and a persistent store. Simplest for a prototype: a small Node
service on Cloud Run, already used for the legacy mockup, with SQLite. Alternative: Netlify
Functions with Netlify Blobs. Either way the tool surface stays minimal and every request is
authenticated and logged.

---

## 05 / Phases

### Six phases, each shipping a demo increment and a PM artifact

Estimates assume 8 to 10 hours a week alongside a job. A PM portfolio needs both the thing and the
decision record behind it, so every phase ends with a document as well as a screen. The MCP server
is the spine, so it starts in Phase 1 rather than waiting for the AI work in Phase 2.

### Phase 0 — Correct and reframe

*Week 1 · ~7 h · Function: Map · JD: risk management, compliance*

- **Fix the SDK claim.** In the stakeholder report §11 and the case study, change "AI features via
  the Anthropic SDK" to "AI behavior is simulated against fixed data; the production pipeline is
  specified in §11". A governance story cannot open with an unverified claim.
- **Rewrite the strategy doc.** Move "Trust & AI scaffolding" out of *Not working on* and into a
  named next-phase track, *Governed trust*. Keep the capstone scope statement intact above it.
- **Write the AI risk register** (one page, about ten rows): description, likelihood, impact, AI4RA
  tier, the mitigating control, where evidence would live. Seed rows: wrong extraction accepted
  unchanged; stale rate used; NIH salary cap breached by an auto-fill; salary PII shown to a
  reviewer role; auto-fix applied silently; accuracy drifts by sponsor format; policy changed with
  no record; over-trust of High-confidence fields; MCP server reachable without authentication.
- **Write the data-handling note for Purple.** For each thing the pipeline sends to the model (NoA
  text, rate requests, budget lines, guideline text), its UW data classification and whether
  Purple's approved list covers it. FCOI content: never sent. Salary: verify classification.
- **Check the two remaining Purple unknowns** in the knowledge base or with UW-IT: how a custom
  agent authenticates to an external MCP server, and whether agents can be run programmatically for
  batch evaluation. The answers set the hosting choice and the eval design in Phase 2.

**Artifact** · `strategy/ai-risk-register.md`, `strategy/purple-data-handling.md`, and a revised
`STRATEGY.md`

### Phase 1 — MCP server skeleton, audit trail, lineage

*Weeks 2–4 · ~18 h · Function: Manage · JD: auditability, lineage tracking, AI operational tooling*

**Build, server side**

- A Node MCP server over Streamable HTTP with bearer-token auth. The tool registry is built at
  startup from the policy file; tools whose mode is not registered are never added. Start with the
  read tools only; the write tools arrive in Phase 2.
- An audit entry store: cell, field, before, after, actor (`ai` / `gm` / `system` / `rule`), source,
  source effective date, confidence at write, tier, tool name, timestamp. Append-only.
- Every MCP tool call is logged as an entry with the actor `ai` and the tool name, before and after
  the handler runs.
- A read endpoint for the app, a post endpoint so the app can record grant-manager actions in the
  same log, and an export of the trail as JSON and CSV. The report already names the export as a
  requirement for OSP and GCA review.

**Build, app side**

- The app reads the budget from the server and posts an audit entry from every write path: AI
  prefill, verify row, the Personnel panel update, Apply Fix, and the eGC1 / ASR copy actions. Wrap
  the setters; do not refactor the screens.
- A per-cell history popover, so the "Comments & History" label becomes real.
- A lineage panel: click a number on the ASR screen and see its chain back to the worksheet row,
  the rate value with its effective date, and the NoA field with its page.

**Tests that encode intent**

- A staged AI write with no source is rejected by the server.
- `write_to_sage` and `submit` never appear in the tool registry, under any policy file in the repo.
- Every ASR line resolves to at least one audit entry.

**Artifact** · `docs/audit-trail-spec.md`: the five questions an OSP auditor asks about a number,
and the export column that answers each

### Phase 2 — Purple agent, write tools, evaluation harness

*Weeks 5–7 · ~24 h · Function: Measure · JD: evaluation frameworks, model monitoring, AI operational tooling*

**Build**

- The write tools: staging NoA fields (schema validation, page citation required, threshold routing
  to the verification queue) and the deterministic rate fetch. Scenario proposals and guideline
  flags if time allows.
- A Purple custom agent connected to the server over MCP, with a system prompt that names the four
  nodes and nothing else. This is the live demo path: drop a NoA in Purple, watch the fields stage
  in the prototype with page citations and confidence.
- A gold set: 10 to 15 public NIH and NSF Notices of Award, hand-labeled, under `evals/gold/`.
- `evals/run.ts` drives the NoA-intake node over the gold set through the same MCP server and
  reports field-level accuracy, citation accuracy, and a breakdown by sponsor format. The results
  file is committed to the repo. If Purple agents cannot be run programmatically, the harness drives
  the model through the Claude API with the same tools, and the model card records that the eval
  model may differ from Purple's runtime model. That gap is itself a monitoring reason: Phase 4's
  in-app verification outcomes are what catch drift between the two.
- Derive the confidence thresholds from the measurements. "High" becomes "this field scored at least
  95% on the gold set"; "Medium" 80 to 95; "Low" below. The thresholds live in the policy file and
  the server enforces them at staging; the chip tooltips read from the results file. The label is
  earned, not typed.
- A short model card for the extraction step: fields, accuracy, known failure modes, thresholds,
  eval model versus runtime model, and what would move a field to a stricter tier.

**Deterministic core stays deterministic**

- Unit tests asserting that F&A, fringe, tuition, and dollar-to-percent math never come from a tool
  call's payload. This is the AI4RA rule as a test, the strongest form the principle can take.

**Artifact** · `evals/README.md`, `evals/model-card.md`, and `docs/agent-boundary.md`: the four
nodes, their contracts, their gates, and the tool table above, kept current

### Phase 3 — Policy modes and enforcement tests

*Week 8 · ~6 h · Function: Govern · JD: governance, compliance, safe adoption*

No admin UI. The governance surface is the policy file and the server's tool registry, which Phase 1
already reads from it. This phase makes the modes real and proves them.

**Build**

- **Preview routing.** Tools in `preview` mode store their output in a queue that only a human can
  apply. The app shows the queue as the existing two-step Apply Fix.
- **The GM screens read the policy.** Set NoA staging to off and the fields render blank with "enter
  manually". The hidden 6-month stale rule now comes from the file.
- **Policy is versioned.** On startup, if the policy file differs from the last loaded version, the
  server writes an audit entry with the actor `system` and the diff. Git history carries the author.
- **Per-unit overrides** seeded from the existing department list, as a `units` block in the file.
- **Role-based data handling** for the roles that already exist in the workflow: salary masked for
  the reviewer role; FCOI shown as status only. Access to a masked field writes an audit entry.
- **Enforcement tests.** For every policy file in the repo, including test fixtures: Tier 1 tools are
  never registered; Tier 2 tools never write outside the preview queue; a read-only tool has no
  write path.

**Artifact** · `docs/policy-model.md` and a one-page "who can change what" table covering ORIS as
policy-file owner, OSP/GCA as the reviewer gate, and GMs for verification and override

### Phase 4 — Observability dashboard

*Weeks 9–10 · ~14 h · Function: Measure · JD: observability, model monitoring, risk management*

**Build an AI Operations view**, a screen in the prototype fed from the server's audit log and the
eval results.

- Extraction accuracy over time, from the eval results plus in-app verification outcomes.
- Accept, edit, and override rate per field and per grant manager.
- Stale-rate incidence and guardrail trigger counts.
- Tool-call volume and rejection counts per tool. The MCP log makes this free.
- Time-to-submission and round-trip count, the two metrics the strategy doc already defines.
- Over-trust rate: the AI was wrong and the value was accepted unchanged. Requires seeded-error
  sessions, which is also the study design the trust mapping asked for.
- Trust-decay curve: accept rate by week.
- **One alert rule, made real:** if a field's accuracy falls below its threshold for two consecutive
  weeks, that tool's mode in the policy file tightens to `preview`, the server re-registers, and the
  change writes an audit entry. This is the §11 caveat ("reinstate stricter human review if quality
  declines") turned into a mechanism.

Data comes from Phase 1 events and Phase 2 results. Where sessions are synthetic, the UI says so.
Never show a number the harness did not produce.

**Artifact** · `docs/metrics.md`: each metric with formula, source event, owner, and action threshold

### Phase 5 — Scale and the story

*Weeks 11–12 · ~12 h · JD: enterprise customers at scale, defining a new category*

- **Portfolio view:** 75 awards for one GM, each showing AI status (in flight / pending verification
  / blocked by guardrail). This is the "at scale" screen.
- **Seeded-error study:** three GMs or proxies, two planted extraction errors each, measure catch
  rate. Small, but it is the first real over-trust number the project has.
- **Second case study,** "From calibrated trust to governed trust". Update the portfolio page, the
  STAR doc, and the resume bullets through the casestudy skill. State plainly that the capstone was
  Team ORBIT's and the next phase is solo work.
- **A short point-of-view essay** on the category: a control plane for AI in regulated administrative
  work, generalizing "the contract" from report §12. The MCP server as governance surface is the
  essay's centerpiece: the tool registry is the policy, the request log is the audit trail.

---

## 06 / Retrospective

### If the original ORIS problem were tackled with this lens

- **Start from the institution's accountability, not the grant manager's pain.** When an AI-filled
  number goes to NIH, ORIS and OSP are accountable. The first artifact would be the risk register,
  and the GM experience would be designed inside that envelope, not before it.
- **Evals before UI promises.** A confidence chip is a claim. The gold set and the harness are the
  evidence. Build the harness before the chip gets a color.
- **Instrument from day one and test for over-trust.** The study measured whether GMs liked the flow
  and where they wanted to double-check. A governance lens plants errors and measures whether they
  were caught.
- **Treat the trust-mapping table as a control catalog.** Every HAX / PAIR feature becomes a control
  with an owner, a piece of evidence, and a test. That is the shape of SOC 2 and NIST control lists,
  and it is what an enterprise buyer's security review asks for.
- **Keep the deterministic core deterministic, and name the agent's four nodes on day one.** The
  capstone reached the first half. Naming the nodes, their gates, and the tools that will never
  exist is what turns "deterministic-first" from a principle into an architecture.

---

## 07 / Sequencing

### With four weeks instead of twelve

**Order.** Phase 0 → 1 (server skeleton with read tools and the audit log) → 3 (modes and
enforcement tests, small) → 2 (offline evals, partial). Skip 4 and 5.

A running MCP server whose registry is the policy, with a request log that is the audit trail, is
the single most verifiable artifact for the JD. Evals come next. The dashboard needs both to exist
first.

---

## 08 / Talking points

### What to say once the work exists

| JD line | The sentence, with the evidence behind it |
|---|---|
| **Trusted AI systems** | Every AI value carries source, confidence, and a measured accuracy behind the confidence label. The label reads from the eval results file; the server enforces the threshold. |
| **Safely adopt autonomous technology** | The agent runs at four named nodes inside a deterministic pipeline. Tier-1 actions have no tool registered, so "AI never commits" is enforced by architecture and by a test, not by copy. |
| **Governance, auditability, lineage** | The MCP server's tool registry is the policy and its request log is the audit trail; grant-manager actions land in the same log. Policy is a versioned file. Any ASR number traces back to a NoA page. |
| **Evaluation frameworks, model monitoring** | A gold set, a harness that runs through the same server as production, thresholds derived from measurement, and one alert rule that tightens the policy file on its own. |
| **Enterprise customers at scale** | ORIS is the buyer, GMs are the users, OSP is the auditor. Per-unit policy overrides, a 75-award portfolio view, and a data-handling note aligned to the enterprise AI platform's approved data. |
| **Defining a new category** | A control plane for AI in regulated administrative work: typed nodes, gates, tool registration as policy, and trace as lineage, generalized from the four-part contract in the capstone report. |

---

## 09 / Risks

### Risks to this plan

- **Purple auth and automation are unverified.** How a custom agent authenticates to an external MCP
  server, and whether agents can be batch-run, are unknown until someone checks the knowledge base
  or asks UW-IT. Phase 0 resolves both; the eval fallback is the Claude API with the same tools.
- **A public MCP endpoint is an attack surface.** Bearer-token auth, a minimal tool surface, rate
  limiting, and no real SAGE behind it. The prototype has no production data, but the server should
  be built as if it did, because that is the point of the exercise.
- **The prototype becomes client–server.** The app currently holds all state in React memory. Moving
  the budget to the server is the largest hidden cost in Phase 1; keep the screens untouched and swap
  the data source behind them.
- **Eval model versus runtime model.** If Purple cannot be driven programmatically, the harness
  measures a different model than the one grant managers use. Record it in the model card; treat
  in-app verification outcomes as the runtime measurement.
- **Scope creep in a 4,200-line single file.** Add `audit.ts`, `policy.ts`, `server/`, and `evals/`
  as new modules. Wrap existing setters; do not refactor `screens.tsx`.
- **Honesty of the dashboard.** Synthetic sessions must be labeled synthetic in the UI. Eval numbers
  come from the harness or do not appear.
- **Authorship.** The prototype is Team ORBIT's work. The next phase is solo; say so in every
  artifact that describes it.
- **CI parity.** Run what Netlify runs (`npm run build`, which includes `tsc -b`), not
  `tsc --noEmit`. This bit the project once already.

---

Prototype: [hcdeorbit.netlify.app](https://hcdeorbit.netlify.app/) ·
Repo: [github.com/jiyae619/sage-prototype](https://github.com/jiyae619/sage-prototype) ·
Published page: [SAGE Governed Trust](https://claude.ai/code/artifact/9033206b-933c-4961-b957-a8a4d5a28e3b)
