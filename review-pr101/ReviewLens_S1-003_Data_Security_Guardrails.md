# ReviewLens AI - Data and Security Guardrails

CS490 - Fantastic Six  
Sprint 1 - Issue S1-003

## 1. Purpose

ReviewLens AI is a website where users can log in, add a business or product they want to analyze, and collect reviews for it. Later, users will be able to ask AI questions about those reviews. Since different people will be using the website, we need to make sure one user cannot access another user's saved data. This document explains how our team plans to handle security.

## 2. Authentication

We are using Supabase Auth for login and account management. It will handle registration, login, logout, password resets, and user sessions. We are using Next.js with Supabase's server-side authentication tools and cookie-based sessions.

When a user tries to open a protected page or use a protected API, our backend must check that the user is logged in. Just hiding a page or button is not enough. If someone is not logged in, the backend must reject the request. After logging out, the old session should not be able to access protected data.

## 3. User Ownership

Supabase Auth gives each user a unique ID. We will use the verified ID from the user's session to connect their account to their data.

For example, if User A creates an analysis target for a restaurant, that target belongs to User A. The server will set the owner using User A's verified login information. It will not trust an owner ID sent from the browser.

If someone changes the user ID in an API request to User B's ID, that should not give them access to User B's data.

## 4. Data We Need to Protect

Our database will have these main records:

- **AnalysisTarget:** The business, product, or other item a user wants to analyze. It has a name, review platform, source URL, and owner.
- **Review:** The review text, rating, and any useful information from the source. Each review belongs to an AnalysisTarget.
- **IngestionAttempt:** A record of when the website tries to collect reviews and whether it worked or failed. It belongs to an AnalysisTarget. The professor also uses the name **IngestionRun**, so our team should choose one name and use it consistently.

Reviews and ingestion attempts are protected through the AnalysisTarget they belong to. Users should only be able to view, change, delete, or import data for their own targets.

## 5. How We Will Protect the Data

We are using Next.js Route Handlers for our backend and Supabase PostgreSQL for the database.

Before the backend returns reviews, updates a target, deletes data, or starts importing reviews, it must check who is logged in and whether that person owns the target.

We will also use PostgreSQL Row Level Security (RLS). RLS helps make sure users can only read and change records they are allowed to access. We need policies for reading, adding, updating, and deleting data. Reviews and ingestion attempts must follow the ownership of their AnalysisTarget.

We will not use Supabase service-role access for normal user requests because it can bypass RLS. If the server needs special access, it must check permissions first. We cannot depend on frontend checks alone.

In a later sprint, when we add AI questions, the backend must only send reviews from the user's selected target to the AI. It must not send another user's reviews or reviews from a different target.

## 6. Things Developers Should Not Do

- Trust a user ID or owner ID sent from the browser.
- Load everyone's records and only hide other users' data on the frontend.
- Allow API requests without checking login and ownership.
- Let users change or import reviews under someone else's target.
- Turn off RLS just to make database requests work.
- Put secret keys in frontend code or GitHub.
- Send another user's reviews or private keys to an AI tool.
- Show fake reviews when importing reviews fails.

## 7. API Keys and Environment Variables

We will keep private information in server-side environment variables. This includes database passwords, Supabase service-role keys, external review API keys, and OpenAI or other AI provider keys.

We will add an `.env.example` file showing which settings developers need, but it will not contain real keys. Real secrets must not be pushed to GitHub or included in AI transcripts. Supabase public client keys can be used in browser code only when Supabase says they are safe to publish.

Our team has not selected the final external review API yet. Whatever API we use, its private key must stay on the server. Error messages should help users understand what went wrong without showing passwords, keys, or internal details.

## 8. How We Will Test Security

We will use two test accounts, User A and User B, with different analysis targets and reviews.

We need to test that:

1. User A can access their own target and reviews.
2. A person who is not logged in cannot access protected data.
3. User B cannot open User A's target, even if User B knows the target URL or ID.
4. User B cannot update or delete User A's target.
5. User B cannot view or add reviews under User A's target.
6. User B cannot start review ingestion for User A's target.
7. Changing an owner ID in a request does not change who owns the data.
8. RLS blocks cross-user access when using normal authenticated database access.
9. Logging out prevents access to the old protected session.

We will run automated tests and make sure the pull request passes lint checks, the build, and tests. For the Sprint 1 demo, we should show User B trying to access a real target belonging to User A and getting denied by the backend.

## 9. Security for Future Features

When our team adds summaries and AI Q&A in later sprints, we still need to follow these security rules. Every new API, database table, and feature that uses a user's data must check authentication and ownership. We should also review AI-generated code and test it before merging it.

## 10. Conclusion

Our team will use Supabase Auth, Next.js backend checks, and PostgreSQL RLS to protect ReviewLens data. The main rule is simple: users can work with their own analysis targets, reviews, and ingestion records, but not another user's. We will protect secret keys and test that these rules work before calling the feature complete.

This document covers Sprint 1 business rules **S1-BR-001 through S1-BR-011**. The code and tests will still need to prove that the rules work.
