Addressed the review of **4e0ff89** in the local follow-up changes:

1. **Operator-note privacy:** replaced authenticated table-wide SELECT with an
   explicit lifecycle/binding column allowlist. resolution_reference and
   resolved_at are excluded. SQL tests verify owner reads are denied, ordinary
   status/binding reads still work, and service_role retains recovery access.
2. **Description:** updated the local PR description to identify 4e0ff89 and these
   follow-up corrections. Removed the stale unpublished-baseline/head claim and
   CI #112 references; fresh CI is required for the next published head.
3. **Workspace copy and marker:** creation suggests starting ingestion only when
   available; otherwise it confirms creation without a start invitation. Empty
   reviews no longer say to start a disabled operation. created=1 is consumed
   with history replacement, preserving other parameters/hash; the notice does
   not replay after reload and is hidden after ingestion succeeds.
4. **Missing SQL regressions:** tests now check the operator resolution state guard
   and directly attempt an insert that must be blocked by an expired hold's
   unique-index entry. Mutation probes reject removing either safeguard, including
   the status-only predicate, and reject restoring owner access to operator notes.
5. **Single badge:** one shared status badge appears in the workspace header;
   the panel keeps its processing/error/count feedback without a duplicate badge.
6. **Transcript privacy:** replaced local-user paths in all three affected files
   with repository-relative paths or explicit privacy placeholders.
7. **Account/configuration errors:** submission PROVIDER_AUTH, PROVIDER_BILLING and
   MISSING_API_KEY now explain that the service account/configuration needs
   attention, without blaming the saved source.
8. **Optional polling improvement:** five-second normal checks, automatic retries
   after ten and twenty seconds, then manual status retry. These only refresh the
   existing bound job. Successful checks clear transient lookup feedback.

**Validation:** 608 tests / 46 Jest suites, all 22 local Edge browser tests, all
eight SQL files across four migrations, lint, formatting, typecheck and production
build passed. The SQL mutation baseline passed and all four targeted weakened
variants were rejected. Provider data is synthetic; no paid calls were made.

Refs #18
Refs #23

The corrections and this response are prepared locally; nothing was committed,
pushed or posted to GitHub by this follow-up. After publication, fresh CI and the
separate section 7 security review are still required. Hosted verification remains
required before issue closure. Ingestion/storage flags remain off; migrations,
recovery configuration and recorded provider/source storage approval are still
prerequisites for live use.
