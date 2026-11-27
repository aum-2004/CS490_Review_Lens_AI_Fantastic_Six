# AI review follow-up — melissa — S3-002 / PR #132

Date: 2026-11-27. Tool: OpenAI Codex. Author: melissa.
Branch: `s3-002`, starting at `de2ecd6` with a clean working tree.
Text only: no images or full local paths. Environment values were not read.
The requirements, UI standards, no-push rule, and transcript preferences persist.

## User

> Reviewer feedback, please make adjustments:
>
> "Changes requested — PR #132 at de2ecd6; I reran the validator and authenticated
> database probes. Both still accept invisible-only names such as "\u034F" and
> "\uFE0F". These previously returned HTTP 200 and rendered with zero width,
> leaving visually blank analysis names. Before approval:
>
> - Reject invisible-only names in application validation and direct database updates.
> - Preserve valid multilingual and emoji names.
> - Add regression tests at both boundaries and rerun CI."

## Assistant

I’ll reproduce the invisible-name cases, update application validation and the
database policy, and add regressions for both boundaries while preserving
multilingual and emoji names. I’ll keep the work on `s3-002` and won’t push.

## Inspection and reproduced failures

Read AGENTS.md, the validator, migrations, tests, CI workflow, installed Next.js
form documentation, UI standards, and S3-002 requirements. Added regressions before
changing implementation. The initial focused run failed 11 tests and passed 137:
the validator accepted the invisible names and the rename API returned HTTP 200.
The authenticated PostgreSQL probe failed with "direct owner update accepted an
unusable name" before the new migration.

A `node -e` inspection failed because PowerShell stripped argument quotes.
Repeated it through a here-string: the reported characters and Hangul fillers
match `Default_Ignorable_Code_Point` but not `Cf`.

## Assistant

The reviewer identified a real gap: these characters are default-ignorable Unicode
characters, but they aren’t covered by the format-character check. I’ll exclude
default-ignorable characters when checking whether a name has visible content,
while retaining them within valid emoji and multilingual names. I’ll run the CI
checks locally; testing the updated code in hosted CI will require a push, which
remains prohibited.

## Accepted changes and focused verification

The shared name validator ignores default-ignorable/format characters only for
the meaningful-content test; it keeps valid selectors, accents, and joiners in
stored names. A new, separate migration expands the rename policy's meaningful
content class using explicit Unicode ranges and preserves its ownership and
unsafe-character predicates. Earlier migrations are unchanged; no rows are
rewritten and no new dependencies are introduced.

Added tests for the reported characters, mixed invisible strings, supplementary
selectors, Hangul fillers, and Mongolian selectors. Positive tests preserve
decomposed accents, Devanagari, CJK variation sequences, emoji selectors, and
existing ZWJ/ZWNJ names. Both create and rename APIs reject invisible-only input
before persistence. Browser tests check inline errors and a visible accented/emoji
name. Existing source/review/ingestion/Q&A quota and foreign-owner checks remain.

The focused validation/API run passed 166 tests. The full disposable PostgreSQL
suite passed with the new migration, including security and concurrency tests.
Used a temporary normalized copy of the existing shell runner for Windows line
endings; no tracked runner or shared database was changed.

## Assistant

The new regressions reproduced HTTP 200 responses and a successful direct database
write for invisible-only names. The focused validator/API tests and full database
suite now pass. I added a new migration so existing databases can receive the fix
without changing earlier migration files; accented text, Devanagari, CJK variation
sequences, and emoji remain unchanged.

## Interrupted final checks

The initial production build, lint, typecheck, formatting, and migration checks
passed. The final unit/coverage and browser sessions were interrupted before
their results could be collected. Process sessions were no longer available;
the coverage report was still an older report. Restarted final verification and
did not claim the interrupted tests or stale coverage as successful.

A combined documentation-edit tool call was also aborted and had made no changes;
reapplied the documentation and this transcript after inspecting the working tree.

## Assistant

The final test sessions were interrupted before results were collected. I’m
restarting those checks so the reported results reflect the current code.

Final results are recorded after execution. No push or hosted-CI run is claimed;
the new migration must be applied to shared Supabase through the team's normal
process after the earlier rename migrations.

## Assistant

All 9 browser regressions passed, including rejection of the reported invisible
names and successful saving of an accented name with an emoji variation selector.
Build, lint, typecheck, formatting, and migration checks also passed. The full
unit/coverage run is still in progress.

## Assistant

The full suite passed: 2,119 tests across 115 suites. I’m checking the final
changed-code coverage report and recording the results in the text-only transcript.
The new migration will need to be applied to Supabase after the earlier rename
migrations before the reviewer repeats the database probes.

## Final local verification and handoff

- Full unit/coverage regression: **115 suites, 2,119 tests passed**, exit 0.
- Production browser regression: **9 passed**, including invisible-name rejection,
  visible accented/emoji name preservation, source/review/Q&A preservation,
  owner isolation, saved analyses, switching, and supporting review evidence.
- Full PostgreSQL security/concurrency suite passed with the new policy and
  both invalid/valid Unicode regression sets. This result was collected before
  the later test-session interruption; the SQL did not change afterward.
- Lint, typecheck, formatting, build, and migration-version checks passed.
- Final coverage gates passed using the completed new report: **100% (416/416)**
  against local `origin/main` and **100% (4/4)** against starting HEAD `de2ecd6`.
- Removed the temporary database runner and stopped only the two browser-test
  servers started for the completed run. No dependencies, CI workflow, earlier
  migrations, shared database records, or environment files were changed.
- Changes remain local on `s3-002`; nothing was pushed and hosted CI for the
  changed code has not run. The user must publish changes to run hosted CI and
  apply the new migration through the team's database workflow before repeating
  the authenticated Supabase probes. No reviewer message was sent automatically.

Accepted the shared default-ignorable-aware content check and separate RLS policy
migration. Kept valid marks/selectors/joiners in stored names. The transcript
includes melissa and contains no images or full local paths.
