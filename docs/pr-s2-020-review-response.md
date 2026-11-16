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

Local verification on `f9cc17a`: 86 suites / 1,573 tests passed, all nine production
browser tests passed, changed-line coverage against main is 100% (44/44), and lint,
typecheck, formatting, build, and diff checks passed. Browser tests use the local
fixture's summary-unavailable state; S2-006 summary behavior has separate unit
coverage. No live provider or deployed database operations were performed.

The commit is currently local. Once it is pushed and GitHub CI completes, please
reconfirm the functionality and security fixes against this updated commit.
