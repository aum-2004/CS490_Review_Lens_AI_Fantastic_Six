# ReviewLens AI

ReviewLens AI is a multi-user web application for analyzing public customer reviews. A user creates
an **analysis target** (a business or product), ReviewLens ingests that target's reviews from a
supported review platform, and the user can later ask questions that are answered only from that
persisted review evidence. Each user's targets and reviews are private to that user.

NJIT CS490 — Fall 2026 — Group B (Fantastic Six).

> **Status:** Sprint 1 foundation. The application starts and serves a starter page and a health
> endpoint. Authentication, analysis targets, and review ingestion are not built yet — see
> [Implemented vs. planned](#implemented-vs-planned).

---

## Technology stack

| Layer           | Technology                                              | Status        |
| --------------- | ------------------------------------------------------- | ------------- |
| Frontend        | Next.js 16 (App Router), React 19, TypeScript (strict)  | In place      |
| Styling         | Tailwind CSS 4; shadcn/ui-compatible `components/ui`    | In place      |
| Backend         | Next.js Route Handlers + server-side TypeScript services | In place      |
| Database / Auth | Supabase PostgreSQL + Supabase Auth                     | Planned (S1-009, S1-014) |
| Lint            | ESLint 9 with `eslint-config-next`                      | In place      |
| Format / Tests  | Prettier, Jest, React Testing Library, Playwright       | Planned (S1-006) |
| CI              | GitHub Actions                                          | Planned (S1-007) |
| Hosting         | Vercel                                                  | Planned (Sprint 3) |
| Package manager | npm (only — do not use Yarn or pnpm)                    | In place      |

Exact versions are pinned in `package-lock.json`.

---

## Prerequisites

| Tool    | Version                                      | Check with       |
| ------- | -------------------------------------------- | ---------------- |
| Node.js | **22.x or 24.x LTS** recommended (minimum 20.9) | `node --version` |
| npm     | 10 or newer (bundled with Node.js)           | `npm --version`  |
| Git     | Any recent version                           | `git --version`  |

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

| Command         | What it does                                                  |
| --------------- | ------------------------------------------------------------- |
| `npm run dev`   | Starts the development server at <http://localhost:3000>      |
| `npm run build` | Creates an optimized production build in `.next/`             |
| `npm run start` | Serves the production build (run `npm run build` first)       |
| `npm run lint`  | Runs ESLint across the project                                |

Formatting (`npm run format:check`) and tests (`npm run test`) are **not configured yet**; they
are added by S1-006.

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
│   │   └── ui/               # FRONTEND shadcn/ui primitives (not initialized yet)
│   ├── services/             # BACKEND server-side business logic and data access
│   └── lib/
│       └── supabase/         # DATA boundary: the only place Supabase clients are created
├── docs/                     # Team engineering, UX, security, and AI-development documents
├── .github/workflows/        # GitHub Actions (currently the sprint-issue importer)
├── .env.example              # Environment variable names, no real values
├── AGENTS.md                 # Next.js-provided notes for AI coding agents
├── eslint.config.mjs         # ESLint configuration
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

- `src/lib/supabase/` — Supabase client configuration. Reserved; nothing connects to a database
  yet.
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

- Real values live in **`.env.local`**, which Git ignores (`.gitignore` ignores every `.env*`
  file except `.env.example`).
- **`.env.example`** lists variable names with empty values. Never put a real key in it.
- Variables prefixed with `NEXT_PUBLIC_` are bundled into browser code. Only values the provider
  documents as public (Supabase project URL and publishable/anon key) may use that prefix.
- Server-only secrets — the Supabase service-role key, database passwords, review-provider and
  OpenAI API keys — must **never** use `NEXT_PUBLIC_`, appear in client code, or be logged.
- After changing `.env.local`, restart `npm run dev`.
- If a secret is ever committed, tell the team immediately and rotate the key; deleting it in a
  later commit does not remove it from Git history.

**Ownership:** S1-008 (Configure Environment and Secret Management) owns the complete variable
list, documentation, and missing-configuration validation. This README and `.env.example` only
reserve the initial Supabase names.

---

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| `npm ci` says the lockfile is out of sync | Someone changed `package.json` without updating the lockfile. Pull the latest branch; if it persists, tell the author. Don't delete `package-lock.json`. |
| `next: command not found` / `'next' is not recognized` | Dependencies aren't installed. Run `npm ci` from the repository root. |
| Node version error, or `npm ci` warns `EBADENGINE` | Install Node.js 22 or 24 LTS and open a new terminal. |
| Port 3000 is already in use | Stop the other process, or run `npm run dev -- -p 3001` and open <http://localhost:3001>. |
| Build fails fetching Google Fonts | The Geist font downloads at build time. Check your internet connection or proxy, then retry. |
| Changes to `.env.local` are ignored | Restart the dev server. Browser-side variables must start with `NEXT_PUBLIC_`. |
| Strange errors after switching branches | Stop the server, delete the `.next` folder, run `npm ci`, and start again. macOS: `rm -rf .next` · PowerShell: `Remove-Item -Recurse -Force .next` |
| Git reports a corrupt object or "far too short to be a packfile" (macOS) | The clone is in an iCloud-synced folder. Re-clone into a non-synced folder such as `~/Developer`. |
| Windows: `npm` scripts blocked by execution policy | In PowerShell run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use Command Prompt. |

---

## Implemented vs. planned

**Implemented (S1-005)**

- Next.js App Router application with TypeScript (strict) and Tailwind CSS.
- Responsive starter page.
- `GET /api/health` Route Handler.
- Frontend, backend, and data directory boundaries with documentation.
- ESLint via `npm run lint` (scaffold default; S1-006 may extend it).
- Environment template and secret-safe ignore rules.

**Planned (not implemented)**

| Capability | Story |
| ---------- | ----- |
| Prettier formatting, Jest / React Testing Library / Playwright tests | S1-006 |
| Pull-request CI (lint, build, test) and branch protection | S1-007 |
| Full environment configuration and validation | S1-008 |
| Supabase Auth sign-in, sign-out, and route protection | S1-009, S1-010 |
| Ownership and cross-user authorization | S1-011 – S1-013 |
| Analysis targets (model, create, validate, list, workspace) | S1-014 – S1-018 |
| Review ingestion, normalization, persistence, result state | S1-019 – S1-023 |
| AI question answering, ingestion summaries | Sprint 2 |
| Production deployment | Sprint 3 |

---

## Next steps for the team

- **S1-006 — Code quality and test tooling:** add Prettier, Jest, React Testing Library, and
  Playwright on top of this scaffold, plus the `format:check` and `test` scripts.
- **S1-007 — Pull-request CI:** add a GitHub Actions workflow that runs `npm ci`,
  `npm run lint`, `npm run build`, and the S1-006 test command on every pull request.

Work branches off `main` using `feature/<story-id>-<short-name>` and merges through a reviewed pull
request.
