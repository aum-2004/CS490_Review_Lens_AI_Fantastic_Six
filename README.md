# ReviewLens AI

ReviewLens AI is a multi-user web application for analyzing public customer reviews. A user creates
an **analysis target** (a business or product), ReviewLens ingests that target's reviews from a
supported review platform, and the user can later ask questions that are answered only from that
persisted review evidence. Each user's targets and reviews are private to that user.

NJIT CS490 — Fall 2026 — Group B (Fantastic Six).

> **Status:** Sprint 1 foundation. The application starts and serves a starter page and a health
> endpoint, with automated formatting, static analysis, unit tests, and headless end-to-end tests.
> Supabase authentication is implemented in S1-009; live project verification is still required.
> Analysis targets and review ingestion are not built yet — see
> [Implemented vs. planned](#implemented-vs-planned).

---

## Technology stack

| Layer           | Technology                                               | Status                                    |
| --------------- | -------------------------------------------------------- | ----------------------------------------- |
| Frontend        | Next.js 16 (App Router), React 19, TypeScript (strict)   | In place                                  |
| Styling         | Tailwind CSS 4; shadcn/ui-compatible `components/ui`     | In place                                  |
| Backend         | Next.js Route Handlers + server-side TypeScript services | In place                                  |
| Database / Auth | Supabase PostgreSQL + Supabase Auth                      | Auth implemented; schema planned (S1-014) |
| Lint / Format   | ESLint 9 with `eslint-config-next`; Prettier             | In place                                  |
| Tests           | Jest, React Testing Library, Playwright                  | In place                                  |
| CI              | GitHub Actions                                           | In place (S1-007)                         |
| Hosting         | Vercel                                                   | Planned (Sprint 3)                        |
| Package manager | npm (only — do not use Yarn or pnpm)                     | In place                                  |

Exact versions are pinned in `package-lock.json`.

---

## Prerequisites

| Tool    | Version                                    | Check with       |
| ------- | ------------------------------------------ | ---------------- |
| Node.js | **24.x LTS** (team baseline; see `.nvmrc`) | `node --version` |
| npm     | 10 or newer (bundled with Node.js)         | `npm --version`  |
| Git     | Any recent version                         | `git --version`  |

Install Node.js from <https://nodejs.org> (choose the LTS download). This installs npm too.

---

## Getting started

These commands work the same in macOS Terminal, Windows PowerShell, and the VS Code terminal
unless noted.

### 1. Clone the repository

```bash
git clone https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six.git
cd CS490_Review_Lens_AI_Fantastic_Six
```

> **macOS:** don't clone into `~/Desktop` or `~/Documents` if iCloud "Desktop & Documents" sync
> is on. iCloud can offload files in `.git` and `node_modules`, which corrupts the repository.
> Use a folder such as `~/Developer` instead.
>
> **Windows:** avoid OneDrive-synced folders for the same reason, and prefer a short path such
> as `C:\dev\`.

### 2. Install dependencies

```bash
npm ci
```

`npm ci` installs the exact versions recorded in `package-lock.json`. Use `npm install <package>`
only when you are intentionally adding a dependency (and commit the updated lockfile).

### 3. (Optional for now) Create your local environment file

The starter app needs **no** environment variables. When later stories require Supabase settings:

```bash
# macOS / Linux
cp .env.example .env.local
```

```powershell
# Windows (PowerShell or Command Prompt)
copy .env.example .env.local
```

Then fill in the values in `.env.local`. See [Environment variables and secrets](#environment-variables-and-secrets).

### 4. Start the development server

```bash
npm run dev
```

Open <http://localhost:3000>. You should see the ReviewLens AI starter page with the status
**"Application foundation operational."** The page reloads automatically when you edit files.

You can also confirm the backend is running at <http://localhost:3000/api/health>, which returns:

```json
{ "success": true, "data": { "status": "ok" } }
```

Stop the server with `Ctrl+C`.

---

## Available scripts

| Command                 | What it does                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| `npm run dev`           | Starts the development server at <http://localhost:3000>                  |
| `npm run build`         | Creates an optimized production build in `.next/`                         |
| `npm run start`         | Serves the production build (run `npm run build` first)                   |
| `npm run lint`          | Runs ESLint across the project                                            |
| `npm run format`        | Formats supported project files with Prettier                             |
| `npm run format:check`  | Verifies formatting without changing files                                |
| `npm run typecheck`     | Generates Next.js route types, then runs TypeScript without emitting      |
| `npm run test`          | Runs Jest unit and component tests; no browser is required                |
| `npm run test:watch`    | Re-runs relevant Jest tests while files change                            |
| `npm run test:coverage` | Runs Jest and writes an HTML/text coverage report to `coverage/`          |
| `npm run test:e2e`      | Starts the app and runs Playwright tests in headless Chromium             |
| `npm run test:e2e:auth` | Runs authentication browser tests against an isolated local test provider |

### Run automated tests

Jest covers the current frontend starter page and backend health Route Handler:

```bash
npm test
```

These tests are deterministic and require no browser download, manual interaction, environment
variables, external service, or credentials. Use `npm run test:coverage` when you also want a
local coverage report.

Playwright provides a separate end-to-end smoke check of the running application. Install its
Chromium browser once after `npm ci`:

```bash
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` starts and stops the Next.js development server automatically. Playwright runs
headlessly by default; reports and temporary test results are generated locally and ignored by Git.

Authentication specifications live under `tests/e2e/auth/` and run separately with
`npm run test:e2e:auth`, which starts a local dummy provider and an isolated app instance.
The smoke command excludes those tests so it does not require the provider. Neither auth test
accounts nor live Supabase credentials are needed. Both suites can use an existing supported
browser by setting `PLAYWRIGHT_CHANNEL` (for example, `msedge`); otherwise they use bundled Chromium.

### Run a production build locally

```bash
npm run build
npm run start
```

Then open <http://localhost:3000>.

---

## Project structure

```text
.
├── src/
│   ├── app/                  # FRONTEND routes, layouts, pages (Next.js App Router)
│   │   ├── api/              # BACKEND Route Handlers (HTTP endpoints)
│   │   │   └── health/       #   GET /api/health
│   │   ├── layout.tsx        # Root layout shared by every page
│   │   ├── page.tsx          # Home / starter page
│   │   └── globals.css       # Tailwind CSS entry point and theme tokens
│   ├── components/
│   │   └── ui/               # FRONTEND shared form/UI primitives
│   ├── services/             # BACKEND server-side business logic and data access
│   └── lib/
│       └── supabase/         # DATA boundary: the only place Supabase clients are created
├── tests/
│   ├── unit/                 # Jest and React Testing Library tests
│   └── e2e/                  # Playwright browser tests
├── docs/                     # Team engineering, UX, security, and AI-development documents
├── .github/workflows/        # Pull-request CI and the sprint-issue importer
├── .env.example              # Environment variable names, no real values
├── AGENTS.md                 # Next.js-provided notes for AI coding agents
├── eslint.config.mjs         # ESLint configuration
├── jest.config.ts            # Jest and Next.js test configuration
├── playwright.config.ts      # Headless end-to-end test configuration
├── next.config.ts            # Next.js configuration
├── tsconfig.json             # TypeScript configuration (strict, `@/*` → `src/*`)
├── package.json              # Scripts and dependencies
└── package-lock.json         # Exact dependency versions (always commit)
```

### Responsibilities

**Frontend**

- `src/app/` — URL routes. A folder with a `page.tsx` becomes a page; `layout.tsx` wraps pages.
- `src/components/` — Reusable React components. shadcn/ui primitives go in `ui/`;
  feature components go in folders like `analysis-targets/`; shared ones in `shared/`.

**Backend**

- `src/app/api/` — Route Handlers. Each `route.ts` is an HTTP endpoint. Handlers stay thin:
  validate input, authenticate, authorize, call a service, return the shared response shape.
- `src/services/` — Business logic and data access, organized by domain (`auth`,
  `analysis-targets`, `ingestion`, `reviews`). Server-only.

**Data / persistent storage**

- `src/lib/supabase/` — Supabase client configuration and Auth cookie/session integration.
  Application database schema remains planned.
- `.env.example` / `.env.local` — Connection settings. Values are never hard-coded in source.
- `supabase/migrations/` — Database schema (to be added by S1-014).

**Shared code**

- `src/lib/` — Framework clients and small utilities (`supabase/`, and later `validation/`,
  `utils/`).
- `src/types/` — Shared TypeScript types, created when first needed.

Import from `src` using the `@/` alias, for example `import { x } from "@/lib/utils/x"`.

Folders are created by the stories that need them; each reserved folder contains a short
`README.md` describing what belongs there. The full conventions (naming, error handling,
response shapes, testing) are in `docs/engineering-standards.md` (S1-001).

---

## Environment variables and secrets

ReviewLens AI uses environment variables to configure Supabase and external services without exposing private credentials.

### Local environment setup

1. Copy `.env.example` to `.env.local`.
2. Add your Supabase project URL and publishable key to `.env.local`.
3. Install dependencies using `npm ci`.
4. Start the application using `npm run dev`.

The S1-005 starter application runs without environment variables. Supabase configuration is required when Supabase-dependent features are initialized.

### Required environment variables

| Variable                               | Description              | Visibility |
| -------------------------------------- | ------------------------ | ---------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL     | Public     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key | Public     |

The Supabase URL and publishable key can be obtained from the team's Supabase project dashboard.

Additional server-side configuration for the review-data provider will be documented once the provider is finalized.

### Security requirements

- Store local configuration values in `.env.local`.
- Never commit `.env.local` or files containing real credentials.
- `.gitignore` excludes environment files except `.env.example`.
- Only browser-safe configuration may use the `NEXT_PUBLIC_` prefix.
- Supabase service-role keys, database credentials, and review-provider API keys must remain server-side.
- Never hard-code credentials or environment-specific values into source files.
- Never expose credentials through logs or error messages.
- Restart the development server after modifying `.env.local`.

- If a secret is ever committed, tell the team immediately and rotate the key. Deleting it in a later commit does not remove it from Git history.

### Configuration validation

Supabase environment configuration is validated in
`src/lib/supabase/config.ts`.

The `getSupabasePublicConfig()` function:

- Checks that the required environment variables exist.
- Rejects missing or empty values.
- Validates the Supabase URL format and protocol.
- Produces understandable errors without exposing credentials.

Validation occurs when the function is called by
Supabase-dependent code.

The starter application does not require Supabase
credentials to start. S1-009 adds Supabase client initialization and authentication.
See [authentication setup and verification](docs/s1-009-authentication.md) for dashboard settings,
email confirmation, `/login`, the session endpoint, and pending manual checks.

### Deployment configuration

For deployment on Vercel, required environment variables must be configured through the Vercel project's environment settings.

Public variables must be available during the appropriate build process. Private credentials must remain server-side and must never be committed to GitHub.

### Testing

Supabase environment configuration is tested in
`tests/unit/supabase-config.test.ts`.

Tests cover:

- Valid Supabase configuration.
- Missing required environment variables.
- Empty or whitespace-only values.
- Invalid Supabase URLs.
- Unsupported URL protocols.
- Error messages that do not expose configuration values.

Run the configuration tests using:

```bash
npm run test -- supabase-config.test.ts --runInBand
```

These tests use dummy configuration values and do not
require a live Supabase connection.

---

## Troubleshooting

| Problem                                                                  | Fix                                                                                                                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` says the lockfile is out of sync                                | Someone changed `package.json` without updating the lockfile. Pull the latest branch; if it persists, tell the author. Don't delete `package-lock.json`. |
| `next: command not found` / `'next' is not recognized`                   | Dependencies aren't installed. Run `npm ci` from the repository root.                                                                                    |
| Node version error, or `npm ci` warns `EBADENGINE`                       | Install Node.js 24 LTS (the `.nvmrc` baseline) and open a new terminal.                                                                                  |
| Port 3000 is already in use                                              | Stop the other process, or run `npm run dev -- -p 3001` and open <http://localhost:3001>.                                                                |
| Build fails fetching Google Fonts                                        | The Geist font downloads at build time. Check your internet connection or proxy, then retry.                                                             |
| Changes to `.env.local` are ignored                                      | Restart the dev server. Browser-side variables must start with `NEXT_PUBLIC_`.                                                                           |
| Strange errors after switching branches                                  | Stop the server, delete the `.next` folder, run `npm ci`, and start again. macOS: `rm -rf .next` · PowerShell: `Remove-Item -Recurse -Force .next`       |
| Playwright says the Chromium executable is missing                       | Run `npx playwright install chromium`, then retry `npm run test:e2e`.                                                                                    |
| Git reports a corrupt object or "far too short to be a packfile" (macOS) | The clone is in an iCloud-synced folder. Re-clone into a non-synced folder such as `~/Developer`.                                                        |
| Windows: `npm` scripts blocked by execution policy                       | In PowerShell run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use Command Prompt.                                                          |

---

## Implemented vs. planned

**Implemented (S1-005 through S1-009, plus S1-010 foundation)**

- Next.js App Router application with TypeScript (strict) and Tailwind CSS.
- Responsive starter page.
- `GET /api/health` Route Handler.
- Frontend, backend, and data directory boundaries with documentation.
- ESLint via `npm run lint` (scaffold default; S1-006 may extend it).
- Environment template and secret-safe ignore rules.
- Prettier formatting with write and check commands.
- Clean-checkout type-checking with Next.js route type generation.
- Jest and React Testing Library unit/component tests for the starter frontend and health endpoint.
- Separate Playwright headless end-to-end smoke tests.
- Pull-request CI running formatting, lint, typecheck, unit tests, and build.
- Supabase environment validation and unit tests.
- Supabase sign-in, registration/confirmation, cookie sessions, verified server identity, and logout.
- `/login` and `/api/auth/session`; live verification and human security review remain required.
- Protected target-page navigation, safe post-login return, and independent backend guard helpers.
  See [S1-010 integration guidance](docs/s1-010-route-protection.md); target-route adoption and live
  verification remain pending. No target feature or database ownership is supplied by these guards.

**Planned (not implemented)**

| Capability                                                      | Story              |
| --------------------------------------------------------------- | ------------------ |
| Integrate guards with target pages/APIs as their stories arrive | S1-010 integration |
| Ownership and cross-user authorization                          | S1-011 – S1-013    |
| Analysis targets (model, create, validate, list, workspace)     | S1-014 – S1-018    |
| Review ingestion, normalization, persistence, result state      | S1-019 – S1-023    |
| AI question answering, ingestion summaries                      | Sprint 2           |
| Production deployment                                           | Sprint 3           |

---

## Next steps for the team

- Pull-request CI now runs the S1-006 commands. Confirm the required-check and branch-protection
  settings in GitHub; workflow configuration alone does not establish those settings.
- Browser CI may additionally install Chromium and run `npm run test:e2e`.

Work branches off `main` using `feature/<story-id>-<short-name>` and merges through a reviewed pull
request.
