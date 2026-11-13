# ReviewLens UI/UX Standards

This document defines the visual and interaction conventions that each ReviewLens developer must follow. Upon reading this document, any two developers can build pages that are recognizably consistent with each other.

Rules applied to this document:

**S1-BR-003**: Authentication is required for all protected ReviewLens application functionality.  
**S1-BR-015**: Required target information must be validated before the target is accepted.

**S1-BR-025**: Invalid or unusable ingestion input must produce a meaningful application error.

Table of Contents

1. Application navigation
2. Page layout
3. Form conventions
4. Validation and error presentation
5. Loading and processing states
6. Button and action conventions
7. Spacing and typography
8. Reusable component expectations

**1\. Application navigation**  
Pattern: One top navigation bar inside a single AppShell that wraps every protected page (S1-BR-003). No sidebars or a different style on any screen.  
Rules:

1. **AppShell:** AppShell wraps every authenticated page. Contains the top bar and the page content area.
2. **Top bar contents from left to right:** ReviewLens wordmark that links to /analysis-targets, navigation link "My Targets", a primary button "New Target", and, at the far right of the top bar, an account menu showing the signed in email plus a "Sign out" item.
3. **Active context:** When the user is inside a target(/analysis-targets/{targetId})(not including /analysis-targets/new), the page header always shows the target name and platform. The top bar never changes between pages.
4. **Breadcrumbs:** The Target Workspace and Create Target shows a breadcrumb above the page title: (My Targets > {Target name}) or (My Targets > New Target)."My Targets" is a link.
5. **Route map:**

| Screen            | Route                        | Access                                                             |
| :---------------- | :--------------------------- | :----------------------------------------------------------------- |
| Sign In/ Register | /login                       | Public                                                             |
| Home              | /                            | Public. Redirects to /analysis-targets if signed in, /login if not |
| My Targets        | /analysis-targets            | Protected                                                          |
| Create Target     | /analysis-targets/new        | Protected                                                          |
| Target Workspace  | /analysis-targets/{targetId} | Protected                                                          |
| Page not found    | Any other route              | Public                                                             |

6. **Protected-route behavior (S1-BR-003**): An unauthenticated visit to any protected route listed in the route map redirects to /login and after a successful sign-in, returns the user to the originally requested route. The sign-in page shows the neutral notice "Please sign in to continue.". Until the session is resolved, the page shows a loading skeleton and renders no protected data. Route guards such as this are UX conveniences only and the backend independently rejects unauthenticated requests. A 401 or expired session redirects to /login.
7. **Sign out:** The "sign out" menu item on the top bar ends the session and redirects the user to /login. After sign-out, browser Back shows /login and no protected data.
8. **Keyboard actions:** All navigation items are reachable by TAB in visual order, visually represented by a visible focus ring. ENTER or SPACE opens the account menu and closes with escape. "Skip to main content" link is the first focusable element in AppShell.

**2\. Page layout**  
All pages must follow these rules if the page uses components mentioned in this list.  
**/login does not use AppShell and gets a minimal centered layout and form with no top bar.**

1. **Container:** Page content sits in a centered container with max-w-6xl(1152px). Form only pages use max-w-xl.
2. **Vertical structure of every protected page:** top bar, breadcrumb(when it's applicable), page header, and page made of cards.
3. **Page header:** An h1 page title and the primary page action aligned right on desktop.
4. **Target workspace header:** Displays in the order of target name, platform badge, source, and current ingestion status badge.
5. **Workspace body:** Two stacked cards: Ingestion and reviews(ReviewList of persistent reviews). Ingestion is the IngestionPanel with "Start ingestion" action, IngestionStatus, and last run details.
6. **Cards:** shadcn/ui Card with rounded-lg border bg-card shadow-sm, internal padding p-6, card title should be an h2. Cards stack with gap-6. Lists of targets: a responsive grid of TargetCards.
7. **Empty states:** every list has a designed empty state inside its card: An icon, a one sentence explanation and a single primary action. For example "You haven't created any targets yet. Create your first target" for "My Targets".
8. **Responsive:** desktop-first (1280px), usable at 375px. Stack columns, never hide required actions and let wide content scroll inside its own container instead of scrolling the whole page.

**3\. Form conventions**  
Applies to: AuthForm, TargetForm, and any other future form.

1. **Library:** Form built with React Hook Form and shared Zod schemas(or other equivalent), using shadcn/ui Form, Input, Label, and Button. Do not hand-roll form styling.
2. **Layout:** Single column, fields stacked with space-y-4. Label above the input, never placeholder-only labels. Every input has a visible \<label\> bound via htmlFor/id.
3. **Required fields:** marked with a trailing asterisk in the label and described once at the top of the form ("\*Required"). Also set aria-required="true".
4. **Help text:** Muted text-sm text beneath the input linked with aria-describedby.
5. **Field order and Naming for TargetForm:**
   1. **Target name \*:** text input, e.g "NJIT, Newark".
   2. **Review platform:** Shown as a read-only field/badge fixed to Google Maps.
   3. **Google Maps URL \*:** URL input.
6. **Actions:** Primary submit button on the right "Create target", secondary "Cancel" button to its left. Pressing Enter in a field submits the form.
7. **Input behavior:** Trim leading/trailing whitespace before validating. Do not clear the user's input on a failed submit. Autofocus the first invalid field after a failed submit.
8. **Submit protection:**While submitting, the submit button is disabled and shows a spinner so the form cannot be double-submitted.
9. **Success:** After a successful creation, navigate to the new target's workspace, which shows a success alert ("Target created. You can now start ingestion.") at the top of the page. The alert stays in place until the user leaves the page.
10. **AuthForm:** Sign In and Register share one AuthForm component with a clearly labeled toggle. Fields: Email \*, Password\*. Password reset and credential policies sourced from Supabase Auth; the UI only surfaces the outcome of this in plain language.

**4\. Validation and error presentation**  
Validation runs in two places: client for fast feedback and server as authoritative check (per S1-BR-015). The client will never replace the server check and UI must display server validation errors the same way as client ones.

4.1 Target input validation  
A target is rejected and nothing is persisted unless all of these rules are met. These rules are implemented once in a shared schema and re-run on the server.

| Field       | Rule                                                                                                        | Message shown to the user                                                                                                           |
| :---------- | :---------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| Target name | Required, cannot be whitespace, cannot be empty                                                             | "Enter a name for this target."                                                                                                     |
| Target name | Cannot contain unsafe control characters.                                                                   | "Target names can't contain control characters."                                                                                    |
| Target name | Max Length 120                                                                                              | "Target names can be up to 120 characters."                                                                                         |
| Source URL  | Required, cannot be whitespace, cannot be empty.                                                            | "Enter the Google Maps link for this target."                                                                                       |
| Source URL  | Must be a well-formed http(s) URL                                                                           | "That doesn't look like a valid web address. Paste the full link, starting with https\://."                                         |
| Source URL  | Cannot exceed 2,048 characters, including after canonical URL encoding.                                     | "Google Maps links can be up to 2,048 characters."                                                                                  |
| Source URL  | Must correspond to Google Maps. Accepted Google Maps hostnames are defined in the shared validation schema. | "This link isn't a Google Maps link. Open the business in Google Maps and copy its link."                                           |
| Source URL  | Google Maps links must identify a specific business.                                                        | "This Google Maps link doesn't identify a business. Open a specific business and copy its link."                                    |
| Source URL  | Shortened Google Maps links are not supported.                                                              | "Shortened Google Maps links aren't supported yet. Open the full Google Maps URL in your browser and copy it from the address bar." |

4.2 Valid input succeeds and each message above is covered by an automated test for both accepted and rejected input.

Error presentation:

1. **Inline field error:** red text-sm message directly beneath the offending field, linked via aria-describedby, with the input marked aria-invalid="true" and a red border. Each message includes an error icon so color is not the only signal the user sees.
2. **Form-level summary:** If the form has two or more errors, show an alert at the top of the form ("Please fix the highlighted fields.") with role="alert".
3. **Timing:** Validate on submit first, after the first failed submit, re-validate each field on blur and on change. Do not show errors on untouched fields.
4. **Server-side validation errors** arrive as structured field errors and are mapped to the same inline error slots. Never show a raw JSON payload.

4.3 Error categories (as per S1-BR-025) and presentation

| Category                       | Where shown                                        | Example message                                                                                                                                              |
| :----------------------------- | :------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation failure             | Inline under fields                                | See 4.1                                                                                                                                                      |
| Authentication failure         | Alert on /login, or redirect to /login with notice | Bad credentials: "We couldn't sign you in. Check your email and password and try again." Session expiration: "Your session has ended. Please sign in again." |
| Authorization denial           | Full-page error state in the content area          | "This target isn't available to your account. Go back to My Targets." No target data is rendered, and the page does not confirm whether the target exists.   |
| Ingestion failure              | Inline ErrorAlert in the IngestionPanel            | See 4.4                                                                                                                                                      |
| Unexpected application failure | ErrorAlert or full-page error boundary             | "Something went wrong on our side. Please try again in a moment."                                                                                            |

4.4 Ingestion errors (S1-BR-025)

| Situation                         | Message shown to the user                                                                                   | Suggested next step                                          |
| :-------------------------------- | :---------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------- |
| Source URL invalid or unusable    | "We couldn't find reviews at this link. Check that the link opens a Google Maps page."                      | Check the link, or create a new target with a different link |
| Source returned no usable reviews | "No usable reviews were found for this source, so nothing was saved."                                       | Create a new target with a different link                    |
| Provider times out                | "The review service took too long to respond. Please try again."                                            | Retry                                                        |
| Provider quota exhausted          | "Review collection is temporarily unavailable because our usage limit was reached. Please try again later." | Try again later                                              |
| Provider unreachable              | "We couldn't reach the review service. Please try again later."                                             | Retry                                                        |

4.5 Error text rules:  
Plain language, three sentences max, and a next step if applicable. Never display stack traces, database messages, HTTP client exceptions, provider SDK or API error text, internal IDs, or secrets. Technical detail only goes to server logs. A failed ingestion never shows reviews that were not actually collected and previously saved reviews remain visible and unchanged.  
Errors that appear after an action use role="alert" so screen readers announce them. Errors stay in place until the user retries the action or leaves the page; do not auto dismiss errors.

**5\. Loading and processing states**

1. **Page/data loading:** Use shadcn/ui Skeleton placeholders that match the final layout (title bar plus card or grid shapes). Do not use a bare full-page spinner for page loads.
2. **Button/action in progress:** The button is disabled, its label changes to the progressive form ("Creating…", "Starting ingestion..."), and a small spinner appears before the label. Keep the button width stable.
3. **Spinner component:** One shared spinner component. No one builds a second loading indicator
4. **Never leave the user wondering:** Any action that takes more than 500 ms shows a visible processing state and the UI never shows stale success while a new request is running.
5. **Ingestion status model:** IngestionStatus is the single component that renders Ingestion state, using the same badge everywhere (target card, workspace header, ingestion panel):

| State                          | Badge label        | Color        | Panel behavior                                                                                                                                  |
| :----------------------------- | :----------------- | :----------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| No ingestion has occurred      | Not ingested       | Neutral gray | Shows "Start ingestion" as the primary action and a one-line explanation.                                                                       |
| Processing                     | Ingesting          | Blue         | "Start ingestion" is disabled; text states which target and source are being processed; status refreshes automatically until it ends.           |
| Succeeded                      | Ingested           | Green        | Shows the number of reviews saved; ReviewList shows the persisted reviews                                                                       |
| Succeeded with skipped records | Partially ingested | Amber        | Shows saved and skipped counts, explains that only saved reviews enter the dataset, and retains the existing completed-run action restrictions. |
| Failed                         | Failed             | Red          | Shows the ErrorAlert from 4.4 and a "Try again" button, prior data must remain                                                                  |

Partial completion is derived from persisted `succeeded` status with a positive
`skipped_count`; it does not introduce a new database state. The badge requires
`skippedCount` explicitly. Missing, negative, non-integer, or non-finite counts
display "Status unavailable" rather than suggesting complete success. Unavailable
state also displays "Status unavailable" and never implies "Not ingested".

6. **Processing context:** While ingesting, the panel states the active target and source ("Collecting reviews for {target name} from Google Maps…") so the user knows what is happening and where results will go.
7. **Navigating away:** Leaving the workspace during ingestion does not cancel it. Returning shows the current state fetched from the server.
8. **Reduced motion:** Respect prefers-reduced-motion by replacing spinner/skeleton animation with static indicators

**6\. Button and action conventions**

1. **Component:** Use shadcn/ui Button only. Variants: default(primary), outline(Secondary), ghost (tertiary/inline), destructive
2. **One primary action per view region:**A page header or card holds at most one default button. Secondary actions use outline.
3. **Label style:** Sentence case, verb first, specific: "Create target", "Start ingestion", "Try again", "Sign out". Avoid "Submit", "OK", and "Click here".
4. **Placement:** In forms and dialogs, primary action on the right with Cancel to its left. In page headers, the primary page action sits at the right.
5. **Sizing:** Default height 40px, icon only buttons must have an aria-label.
6. **States:** Every button has a distinct hover, focus-visible ring (2px), disabled (reduced opacity, cursor-not-allowed), and loading states.
7. **Disabled actions:** when an action is unavailable, disable it and explain why in nearby text. Do not silently remove actions.
8. **Links vs buttons:** Navigation uses links, actions that change data use buttons. Never use a clickable div.
9. **Destructive actions:** Deleting a target uses destructive styling plus a confirmation dialog naming the target. Do not add it early without approval.
10. **Where actions live:** "New Target" in the top bar only; "Create target" and "Cancel" in TargetForm; "Start ingestion" and "Try again" in IngestionPanel only; "Sign out" in the account menu only.

**7\. Spacing and typography**  
7.1 Typography

1. **Font:** Inter, loaded once through next/font, with the system sans-serif stack as fallback. A monospace stack is allowed only for URLs shown as code, if needed.
2. **Type scale (Tailwind)**

| Use             | Class     | Weight                   |
| :-------------- | :-------- | :----------------------- |
| Page title h1   | text-3xl  | font-semibold            |
| Card title h2   | text-xl   | font-semibold            |
| Sub-heading h3  | text-lg   | font-medium              |
| Body            | text-base | font-normal              |
| Secondary text  | text-sm   | font-normal, muted color |
| Badges, caption | text-xs   | font-medium              |

**Line height:** Use Tailwind defaults paired with each size. Body text maximum line width about 70 characters. Exactly one h1 per page, with headings in order and never skipped for styling reasons.

7.2 Color tokens  
Use only the semantic tokens defined in the Tailwind theme (the shadcn/ui defaults plus success, info, and warning).

| Token                       | Purpose                                                                                        |
| :-------------------------- | :--------------------------------------------------------------------------------------------- |
| Primary                     | Primary buttons, links, focus accents                                                          |
| foreground/muted-foreground | Body and secondary text                                                                        |
| background/card/border      | Surfaces and dividers                                                                          |
| destructive                 | Errors, failed state                                                                           |
| success                     | Succeeded state (a custom token defined in the theme, green)                                   |
| info                        | Processing state (blue)                                                                        |
| warning                     | Partial ingestion (amber), distinct from processing blue; dark-mode value defined in the theme |

Text and interactive elements must meet WCAG AA contrast for user accessibility.  
7.3 Spacing

1. **4px base unit** using the Tailwind spacing scale only. Allowed values are the standard scale(1,1.5,2,3,4,6,8,12,16). No arbitrary values like 13px.
2. **Standard spacing:** Form fields space-y-4; label to input mt-1.5/gap-1.5; card padding p-6; gap between cards gap-6; gap between grid items gap-4; page heading to body mb-6; section separation space-y-8.
3. **Corners and elevation:** rounded-md for inputs and buttons rounded-lg for cards, shadow-sm on cards only.

**8\. Reusable component expectations**  
Rule: Check for an existing component before creating one, and reuse rather than copy to maintain consistency and familiarity. Similar UI must come from the same component. Do not restyle shadcn/ui primitives inside feature code, change the shared component or theme instead.

8.1 Inventory

| Component             | Responsibility                                                                          | Used by                                      |
| :-------------------- | :-------------------------------------------------------------------------------------- | :------------------------------------------- |
| AppShell              | Protected layout: top bar, skip link, content container                                 | All protected pages                          |
| Navigation            | Top bar links, "New Target", account menu                                               | AppShell                                     |
| PageHeader            | Breadcrumb, h1, description, primary action                                             | All protected pages                          |
| AuthForm              | Sign in and register with provider error mapping                                        | /login                                       |
| TargetForm            | Create-target fields and validation (shared schema)                                     | /analysis-targets/new                        |
| TargetCard            | Name, platform badge, truncated source URL, status badge, "Open" link                   | My Targets                                   |
| IngestionPanel        | Start/retry ingestion action, processing text, errors, last-run counts                  | Target Workspace                             |
| IngestionStatus       | Shared badge for persisted ingestion states, partial completion, and unavailable status | TargetCard, workspace header, IngestionPanel |
| ReviewList            | Persisted reviews: rating, review text, optional reviewer name and date                 | Target Workspace                             |
| EmptyState            | Icon, explanation, single action                                                        | Any empty list                               |
| ErrorState/ErrorAlert | Full-page and inline errors by category (as per section 4.3)                            | Everywhere                                   |
| Spinner/Skeleton      | Loading indicators(as per section 5\)                                                   | Everywhere                                   |
