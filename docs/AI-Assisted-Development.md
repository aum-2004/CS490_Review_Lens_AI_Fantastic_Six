# ReviewLens AI-Assisted Development and Review Standards

**Project:** ReviewLens AI | **Team:** Fantastic Six | **Story:** S1-004 | **Related rules:** S1-BR-004, S1-BR-008, S1-BR-011

## Core principle
AI-generated code is treated as team-authored code. The developer who prompts, accepts, and commits it is its author and is fully responsible for it. It goes through the same pull request, review, testing, and Definition of Done as hand-written code.

## 1. AI coding tools the team expects to use

| Tool | Typical use |
|---|---|
| Claude (chat) | Design questions, debugging, explaining errors, drafting docs |
| ChatGPT | Same as above; second opinion on generated code |
| Claude Code | Agentic coding in the repo (scaffolding, config, tests, CI). Used in S1-005 |
| OpenAI Codex | Agentic coding in the repo. Used in S1-006 |

## 2. Context supplied to AI tools

Context we will provide (as relevant to the task):
- The user story or issue text, including its acceptance criteria and the business rules it touches (for example S1-BR-004, S1-BR-008, S1-BR-011).
- The tech stack: Next.js, React, TypeScript, Supabase PostgreSQL, Supabase Auth, Vercel.
- The domain entities and relationships: User → AnalysisTarget → Reviews and IngestionRuns.
- The API model: Next.js route handlers that validate input and enforce authentication and ownership.
- The specific files, types, and schema involved, not the whole repository.
- Existing conventions: naming, folder structure, error response shape, validation approach.

Context we will NOT provide:
- API keys, service-role keys, database connection strings, tokens, or `.env` contents.
- Real user data, personal information, or private review data that is not approved for sharing.
- Credentials of any kind, even "temporary" ones.

If a snippet contains a secret, redact it first. If a secret is accidentally pasted into an AI tool, treat it as leaked: rotate it immediately and tell the team.


## 3. Reviewing generated code

- Before opening a pull request, the author must read and understand every line of generated code. Reviewers apply the same standard.
- Understand it. If the author cannot explain a block, it does not get committed.
- Check it against the story. The code must do what the acceptance criteria say, and nothing extra.
- Check scope. Remove unrelated refactors, unused code, and leftover debugging output.
- Check consistency. It must follow existing patterns, naming, and error handling.
- Check security basics. Look for missing auth checks, missing ownership checks, unvalidated input, and secrets in code.
- Check for hallucination. Confirm that functions, methods, options, and imports actually exist.
- At least one teammate other than the author reviews every pull request. The author does not approve their own PR.
- The PR description states whether AI assistance was used and which tool.


## 4. Validating generated dependencies and APIs

AI tools can invent packages, functions, and endpoints, or suggest outdated or unsafe ones.

- Verify every new package exists on the official registry, matches the intended name (watch for look-alike or typosquatted names), and is actively maintained.
- Check the package's license, weekly downloads, and last release before adding it.
- Add a dependency only when it is needed. Prefer what the stack already provides.
- Verify every API call, method, or option against the official documentation (Next.js, Supabase, OpenAI), not just the AI's explanation.
- Run `npm audit` after adding or updating dependencies and resolve high and critical findings.
- Commit the lockfile with the change, and pin or review version ranges.
- Never run install scripts or commands from AI output without reading them first.

## 5. Testing required before generated code is accepted

Generated code is accepted only when all of the following pass:

- `npm run typecheck` and `npm run build` pass with no new errors.
- `npm run format:check` and `npm run lint` pass.
- `npm test` passes, and unit tests cover the new logic, including invalid input and failure cases.
- Tests exist for the security rules the change touches:
  - **S1-BR-004:** a protected endpoint called without a valid session is rejected.
  - **S1-BR-008:** a user cannot read, write, update, or ingest data belonging to another user.
  - **S1-BR-011:** no secrets or provider credentials appear in source code or browser-delivered bundles.
- The author manually exercises the feature (happy path and at least one failure path).
- The GitHub Actions check "Lint, typecheck, test, build" (S1-007) passes on the pull request before merge. If CI is unavailable, run the same commands locally and paste the results into the PR.
- Tests are written or reviewed by a human. A test that the AI wrote must be read to confirm it actually asserts something meaningful.

## 6. Retaining AI session transcripts

The team keeps the complete available transcript of every AI session that produced or shaped committed code. A summary does not replace the original conversation.

- **Where:** `ai-transcripts/` at the root of the repository.
- **Naming:** `YYYY-MM-DD_<author>_<issue-id>_<tool>.md` (for example `2026-11-02_shahdp2_S1-007_claude.md`).
- **What to save:** the original prompts and AI responses, including failed approaches, errors, corrections, and dead ends, plus a short note on what was accepted, changed, or rejected.
- **Redact first:** remove secrets, credentials, and personal data before committing a transcript.
- **Assume visibility:** transcripts are committed to the repository, so assume they may be seen by the whole team and the instructor.
- **Link it:** reference the transcript path in the pull request description.
- **Retain** transcripts for the duration of the course project. They are part of the project record and may be reviewed by the instructor.

## 7. When generated code requires additional security review

Any pull request that includes AI-generated code in the areas below needs a second reviewer who specifically checks security, in addition to the normal review:

- **Authentication and sessions.** Any protected backend route must verify the authenticated identity on the server. Hiding frontend controls is not access protection (S1-BR-004).
- **Authorization and ownership.** Any code that reads, writes, updates, or deletes user-owned data must enforce ownership server-side, and cross-user operations must be denied (S1-BR-008). Row Level Security must be enabled on all tables holding user data, and its policies must restrict access to the owning user.
- **Ingestion.** Any code that parses uploaded CSV/JSON or writes review data, including validation, size limits, and ownership of the target.
- **Database access.** SQL, migrations, Row Level Security policies, and any use of a privileged or service-role key.
- **Secrets and configuration.** Environment variables, provider credentials, database credentials, review-service credentials, and anything that could end up in client-side code. `.env` files must be in `.gitignore`. Only values a provider explicitly designs to be public (such as the Supabase anon key, exposed through `NEXT_PUBLIC_` variables) may reach the browser. The Supabase service-role key and the OpenAI key stay server-side only (S1-BR-011).
- **Third-party calls.** Code that calls the OpenAI API or another external service, especially what data is sent.
- **New or upgraded dependencies** with network, file-system, or install-script access.
- **Error handling.** Responses must not leak stack traces, secret keys, or internal diagnostics to the browser.

## Definition of Done (applies equally to AI-generated code)

- [ ] Meets the story's acceptance criteria
- [ ] Reviewed and approved by a teammate other than the author
- [ ] `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass, and the GitHub Actions check "Lint, typecheck, test, build" passes on the PR
- [ ] Security rules S1-BR-004, S1-BR-008, and S1-BR-011 verified where applicable
- [ ] Dependencies and APIs verified against official sources
- [ ] No secrets in source control or client-delivered code
- [ ] AI session transcript saved and linked in the PR (if AI was used)
