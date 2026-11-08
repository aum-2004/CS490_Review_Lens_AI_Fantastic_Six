# S1-018 / S1-023 review-fix continuation

Retention follow-up: the original user/assistant messages have now been recovered
from this task's local session log in `2026-11-06_codex_S1-018-S1-023_original.md`.
The export-pending notes below are historical; link that transcript in the PR.

Date: 2026-11-06, America/New_York. Tool: OpenAI Codex. No sub-agents.
The earlier scope and implementation records are in the adjacent S1-018/S1-023
files. Retain the complete available original session export before commit;
this continuation record is not a raw tool-event export.

## User

Before speaking with 019 developers, please fix the aforementioned issues with 018 and 023.

## Assistant

I’ll fix the four issues in S1-018/S1-023, add regression tests, and rerun the relevant checks. I’ll keep the live ingestion gates off and leave S1-019 unchanged.

## Assistant

The storage-gate fix will preserve the accepted job, and stale-attempt expiry will recheck the binding under a database lock. For accepted-job recovery, I’m adding binding retries and a signed callback tied to the saved attempt. Outscraper supports a per-request callback URL, so this gives the provider-side record a recovery link without trusting a browser-supplied job ID. Both live gates will remain off.

## Assistant

The first checks pass: all 511 unit tests and all six SQL test files. The regression tests confirm that an approval outage preserves the accepted job, stale expiry cannot fail a bound job, and callback recovery can resume an uncertain attempt without another paid submission. I’m checking the browser flows and documenting how operators recover a failed binding.

## Assistant

All 19 browser tests pass. The recovery callback now verifies Outscraper’s signature over the raw body as well as the signed attempt URL, so possession of the URL alone cannot authorize a binding. I’ve documented the recovery steps and configuration requirements; the production build and final checks are next.

## Execution record

- Read current branch code and installed Next.js route-handler documentation.
- Preserved accepted jobs across storage-gate outages. Added conditional, locked
  unbound expiry and protected bound jobs against stale uncertainty finalization.
- Added three idempotent binding attempts without repeating the paid provider call.
- Checked official provider documentation for per-request webhook URLs and native
  X-Hub-Signature-256 verification. Added per-attempt HMAC correlation plus native
  HMAC verification over the raw bounded body. No provider key/callback token is
  logged or sent to browser props. Callback metadata cannot mark ingestion success
  or persist reviews; normal owner-scoped verified reconciliation remains required.
- Added late binding recovery for uncertain attempts and terminal callback
  idempotence. Added callback configuration gates, safe errors, and operator steps.
- Hidden prior success badges/announcements during new submission; completed-run
  counts are clearly labeled as historical after the request finishes.
- Full Jest: 41 suites / 514 tests passed. Full Edge auth/browser suite: 19 passed.
  All SQL assertion files passed using the existing isolated PGlite test runtime.
  Typecheck and lint passed. An intermediate formatting check found the lifecycle
  test file needed formatting; corrected and full formatting check passed.
- Reviewed sources:
  https://docs.outscraper.com/endpoints/google-maps-reviews/
  https://outscraper.com/how-to-verify-webhook-request/
  https://docs.outscraper.com/endpoints/webhook-calls/
- No live paid calls, real review persistence, hosted migrations, deployment,
  commit, push, messages to developers, or remote issue changes were performed.
- Live ingress/receipt timing was not tested against the paid provider. Signed
  callbacks were tested with synthetic metadata and the official signature scheme.
  Both main live gates remain off by default. S1-019 remains deferred.
