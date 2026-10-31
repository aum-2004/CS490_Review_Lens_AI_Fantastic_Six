# ReviewLens AI Engineering Standards

## Purpose

This document defines the engineering standards that all developers and AI coding tools must follow when contributing to ReviewLens AI.

The goal is to keep the codebase consistent, secure, maintainable, and aligned with the Sprint 1 architecture and security requirements.


## 1. Purpose and Authority

This document defines the engineering standards that developers and AI coding tools must follow when contributing to ReviewLens AI. Its purpose is to keep the codebase consistent, secure, maintainable, and aligned with the team's architecture and active sprint requirements.

These standards apply to source code, configuration, automated tests, pull requests, and AI-generated changes. If this document conflicts with an active sprint requirement, the active sprint requirement takes priority and this document must be updated through a reviewed pull request.

This is a living team document. Proposed changes must be discussed in the related pull request and approved before the standard is changed.

## 2. Approved Technology Baseline

### Frontend

- Next.js App Router
- React
- TypeScript in strict mode
- Tailwind CSS
- shadcn/ui

### Backend

- Next.js Route Handlers
- Server-side TypeScript services

### Database and Authentication

- Supabase PostgreSQL
- Supabase Auth
- Supabase Row Level Security (RLS) as an additional database-level authorization layer

### Testing

- Jest
- React Testing Library
- Playwright

### Delivery and External Services

- npm as the only package manager
- GitHub Actions for continuous integration
- Vercel for application deployment
- Supabase hosted services for authentication and persistence
- OpenAI API for later review-analysis functionality
- Review provider/API pending final team and professor approval

The exact supported versions and generated configuration are established by S1-005 and S1-006 and must be recorded in the repository lockfile and setup documentation.

## 3. Repository Organization

The following structure is the team's proposed baseline. S1-005 is responsible for creating and validating the actual Next.js structure. If the generated framework structure requires a change, S1-005 must update this document in the same pull request or in a linked standards pull request.

```text
src/
|-- app/
|   |-- login/
|   |-- analysis-targets/
|   `-- api/
|-- components/
|   |-- ui/
|   |-- analysis-targets/
|   |-- ingestion/
|   `-- shared/
|-- services/
|   |-- auth/
|   |-- analysis-targets/
|   |-- ingestion/
|   `-- reviews/
|-- lib/
|   |-- supabase/
|   |-- validation/
|   `-- utils/
|-- types/
`-- proxy.ts

tests/
|-- unit/
|-- integration/
`-- e2e/

docs/
```

Repository rules:

- Routes, layouts, pages, and Route Handlers belong under `src/app`.
- Reusable UI belongs under `src/components`; shadcn/ui primitives belong under `src/components/ui`.
- Business and data-access logic belongs in server-side services rather than directly in React components.
- Route Handlers should remain thin: validate the request, authenticate the user, authorize the resource, call a service, and return a response.
- Shared framework clients and utilities belong under `src/lib`.
- Shared TypeScript types belong under `src/types` when they are not better located beside a single feature.
- Unit and integration tests should mirror the application area they test. End-to-end tests belong under `tests/e2e`.
- `public`, `package.json`, lockfiles, environment templates, and framework configuration remain at the repository root as required by Next.js.
- With Next.js 16, request proxy logic uses `src/proxy.ts`. Authentication and authorization must not rely on Proxy alone; protected server operations must verify access independently.

## 4. Naming Conventions

- React component names and component files use PascalCase, for example `TargetCard.tsx`.
- Functions, variables, and object properties use camelCase.
- Custom React hooks begin with `use`, for example `useAnalysisTargets.ts`.
- Constants that are truly fixed application-wide values use UPPER_SNAKE_CASE.
- Non-component TypeScript files and feature folders use lowercase kebab-case, for example `review-parser.ts` and `analysis-targets`.
- Test files use `.test.ts` or `.test.tsx`. Playwright files use `.spec.ts`.
- Next.js special files keep their required framework names, including `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, and `route.ts`.
- PostgreSQL tables and columns use snake_case.
- Domain terminology must be consistent: use `AnalysisTarget`, `Review`, and `IngestionAttempt` in TypeScript and the corresponding snake_case names in the database.

Names should describe intent. Avoid unclear abbreviations and generic names such as `data`, `thing`, or `helper` when a more specific name is available.

## 5. Formatting, Static Analysis, and Commands

Required tools:

- ESLint
- Prettier
- TypeScript strict mode

Formatting rules:

- Use two-space indentation.
- Remove unused imports and variables.
- Do not commit commented-out code or temporary debugging statements.
- Prefer clear, typed code over unnecessary abstraction.
- Do not suppress a TypeScript or ESLint error without explaining why in code and in the pull request.

S1-006 must configure these commands in `package.json`:

- `npm run lint`
- `npm run format:check`
- `npm run test`
- `npm run build`

All applicable commands must pass before a code pull request is merged. Until S1-006 establishes the scripts, contributors must not claim that an unconfigured check has passed.

## 6. Error-Handling Conventions

- Validate external input at an authoritative server boundary even when the browser also validates it.
- Handle expected errors explicitly and translate them into safe, understandable responses.
- Do not expose stack traces, SQL details, internal file paths, secrets, credentials, or provider responses containing sensitive information.
- Unexpected errors must be logged safely on the server and returned to the user as a generic error.
- Existing valid review data must not be replaced by fabricated or placeholder data when ingestion fails.

Standard HTTP status usage:

- `200` - successful request
- `201` - resource created
- `400` - invalid request or validation failure
- `401` - authentication required or invalid session
- `403` - authenticated user is not permitted to perform the operation
- `404` - requested resource is unavailable or cannot be disclosed
- `409` - conflict, such as an operation that violates a uniqueness rule
- `500` - unexpected server failure

The team must apply a consistent `403`/`404` policy to user-owned resources so responses do not reveal another user's private resource. The selected policy must be tested.

## 7. API and Service Response Conventions

Successful Route Handler response:

```json
{
  "success": true,
  "data": {}
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SOURCE_URL",
    "message": "The submitted source URL is invalid."
  }
}
```

Rules:

- Error `code` values are stable machine-readable identifiers; `message` values are safe user-readable explanations.
- Validation responses may include safe field-level details when useful.
- Route Handlers must use the shared response convention instead of inventing a new shape per endpoint.
- Service functions return typed results or throw documented application errors; they do not return ad hoc response objects.
- Protected endpoints derive identity from the verified Supabase session, never from a client-supplied owner ID.

## 8. Authentication, Authorization, and Ownership

- Every AnalysisTarget belongs to exactly one authenticated user.
- Review and IngestionAttempt access is authorized through the owning AnalysisTarget.
- Protected Route Handlers must verify the session, derive authenticated identity, verify resource ownership, and only then perform the operation.
- The frontend may improve navigation by hiding unavailable actions, but frontend filtering is never an authorization control.
- Client-supplied `userId`, `ownerId`, or equivalent values are not trusted for ownership decisions.
- Supabase RLS provides defense in depth but does not replace authorization inside protected server operations.
- Cross-user tests must use at least two identities and prove that User B cannot read, modify, delete, or ingest into User A's resources.

## 9. Logging Expectations

Log server-side events that help diagnose or audit the system, including:

- Authentication and authorization failures
- Ingestion start, success, partial success, and failure
- External-provider failures
- Database failures
- Unexpected application failures

Logs should include safe context such as operation name, error category, and a request or correlation identifier when available.

Never log:

- Passwords
- Session cookies, authentication tokens, or authorization headers
- API keys, database credentials, or complete environment values
- Supabase service-role keys
- Unredacted personal information
- Full customer-review text in routine production logs

Use the shared project logger once it is established. Do not leave temporary `console.log` debugging statements in merged code.

## 10. Adding and Updating Dependencies

The team uses npm and commits `package-lock.json`. Do not use Yarn or pnpm in this repository.

Before adding a dependency:

1. Confirm that it solves a specific project need.
2. Confirm that an existing dependency or platform capability does not already solve the problem.
3. Verify that the package is actively maintained and compatible with the project's Node.js and Next.js versions.
4. Review its license and known security concerns.
5. Place it in `dependencies` or `devDependencies` correctly.
6. Explain the addition in the pull request.

Install packages through npm rather than manually editing dependency versions. Unrelated dependency upgrades must not be included in a feature pull request.

## 11. Testing Standards

Every code change that adds or modifies behavior must include appropriate automated tests. Documentation-only changes should state that automated tests are not applicable and identify the review performed instead.

Depending on the behavior, tests should cover:

- Successful behavior
- Expected failure behavior
- Validation boundaries
- Authenticated and unauthenticated requests
- Authorized and unauthorized users
- Persistence and ownership where applicable
- Loading and error states for interactive UI

External review-provider APIs and OpenAI calls must be mocked or replaced with deterministic fixtures in CI. Automated tests must not depend entirely on a live external website or paid provider.

Security-sensitive features require explicit User A/User B isolation tests. A test must demonstrate denial at the backend or database boundary, not merely that the other user's record is hidden in the UI.

## 12. AI-Assisted Development

AI-generated code is treated as team-authored code and must meet the same standards and Definition of Done.

Developers must:

- Provide the relevant story, architecture, standards, and existing code as prompt context.
- Review and understand generated changes before accepting them.
- Verify generated APIs, packages, and configuration against authoritative documentation.
- Test generated behavior, including failure and security cases.
- Retain the required AI-session transcript according to the convention established by S1-004.
- Request additional human review for authentication, authorization, RLS, secret handling, ingestion, and AI-data-boundary changes.

AI output is a proposal, not proof that a change is correct.

## 13. Pull Request Requirements

Every pull request must:

- Link the relevant GitHub issue.
- Describe what changed and why.
- Stay within the assigned story's scope.
- Identify tests or review evidence.
- Pass all applicable build, formatting, lint, and automated-test checks.
- Contain no real secrets or unrelated generated files.
- Receive approval from at least one teammate before merge.

The author must respond to review feedback. A pull request is not Done until it is approved, required checks pass, it is merged into `main`, and the associated board item is updated.

## 14. Environment and Secret Requirements

- Real secrets must never be committed.
- Local secrets belong in `.env.local`, which must be ignored by Git.
- `.env.example` documents required variable names using empty or clearly fake placeholder values.
- Variables beginning with `NEXT_PUBLIC_` are exposed to the browser and must never contain private credentials.
- Supabase service-role keys, database credentials, OpenAI keys, and private provider credentials are server-only.
- Environment-specific values must not be hard-coded into source files.
- Missing required configuration must produce a clear startup or runtime error without exposing the secret value.
- If a secret is accidentally committed, stop using it, notify the team, rotate or revoke it immediately, and follow the team's incident procedure. Deleting it from the latest file alone is not sufficient.

S1-008 owns the final `.env.example`, ignore rules, environment-validation approach, and setup instructions. When S1-008 changes these conventions, this document must remain consistent with that implementation.
