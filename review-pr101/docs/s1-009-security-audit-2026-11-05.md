# S1-009 additional security audit

Date: 2026-11-05 (America/New_York). Reviewer: Codex.
Reviewed branch: `feature/S1-009-managed-authentication`.
Reviewed commit: `1906624eb4655a0efd6e69675e3d6caec8534021`.

Result: **development-logging finding fixed and verified in the working tree**. No authentication bypass
was identified in the inspected code or the isolated probes. This additional audit supplements
the completed author review; it does not rewrite the reviewer's decision about responsibility.

## P1 (resolved): Disable credential and confirmation-token logging in development

Location: `next.config.ts:3` (logging defaults are not overridden).

The installed Next.js 16.4.3 enables development Server Function logging by default. With this
configuration, signing in through the real AuthForm and Server Action emitted the submitted
dummy password and email into the development process's console output. A request to the
confirmation callback also emitted the dummy TokenHash in its incoming-request URL log.
Anyone with access to captured/shared development logs can therefore obtain credentials or
confirmation tokens. This was demonstrated only with local fixture credentials and dummy tokens;
no real credential or existing user session was inspected.

Reproduction used a fresh Edge context, the real app/SDK and the existing local fixture provider.
The probe captured child-process output in memory and reported only these boolean observations:

```json
{
  "submittedDummyPasswordInDevLogs": true,
  "submittedDummyEmailInDevLogs": true,
  "developmentRequestLogsContainDummyConfirmationToken": true
}
```

The application service's operation-only logging is safe; these emissions originate from the
framework defaults. Engineering standards section 9 prohibits logging passwords, authentication
tokens and unredacted personal information. The installed Next logging guide explicitly documents
Server Function argument logging and incoming-request logging as development behavior. This
audit does not claim the same emissions occur in production or identify production log access.

The author approved the fix. Applied configuration:

```ts
logging: {
  serverFunctions: false,
  incomingRequests: {
    ignore: [/^\/auth\/confirm(?:[/?]|$)/],
  },
},
```

The post-fix real-app probe reported all three exposure observations false. It also verified
safe authentication-failure logs and ordinary request logs remain enabled, and that sign-in,
session identity, and confirmation-failure redirects/privacy headers still work. No real user
credentials were used. Review production hosting/access-log handling of token
query parameters separately; the Next development setting cannot configure those systems.

## Requirements and boundaries checked

| Requirement                      | Evidence and conclusion                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider SDK and server identity | Auth uses supported Supabase SDK methods; the server-only identity service calls getUser per request. Modified cookie user metadata could not change the returned verified identity.                                                                    |
| Reject unverified identity       | A modified JWT payload was rejected with 401 and no identity data by the real app against the local fixture. Unit tests cover missing identity and provider failure.                                                                                    |
| Input and responses              | Server-side Zod validation, unchanged passwords, ignored extra owner fields, typed service results, and safe API response shape were inspected and tested.                                                                                              |
| Session refresh and persistence  | Per-request cookie clients, request/response refresh propagation and retained writes were inspected; fixture browser tests passed refresh, navigation, API identity and logout.                                                                         |
| Cross-origin mutations           | Replaying the actual dummy sign-in Server Action request with an external Origin was rejected with HTTP 500 by Next's origin check. It did not succeed. This is framework rejection, not an assertion that the application returns a polished 403 page. |
| Confirmation                     | The isolated callback ignored an external next destination, stripped the dummy token, and returned a local login error with private/no-store and no-referrer headers.                                                                                   |
| Logout                           | Provider local scope, safe failure feedback and invalidated navigation are covered. Previously issued access JWTs and other devices retain the provider's documented semantics.                                                                         |
| Secret boundaries                | Heuristic scan of 80 tracked files found no private-key blocks, Supabase secret keys or OpenAI-like keys. A separate 49-file source/test/config scan found no credential-pattern findings. Private env files were not read.                             |
| Browser artifacts                | A scan of 12 available .next/static JS/JSON/map artifacts found no private-key/secret-key patterns or server auth logging marker. These artifacts followed the fixture run and are not claimed as an exhaustive production bundle analysis.             |
| Scope                            | Broader resource guards, owner assignment, RLS/migrations and cross-user target access remain 010 onward. This audit cannot certify absent target features.                                                                                             |

## Verification run

- 67 unit tests passed in 11 suites.
- Lint, formatting, explicit typecheck and production build passed.
- Both existing isolated auth browser tests passed using installed Edge.
- Extra dummy probes checked cookie-user tampering, modified JWT rejection, cross-origin Action
  rejection, fixed confirmation destinations, privacy headers and framework log exposure.
- Full npm audit: 26 dependency advisories (23 moderate, 3 low; zero high/critical).
- Production-only npm audit: zero vulnerabilities. Development-tool advisories remain a tooling
  follow-up; no automatic dependency fixes, upgrades or downgrades were applied.

An initial strict redirect assertion expected 127.0.0.1, but Next normalized its local destination
to localhost on the same port. A follow-up confirmed the fixed local path, error notice and absence
of token forwarding. An extra logging probe initially timed out because the restored normal dev
server held the project lock; it passed after stopping only the verified project server. These
probe/setup failures were not classified as authentication defects. The initial npm audit was slow;
a bounded retry completed, followed by the production-only audit.

The initial audit changed no application code, dependency, hosted setting or account. Following
author approval, only next.config.ts was changed to remediate the logging finding. The repeat
dummy-credential/token probes passed. No hosted setting, account or dependency was changed.

## Sources

- Repository engineering standards sections 6-14 and AI-assisted development standards.
- Installed Next guides: data-security, authentication-with-cache-components, server-actions,
  and logging under node_modules/next/dist/docs.
- Installed Supabase SSR client/cookie defaults and Auth getUser implementation.
- [Supabase verified user API](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Supabase sign-out semantics](https://supabase.com/docs/guides/auth/signout)

### Post-fix checks

After the logging fix, all 67 unit tests, both auth browser tests, lint, formatting, explicit
typecheck and production build passed again. The normal branch-009 development server was
restored. The targeted log probe confirmed credentials/tokens are absent and safe logs retained.
