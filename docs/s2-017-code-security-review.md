# S2-017 functionality and security review

Author: melissa. Tool: Codex. Branch: `s2-017`. Date: 2026-11-15.

## Scope and findings

Reviewed the complete local S2-017 diff, including the new switcher, server workspace integration,
ingestion labels, tests, and documentation. Traced the existing session, ownership, repository,
RLS, review-loading, Q&A route, context builder, and browser response-validation boundaries.
Checked S2-BR-001, S2-BR-014, S2-BR-022–026 and the supplied UI/UX standards.

1. **Fixed: ambiguous selection for duplicate target names.** Target names are not unique.
   Name-only links could leave the user guessing which dataset they would open. Switcher links
   now include the saved source URL as text, including in the accessible name. A regression test
   verifies that identically named targets retain distinct source labels and internal routes.
2. **Fixed: keyboard dismissal and focus.** The disclosure now closes on Escape and restores
   focus to its trigger. Component and production browser checks cover this behavior.
3. **Strengthened security regression evidence.** Workspace tests explicitly verify the ordering
   of authentication, ownership, and list retrieval, and that denied targets never trigger list
   retrieval. Untrusted name/source text is tested for escaped rendering; the source text never
   becomes a navigation URL in the switcher.

No unresolved security defect was identified in this branch's changes. This is an AI-assisted
local review, not independent human approval or a penetration test.

## Functionality review

- The URL remains the active-target identity; links preserve normal reload and history behavior.
- Workspace title, platform/source/status, ingestion identity, and Q&A identify the active target.
- The current target remains visible in the bounded list even when outside its returned rows.
- Selection uses links; the disclosure uses the shared outline Button, expanded state, associated
  navigation region, visible focus styling, and keyboard controls. Sources wrap within the list.
- Empty and failed lists have clear explanations and a route back to My Targets. A list outage
  does not erase the loaded workspace or change the selected target.
- The existing keyed Q&A form resets on target changes and history restoration, aborts pending
  work, ignores late answers, and sends subsequent requests to the selected target's endpoint.
- Unavailable/empty saved reviews disable the normal Q&A action. The backend independently
  refuses empty context before invoking a model.

## Security review

- **Authentication:** server workspace and API routes verify the session; the new component
  cannot choose an owner identity. No protected reads occur when authentication redirects.
- **Authorization and disclosure:** target ownership is checked before list or child reads. The
  list uses the existing explicit owner filter and session-scoped Supabase client. Foreign,
  missing, and malformed targets remain indistinguishable. RLS remains unchanged.
- **Data minimization:** the client switcher receives only target ID, name, and source URL.
  Ownership metadata, job details, tokens, and provider credentials are not added to its props.
- **Injection and navigation:** React escapes target text. The source is text, while the actual
  href uses a fixed internal route and encoded target ID. No HTML injection or external redirect
  mechanism was introduced.
- **AI isolation:** the existing server context builder rechecks identity/ownership and reloads
  reviews for each question. No global active-target store, shared context cache, previous model
  conversation, or client-supplied review dataset was introduced. The browser API client checks
  that the answer's target ID matches the request.
- **Errors and logs:** switch-list failures use fixed safe UI copy and category-only logging;
  raw database/provider errors are not displayed or logged by the new catch block.
- **Scope:** no schema, grants, RLS, dependency versions, secret handling, or provider integration
  changed. The existing 200-target list limit remains; this story adds no pagination.

## Review limits

Backend isolation is exercised by deterministic integration tests with the real service/route
pipeline and fixture databases/providers. Production browser tests use local identity/database
fixtures; mocked successful model responses test UI behavior without paid calls. A real hosted
Supabase RLS run and live-model evaluation were not performed for this UI change. Hosted CI and
the teammate/security review required by repository standards remain pending a future PR.

## Final validation

- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run check:migrations`, and
  `npm run build`: passed.
- Full Jest suite with coverage: 80 suites, 1,468 tests passed.
- Changed-code gate against starting `HEAD`: passed, 100% (112/112 changed lines).
- Production Playwright: 14/14 target-switching, workspace, and Q&A tests passed, including
  keyboard operation, history/reload, responsive layout, logout, and cross-user denial.
- Inspected the regenerated 375px screenshot after the source labels were added: links and
  sources wrap within the viewport and the list scrolls internally.
- No push, commit, published PR, deployment, or dependency upgrade was performed.

Transcript: [melissa / Codex review](../ai-transcripts/2026-11-15_melissa_S2-017_review_codex.md).
