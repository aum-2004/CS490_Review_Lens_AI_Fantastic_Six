Addressed the functionality and security feedback in
[f9cc17a](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/commit/f9cc17a).

- **Unavailable-ingestion guidance:** the workspace now calculates the unavailable
  reason once and reuses it for ingestion and Q&A. Disabled collection, unapproved
  storage, and missing recovery configuration no longer tell users to complete
  ingestion or resolve a failure through a disabled action. Added 12 tests across
  fresh, failed, processing, and completed ingestion, plus three tests confirming
  that saved reviews still permit Q&A under those configuration blockers.
- **S2-019 integration:** updated from main containing merged #92 and #80, resolved
  the component conflict, and retained the verified-user key, Activity cleanup,
  cancellation, stale-response guards, and the workspace's verified user ID. Both
  stories' tests remain. S2-019 files are unchanged in the remaining PR diff.
- **PR links:** the local PR-description draft uses full GitHub blob URLs for all
  transcript and documentation links.

The branch is also reconciled with main through merged S2-017 (#91) and S2-018
(#93). Their target-switching behavior, corrected badge assertions, and single
summary-RPC fixture are retained without unrelated changes in the remaining diff.
S2-020's empty-target browser test now uses an existing separate fixture account so
it does not affect seeded workspace badge counts.

Latest local verification: 89 suites / 1,596 tests passed, all 36 authenticated
production-browser tests passed, changed-line coverage is 100%, and lint,
typecheck, formatting, build, and scoped diff checks passed.
Browser tests now include summary context, keyboard switching, and cross-user
denials using the merged local fixture. No live provider or deployed database
operations were performed.

Once GitHub CI completes on the updated branch, please reconfirm the functionality
and security fixes against the linked implementation commit.
