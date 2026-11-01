# `src/services` — Server-side business logic

Domain logic and data access live here, not in React components or directly in Route Handlers.
Services are server-only: never import them from a Client Component (`"use client"`).

Planned folders (created by the stories that need them):

| Folder               | Responsibility                                   | Stories          |
| -------------------- | ------------------------------------------------ | ---------------- |
| `auth/`              | Resolve the verified user from the session       | S1-009 – S1-011  |
| `analysis-targets/`  | Create, list, and authorize AnalysisTargets      | S1-012, S1-014 – S1-018 |
| `ingestion/`         | Fetch reviews from the source URL, record attempts | S1-019, S1-020, S1-023 |
| `reviews/`           | Normalize and persist Reviews                    | S1-013, S1-021, S1-022 |

Every service that touches user-owned data must take the authenticated user's identity as input
and enforce ownership itself (S1-BR-007 through S1-BR-010).
