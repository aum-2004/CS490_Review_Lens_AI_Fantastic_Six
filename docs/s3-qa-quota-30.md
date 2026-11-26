# Sprint 3 Q&A quota increase

ReviewLens permits each authenticated account to reserve 30 Q&A attempts across
all AnalysisTargets in a rolling 24-hour window. Failed answer-service attempts
also count because provider work may already have incurred cost. This raises the
maximum permitted usage sixfold from the previous five-attempt limit while
retaining the existing rolling window so reservations expire independently and
users do not wait for a fixed daily reset.

The quota is a per-account abuse and cost-control safeguard, not an application-wide
spending cap. Actual OpenAI cost depends on attempts actually made and their token usage;
raising the permitted maximum does not itself create provider calls. The OpenAI
provider, configured model, per-question token budget, review-context bounds,
system prompt, scope guards, citation checks, authentication and ownership rules
are unchanged.

## Database and application compatibility

Migration `20261125000000_increase_review_question_quota.sql` replaces only the
body of `public.reserve_review_question()`. It keeps the existing reservation
table and rows, authenticated `auth.uid()` identity, per-account advisory lock,
atomic insert, rolling expiration, `SECURITY DEFINER` empty search path, function
permissions, RLS and restricted table access. It does not refund provider failures
or reset active reservations.

The releases must be coordinated:

- The old application treats remaining values from 5 through 29 as invalid. If it
  runs against the new function, it fails closed after consuming a reservation.
- The updated application running against the old function remains compatible but
  still permits only five attempts.

Use this safe hosted deployment sequence:

1. Set `QA_ENABLED=false` in the hosting provider's environment settings, deploy or
   redeploy the application with that environment, and confirm Q&A is unavailable
   before applying the database migration.
2. Deploy the updated application while Q&A remains disabled.
3. From the reviewed, linked repository checkout, run `npm run check:migrations`,
   `supabase migration list`, and `supabase db push --dry-run`. Confirm the dry run
   contains the new quota migration and no unexpected migration.
4. Apply the reviewed migration with `supabase db push`. Do not run its SQL against
   production manually or from an unreviewed checkout.
5. Confirm migration version `20261125000000` is present remotely and run the
   approved authenticated hosted quota/RLS smoke checks without making a live
   OpenAI request.
6. Set `QA_ENABLED=true` in the hosting provider's environment settings and redeploy
   the compatible application with that environment. Verify the 30-attempt copy and
   safe quota errors.

If any migration or smoke check fails, leave Q&A disabled until the application and
database versions are reconciled. Hosted migration execution and production data
changes require separate explicit approval.

If an automatic deployment pipeline exists or is being implemented, coordinate the
rollout with Shawn so it cannot activate an application version that is incompatible
with the hosted quota function.

## Operational spending controls

The per-account quota does not cap total application spending: the maximum exposure
scales with the number of accounts. Before public deployment, Deep or the authorized
OpenAI project owner should own a separate operational follow-up titled **Configure
OpenAI project spending limits and alerts before public deployment**. That follow-up
should cover:

- a team-approved monthly budget;
- provider-level hard spending enforcement, where available;
- spending alerts;
- verification that the deployed API key belongs to the intended OpenAI project;
- monitoring and emergency `QA_ENABLED=false` procedures; and
- the possibility of delayed enforcement or spending overrun.

This quota enhancement does not add an application-wide quota system or change
OpenAI billing credentials, settings, projects or API keys.

## Verification expectations

Deterministic tests cover remaining values 29 and 0, rejection of 30 and negative
values, attempts 1 through 30, denial of attempt 31, rolling expiration,
cross-target accounting, independent accounts, unauthenticated denial, retained
failed-provider reservations and concurrent enforcement. CI database tests remain
required before merge when the local Windows environment cannot run Bash/Postgres.
