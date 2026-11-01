# `src/components/ui` — UI primitives

Reserved for shadcn/ui primitives (Button, Input, Dialog, and so on). shadcn/ui copies component
source into this folder instead of installing a runtime package.

shadcn/ui is not initialized yet. The first story that needs a primitive should run
`npx shadcn@latest init`, add only the components it uses, and commit the resulting
`components.json` and component files.

Feature-specific components go in sibling folders such as `src/components/analysis-targets/`,
and components shared across features go in `src/components/shared/`.
