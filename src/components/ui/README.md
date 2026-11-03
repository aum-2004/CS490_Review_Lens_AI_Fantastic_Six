# `src/components/ui` — UI primitives

Reserved for shadcn/ui primitives (Button, Input, Dialog, and so on). shadcn/ui copies component
source into this folder instead of installing a runtime package.

S1-009 manually establishes `components.json` and the Button, Input, Label, Form, and Card
primitives following shadcn/ui's composition patterns. Components use PascalCase filenames
to follow S1-001. Radix primitives are imported through the approved `radix-ui` package.
The Button and Input follow the official shadcn/ui source, adapted for the team's 40px
height and two-pixel focus ring. Form composes React Hook Form and Radix Slot/Label.
Theme tokens live in `src/app/globals.css`; the existing Geist font remains pending a
separate decision about the S1-002 Inter requirement.

Reuse these primitives; add variants here instead of duplicating form styles in features.
If using the shadcn CLI later, account for its lowercase filenames so it does not generate
duplicate components beside these PascalCase files. Running the CLI is not required for setup.

Feature-specific components go in sibling folders such as `src/components/analysis-targets/`,
and components shared across features go in `src/components/shared/`.
